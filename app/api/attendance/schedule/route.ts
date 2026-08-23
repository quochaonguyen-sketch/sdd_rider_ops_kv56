import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth/permissions";
import { getCachedAttendanceSchedule, getCachedRiders, invalidateAttendanceCache } from "@/lib/cache/operations-cache";
import {
  processAttendanceSheetSync,
} from "@/lib/google/attendance-sheet-sync";
import type { Rider } from "@/types";

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const scheduleStatusSchema = z.enum([
  "",
  "ON",
  "OFF_WEEKLY",
  "OFF_APPROVED",
  "OFF_UNEXPECTED",
  "WORKING_REST_DAY",
  "NO_PICKUP",
  "NO_DELIVERY",
]);

const updateSchema = z.object({
  sheet_url: z.string().trim().max(1000).optional().nullable(),
  updates: z
    .array(
      z.object({
        rider_id: z.string().uuid(),
        work_date: dateSchema,
        status: scheduleStatusSchema,
        shift: z.string().trim().max(50).optional().nullable(),
        note: z.string().trim().max(500).optional().nullable(),
      }),
    )
    .min(1)
    .max(1000),
});

async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { user, role: profile?.role ?? "viewer", admin };
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

async function fetchAll<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const month = new URL(request.url).searchParams.get("month");
  const parsedMonth = monthSchema.safeParse(month);
  if (!parsedMonth.success) {
    return NextResponse.json({ success: false, error: "Tháng không hợp lệ" }, { status: 400 });
  }

  const { start, end } = monthRange(parsedMonth.data);

  try {
    const { data, cache } = await getCachedAttendanceSchedule(parsedMonth.data, async () => {
      const [{ data: riders }, logs] = await Promise.all([
        getCachedRiders(),
        fetchAll((from, to) =>
          session.admin
            .from("attendance_logs")
            .select("*")
            .gte("work_date", start)
            .lte("work_date", end)
            .neq("status", "ON")
            .order("updated_at", { ascending: false })
            .range(from, to),
        ),
      ]);

      return { riders: [...riders].sort(compareScheduleRiders), logs };
    });

    return NextResponse.json({
      success: true,
      can_edit: canManageOperations(session.role),
      riders: data.riders,
      logs: data.logs,
      cache,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Không thể tải lịch rider" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageOperations(session.role)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền sửa lịch rider" }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Dữ liệu lịch không hợp lệ", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const riderIds = Array.from(new Set(parsed.data.updates.map((item) => item.rider_id)));
  const { data: riders, error: riderError } = await session.admin
    .from("riders")
    .select("id,rider_code,full_name")
    .in("id", riderIds);

  if (riderError) {
    return NextResponse.json({ success: false, error: riderError.message }, { status: 400 });
  }

  const riderCodes = new Map((riders ?? []).map((rider) => [rider.id, rider.rider_code]));
  if (riderCodes.size !== riderIds.length) {
    return NextResponse.json({ success: false, error: "Có rider không tồn tại" }, { status: 400 });
  }

  const clearItems = parsed.data.updates.filter((item) => !item.status || item.status === "ON");
  const upsertItems = parsed.data.updates
    .filter((item) => item.status && item.status !== "ON")
    .map((item) => ({
      rider_id: item.rider_id,
      rider_code: riderCodes.get(item.rider_id),
      work_date: item.work_date,
      status: item.status,
      shift: item.shift?.trim() || null,
      note: item.note?.trim() || null,
      raw_data: {
        source: "schedule_ui",
        status: item.status,
      },
    }));

  for (const item of clearItems) {
    const riderCode = riderCodes.get(item.rider_id);
    const { error } = await session.admin
      .from("attendance_logs")
      .delete()
      .eq("rider_code", riderCode)
      .eq("work_date", item.work_date);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
  }

  let updatedLogs: unknown[] = [];
  if (upsertItems.length > 0) {
    const { data, error } = await session.admin
      .from("attendance_logs")
      .upsert(upsertItems, { onConflict: "rider_code,work_date" })
      .select("*");
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    updatedLogs = data ?? [];
  }

  // Populate outbox for Google Sheets sync
  const outboxRows: Array<{
    rider_code: string;
    work_date: string;
    attendance_status: string;
    operation: "UPSERT" | "CLEAR";
  }> = [];

  for (const item of upsertItems) {
    outboxRows.push({
      rider_code: item.rider_code,
      work_date: item.work_date,
      attendance_status: item.status,
      operation: "UPSERT",
    });
  }
  for (const item of clearItems) {
    outboxRows.push({
      rider_code: riderCodes.get(item.rider_id) ?? "",
      work_date: item.work_date,
      attendance_status: "ON",
      operation: "CLEAR",
    });
  }

  if (outboxRows.length > 0) {
    const { error: outboxError } = await session.admin
      .from("attendance_sheet_sync_outbox")
      .insert(outboxRows.map((row) => ({
        ...row,
        state: "PENDING",
        attempts: 0,
        next_attempt_at: new Date().toISOString(),
      })));
    if (outboxError) {
      console.error("Failed to populate sync outbox:", outboxError);
    }
  }

  const sheetSync = await processAttendanceSheetSync(300, parsed.data.sheet_url);

  await session.admin.from("activity_logs").insert({
    entity_type: "attendance_schedule",
    action: "updated",
    message: `Updated ${parsed.data.updates.length} rider schedule cells`,
    raw_data: {
      count: parsed.data.updates.length,
      dates: Array.from(new Set(parsed.data.updates.map((item) => item.work_date))),
      google_sheet: sheetSync,
    },
  });

  parsed.data.updates.forEach((item) => invalidateAttendanceCache(item.work_date.slice(0, 7)));

  return NextResponse.json({
    success: true,
    logs: updatedLogs,
    cleared: clearItems.map((item) => ({
      rider_id: item.rider_id,
      work_date: item.work_date,
    })),
    sheet_sync: sheetSync,
  });
}

function compareScheduleRiders(a: Rider, b: Rider) {
  return (
    String(a.kv ?? "").localeCompare(String(b.kv ?? ""), "vi") ||
    String(a.cot ?? "").localeCompare(String(b.cot ?? ""), "vi", { numeric: true }) ||
    String(a.full_name ?? a.rider_code).localeCompare(String(b.full_name ?? b.rider_code), "vi")
  );
}
