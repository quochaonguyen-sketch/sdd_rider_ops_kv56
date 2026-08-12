import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canAccessPickupManagement } from "@/lib/auth/permissions";
import { resolveOffScheduleSpreadsheetId } from "@/lib/google/off-schedule";
import {
  readPickupReplacementsFromGoogleSheet,
  syncPickupReplacementToGoogleSheet,
} from "@/lib/google/pickup-replacements";

export const runtime = "nodejs";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const unavailablePickupStatuses = ["OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED", "NO_PICKUP"] as const;
const updateSchema = z.object({
  rider_id: z.string().uuid(),
  rider_code: z.string().trim().min(1),
  work_date: dateSchema,
  replacement_rider_id: z.string().uuid().nullable(),
  replacement_rider_code: z.string().trim().nullable(),
  status: z.enum(["ASSIGNED", "MISSING"]),
  note: z.string().max(500).nullable().optional(),
});

type ReplacementRow = {
  id: string;
  rider_id: string;
  rider_code: string;
  work_date: string;
  replacement_rider_id: string | null;
  replacement_rider_code: string | null;
  status: "ASSIGNED" | "MISSING";
  note: string | null;
};

type RiderIdentity = {
  id: string;
  rider_code: string;
  full_name: string | null;
};

async function session() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { user, role: profile?.role ?? "viewer", admin };
}

