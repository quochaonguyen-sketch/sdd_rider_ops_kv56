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
import { wardKey } from "@/lib/pickup/recommendations";

export const runtime = "nodejs";

const HISTORY_WEEKS = 8;

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

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
}

async function loadLatestPickupWardVolume(
  admin: ReturnType<typeof createAdminClient>,
) {
  try {
    const { data: latest } = await admin
      .from("pickup_volume")
      .select("report_date")
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest?.report_date) return { data: [], error: null };
    return admin
      .from("pickup_volume")
      .select("district,new_ward,total_orders")
      .eq("report_date", latest.report_date)
      .limit(10_000);
  } catch {
    return { data: [], error: null };
  }
}

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
  const historyStart = shiftDate(start, -7 * HISTORY_WEEKS);
  const [{ data, error }, { data: riders, error: riderError }, historyQuery, volumeQuery] = await Promise.all([
    auth.admin
      .from("pickup_replacements")
      .select("*")
      .gte("work_date", start)
      .lte("work_date", end)
      .order("work_date"),
    auth.admin.from("riders").select("id,rider_code,full_name").eq("status", "active"),
    auth.admin
      .from("pickup_replacements")
      .select("rider_code,replacement_rider_code")
      .gte("work_date", historyStart)
      .lte("work_date", end)
      .eq("status", "ASSIGNED"),
    loadLatestPickupWardVolume(auth.admin),
  ]);
  if (error || riderError) {
    return NextResponse.json({ success: false, error: (error ?? riderError)?.message }, { status: 400 });
  }

  const historyCounts = new Map<string, number>();
  for (const row of (historyQuery.data ?? []) as Array<{
    rider_code: string;
    replacement_rider_code: string | null;
  }>) {
    if (!row.replacement_rider_code) continue;
    const key = `${row.rider_code}|${row.replacement_rider_code}`;
    historyCounts.set(key, (historyCounts.get(key) ?? 0) + 1);
  }

  const wardVolume = new Map<string, number>();
  for (const row of (volumeQuery.data ?? []) as Array<{
    district: string | null;
    new_ward: string | null;
    total_orders: number | null;
  }>) {
    const key = wardKey(row.district, row.new_ward);
    if (!key) continue;
    wardVolume.set(key, (wardVolume.get(key) ?? 0) + Number(row.total_orders ?? 0));
  }

  const databaseRows = (data ?? []) as ReplacementRow[];
  const riderRows = (riders ?? []) as RiderIdentity[];
  const riderByCode = new Map(riderRows.map((rider) => [rider.rider_code, rider]));
  const riderByNormalizedName = new Map(
    riderRows
      .filter((rider) => normalizeName(rider.full_name))
      .map((rider) => [normalizeName(rider.full_name), rider]),
  );
  const merged = new Map(databaseRows.map((item) => [`${item.rider_code}|${item.work_date}`, item]));
  let sheetSync:
    | { success: true; spreadsheet_id: string; imported: number; skipped: number }
    | { success: false; error: string };

  try {
    const spreadsheetId = resolveOffScheduleSpreadsheetId();
    if (!spreadsheetId) throw new Error("Chưa cấu hình Google Sheet Khu 5-6");
    const sheetRows = await readPickupReplacementsFromGoogleSheet(
      spreadsheetId,
      historyStart,
      end,
      AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]),
    );
    let imported = 0;
    let skipped = 0;
    const sheetHistoryCounts = new Map<string, number>();
    for (const item of sheetRows) {
      const rider = riderByCode.get(item.rider_code);
      if (!rider) {
        skipped += 1;
        continue;
      }
      const replacementCode =
        item.replacement_rider_code ??
        riderByNormalizedName.get(normalizeName(item.replacement_rider_name))?.rider_code ??
        null;
      if (replacementCode && item.work_date < start) {
        const historyKey = `${item.rider_code}|${replacementCode}`;
        sheetHistoryCounts.set(historyKey, (sheetHistoryCounts.get(historyKey) ?? 0) + 1);
      }
      if (item.work_date < start || item.work_date > end) continue;
      const key = `${item.rider_code}|${item.work_date}`;
      const current = merged.get(key);
      const replacement = replacementCode ? riderByCode.get(replacementCode) : null;
      merged.set(key, {
        id: current?.id ?? `sheet:${key}`,
        rider_id: rider.id,
        rider_code: rider.rider_code,
        work_date: item.work_date,
        replacement_rider_id: replacement?.id ?? null,
        replacement_rider_code: replacementCode,
        status: replacementCode ? "ASSIGNED" : "MISSING",
        note: replacementCode ? null : "Chưa có pick thay",
      });
      imported += 1;
    }
    if (sheetHistoryCounts.size > 0) {
      historyCounts.clear();
      for (const [key, count] of sheetHistoryCounts) historyCounts.set(key, count);
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
    recommendation: {
      history: Object.fromEntries(historyCounts),
      ward_volume: Object.fromEntries(wardVolume),
    },
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