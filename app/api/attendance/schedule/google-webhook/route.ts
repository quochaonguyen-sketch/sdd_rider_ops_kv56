import { NextResponse } from "next/server";
import { z } from "zod";
import { invalidateAttendanceCache } from "@/lib/cache/operations-cache";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const statusSchema = z.enum([
  "ON", "OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED", "WORKING_REST_DAY", "NO_PICKUP", "NO_DELIVERY",
]);
const bodySchema = z.object({
  spreadsheet_id: z.string().trim().min(1).max(200),
  records: z.array(z.object({
    rider_code: z.string().trim().min(1).max(100),
    work_date: dateSchema,
    status: statusSchema,
  })).min(1).max(100),
});

export async function POST(request: Request) {
  const secret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-attendance-sheet-secret") !== secret) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Dữ liệu Google Sheet không hợp lệ" }, { status: 400 });

  const recordsByKey = new Map(parsed.data.records.map((item) => [`${item.rider_code}|${item.work_date}`, item]));
  const records = [...recordsByKey.values()];
  const admin = createAdminClient();
  const codes = [...new Set(records.map((item) => item.rider_code))];
  const { data: riders, error: riderError } = await admin.from("riders").select("id,rider_code").in("rider_code", codes);
  if (riderError) return NextResponse.json({ success: false, error: riderError.message }, { status: 500 });
  const riderIds = new Map((riders ?? []).map((rider) => [rider.rider_code, rider.id]));
  const missingRiderCodes = codes.filter((code) => !riderIds.has(code));

  const upserts = records.filter((item) => item.status !== "ON" && riderIds.has(item.rider_code)).map((item) => ({
    rider_id: riderIds.get(item.rider_code),
    rider_code: item.rider_code,
    work_date: item.work_date,
    status: item.status,
    raw_data: { source: "google_sheet_webhook", spreadsheet_id: parsed.data.spreadsheet_id, received_at: new Date().toISOString() },
  }));
  if (upserts.length) {
    const { error } = await admin.from("attendance_logs").upsert(upserts, { onConflict: "rider_code,work_date" });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  const clears = records.filter((item) => item.status === "ON" && riderIds.has(item.rider_code));
  for (const item of clears) {
    const { error } = await admin.from("attendance_logs").delete().eq("rider_code", item.rider_code).eq("work_date", item.work_date);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  records.forEach((item) => invalidateAttendanceCache(item.work_date.slice(0, 7)));
  await admin.from("activity_logs").insert({
    entity_type: "attendance_schedule",
    action: "google_webhook_synced",
    message: `Received ${upserts.length + clears.length} attendance updates from Google Sheet`,
    raw_data: { spreadsheet_id: parsed.data.spreadsheet_id, imported: upserts.length, cleared: clears.length, missing_rider_codes: missingRiderCodes },
  });
  return NextResponse.json({ success: true, imported: upserts.length, cleared: clears.length, missing_rider_codes: missingRiderCodes });
}