export async function GET(request: Request) {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canAccessPickupManagement(auth.role)) {
    return NextResponse.json({ success: false, error: "Không có quyền xem Pickup Management" }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsedRange = z.object({ start: dateSchema, end: dateSchema }).safeParse({
    start: url.searchParams.get("start"),
    end: url.searchParams.get("end"),
  });
  if (!parsedRange.success || parsedRange.data.start > parsedRange.data.end) {
    return NextResponse.json({ success: false, error: "Khoảng ngày không hợp lệ" }, { status: 400 });
  }

  const { start, end } = parsedRange.data;
  const [{ data, error }, { data: riders, error: riderError }] = await Promise.all([
    auth.admin
      .from("pickup_replacements")
      .select("*")
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date"),
    auth.admin.from("riders").select("id,rider_code,full_name").eq("status", "active"),
  ]);
  if (error || riderError) {
    return NextResponse.json({ success: false, error: (error ?? riderError)?.message }, { status: 400 });
  }

  const databaseRows = (data ?? []) as ReplacementRow[];
  const riderRows = (riders ?? []) as RiderIdentity[];
  const riderByCode = new Map(riderRows.map((rider) => [rider.rider_code, rider]));
  const merged = new Map(databaseRows.map((item) => [`${item.rider_code}|${item.work_date}`, item]));
  let sheetSync:
    | { success: true; spreadsheet_id: string; imported: number; skipped: number }
    | { success: false; error: string };

  try {
    const spreadsheetId = resolveOffScheduleSpreadsheetId();
    if (!spreadsheetId) throw new Error("Chưa cấu hình Google Sheet Khu 5-6");
    const sheetRows = await readPickupReplacementsFromGoogleSheet(
      spreadsheetId,
      start,
      end,
      AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
    );
    let imported = 0;
    let skipped = 0;
    for (const item of sheetRows) {
      const rider = riderByCode.get(item.rider_code);
      if (!rider) {
        skipped += 1;
        continue;
      }
      const key = `${item.rider_code}|${item.work_date}`;
      const current = merged.get(key);
      const replacement = item.replacement_rider_code
        ? riderByCode.get(item.replacement_rider_code)
        : null;
      merged.set(key, {
        id: current?.id ?? `sheet:${key}`,
        rider_id: rider.id,
        rider_code: rider.rider_code,
        work_date: item.work_date,
        replacement_rider_id: replacement?.id ?? null,
        replacement_rider_code: item.replacement_rider_code,
        status: item.replacement_rider_code ? "ASSIGNED" : "MISSING",
        note: item.replacement_rider_code ? null : "Chưa có pick thay",
      });
      imported += 1;
    }
    sheetSync = { success: true, spreadsheet_id: spreadsheetId, imported, skipped };
  } catch (sheetError) {
    sheetSync = {
      success: false,
      error: sheetError instanceof Error ? sheetError.message : "Không thể đọc Google Sheet",
    };
  }

  return NextResponse.json({
    success: true,
    can_edit: auth.role === "admin" || auth.role === "leader",
    replacements: Array.from(merged.values()).sort((a, b) => a.work_date.localeCompare(b.work_date)),
    sheet_sync: sheetSync,
  });
}

export async function PUT(request: Request) {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canAccessPickupManagement(auth.role)) {
    return NextResponse.json({ success: false, error: "Không có quyền xem Pickup Management" }, { status: 403 });
  }
  if (auth.role !== "admin" && auth.role !== "leader") {
    return NextResponse.json({ success: false, error: "Không có quyền cập nhật" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const riderIds = [parsed.data.rider_id, parsed.data.replacement_rider_id].filter(
    (id): id is string => Boolean(id),
  );
  const { data: riders, error: riderError } = await auth.admin
    .from("riders")
    .select("id,rider_code,full_name")
    .in("id", riderIds)
    .eq("status", "active");
  if (riderError) return NextResponse.json({ success: false, error: riderError.message }, { status: 400 });

  const riderById = new Map(((riders ?? []) as RiderIdentity[]).map((rider) => [rider.id, rider]));
  const rider = riderById.get(parsed.data.rider_id);
  const replacement = parsed.data.replacement_rider_id
    ? riderById.get(parsed.data.replacement_rider_id)
    : null;
  if (!rider || rider.rider_code !== parsed.data.rider_code) {
    return NextResponse.json({ success: false, error: "Rider cần thay không hợp lệ" }, { status: 400 });
  }
  if (parsed.data.status === "ASSIGNED" && (!replacement || replacement.rider_code !== parsed.data.replacement_rider_code)) {
    return NextResponse.json({ success: false, error: "Rider pick thay không hợp lệ" }, { status: 400 });
  }

  if (replacement) {
    const { data: unavailableLog, error: attendanceError } = await auth.admin
      .from("attendance_logs")
      .select("status")
      .eq("rider_code", replacement.rider_code)
      .eq("work_date", parsed.data.work_date)
      .in("status", [...unavailablePickupStatuses])
      .maybeSingle();
    if (attendanceError) {
      return NextResponse.json({ success: false, error: attendanceError.message }, { status: 400 });
    }
    if (unavailableLog) {
      return NextResponse.json(
        { success: false, error: `Rider ${replacement.rider_code} đang OFF hoặc không đi pick ngày ${parsed.data.work_date}.` },
        { status: 409 },
      );
    }
  }

  const payload = {
    rider_id: rider.id,
    rider_code: rider.rider_code,
    work_date: parsed.data.work_date,
    replacement_rider_id: replacement?.id ?? null,
    replacement_rider_code: replacement?.rider_code ?? null,
    status: parsed.data.status,
    note: parsed.data.note?.trim() || null,
  };
  const { data, error } = await auth.admin
    .from("pickup_replacements")
    .upsert(payload, { onConflict: "rider_code,work_date" })
    .select("*")
    .single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  let sheetSync:
    | { success: true; spreadsheet_id: string; row_numbers: number[]; verified: boolean }
    | { success: false; error: string };
  try {
    const spreadsheetId = resolveOffScheduleSpreadsheetId();
    if (!spreadsheetId) throw new Error("Chưa cấu hình Google Sheet Khu 5-6");
    const result = await syncPickupReplacementToGoogleSheet({
      spreadsheetId,
      riderCode: rider.rider_code,
      workDate: parsed.data.work_date,
      replacementRiderName: replacement?.full_name?.trim() || null,
      replacementRiderCode: replacement?.rider_code ?? null,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
    });
    sheetSync = { success: true, ...result };
  } catch (sheetError) {
    sheetSync = {
      success: false,
      error: sheetError instanceof Error ? sheetError.message : "Không thể đồng bộ Google Sheet",
    };
  }

  await auth.admin.from("activity_logs").insert({
    entity_type: "pickup_replacement",
    entity_id: data.id,
    action: "updated",
    message: `Updated pickup replacement ${rider.rider_code}|${parsed.data.work_date}`,
    raw_data: { sheet_sync: sheetSync },
  });

  return NextResponse.json({ success: true, replacement: data, sheet_sync: sheetSync });
}
