import { createAdminClient } from "@/lib/supabase/admin";

type RiderRow = { id: string; rider_code: string; full_name: string | null; delivery_district: string | null; status: string | null };
type AttendanceRow = { rider_code: string; status: string; shift: string | null; note: string | null; raw_data: Record<string, unknown> | null };
type RealtimeRow = { driver_id: string; total_assigned: number; snapshot_id: string; snapshot_at: string };

const OFF_STATUSES = new Set(["OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED"]);

export async function reconcileDailyViolations(workDate: string) {
  const admin = createAdminClient();
  const [ridersResult, attendanceResult, realtimeResult] = await Promise.all([
    admin.from("riders").select("id,rider_code,full_name,delivery_district,status").eq("status", "active"),
    admin.from("attendance_logs").select("rider_code,status,shift,note,raw_data").eq("work_date", workDate),
    admin.from("realtime_delivery_riders").select("driver_id,total_assigned,snapshot_id,snapshot_at").eq("work_date", workDate).order("snapshot_at", { ascending: false }),
  ]);
  const firstError = ridersResult.error ?? attendanceResult.error ?? realtimeResult.error;
  if (firstError) throw new Error(firstError.message);
  const realtimeRows = (realtimeResult.data ?? []) as RealtimeRow[];
  const latestSnapshot = realtimeRows[0]?.snapshot_id;
  if (!latestSnapshot) throw new Error(`Không có snapshot realtime ngày ${workDate}; dừng đối soát để tránh ghi sai hàng loạt.`);

  const riders = (ridersResult.data ?? []) as RiderRow[];
  const attendance = new Map(((attendanceResult.data ?? []) as AttendanceRow[]).map((item) => [normalize(item.rider_code), item]));
  const realtime = new Map(realtimeRows.filter((item) => item.snapshot_id === latestSnapshot).map((item) => [normalize(item.driver_id), item]));
  const attendanceUpdates: Array<Record<string, unknown>> = [];
  const violations: Array<Record<string, unknown>> = [];

  for (const rider of riders) {
    const schedule = attendance.get(normalize(rider.rider_code));
    const realtimeRider = realtime.get(normalize(rider.rider_code));
    const assigned = realtimeRider?.total_assigned ?? 0;
    const scheduledStatus = schedule?.status?.toUpperCase() ?? "ON";
    const scheduledOff = OFF_STATUSES.has(scheduledStatus);
    if (!scheduledOff && assigned <= 0) {
      const note = "Tự động 20:00: Có lịch làm nhưng không có đơn được phân trong snapshot realtime cuối ngày.";
      attendanceUpdates.push(attendancePayload(rider, workDate, "OFF_UNEXPECTED", schedule, note));
      violations.push(violationPayload(rider, workDate, "OFF_UNEXPECTED", "HIGH", note, assigned, latestSnapshot));
    } else if (scheduledOff && assigned > 0) {
      const note = `Tự động 20:00: Lịch ${scheduledStatus} nhưng có ${assigned} đơn được phân trong realtime.`;
      attendanceUpdates.push(attendancePayload(rider, workDate, "WORKING_REST_DAY", schedule, note));
      violations.push(violationPayload(rider, workDate, "WORKING_REST_DAY", "MEDIUM", note, assigned, latestSnapshot));
    }
  }

  if (attendanceUpdates.length) {
    const { error } = await admin.from("attendance_logs").upsert(attendanceUpdates, { onConflict: "rider_code,work_date" });
    if (error) throw new Error(error.message);
  }
  if (violations.length) {
    const { error } = await admin.from("rider_violations").upsert(violations, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  await admin.from("activity_logs").insert({ entity_type: "rider_violation", action: "daily_reconciled", message: `Reconciled ${workDate}: ${violations.length} violations`, raw_data: { work_date: workDate, snapshot_id: latestSnapshot, violations: violations.length } });
  return { workDate, snapshotId: latestSnapshot, attendanceUpdated: attendanceUpdates.length, violationsCreated: violations.length };
}

function attendancePayload(rider: RiderRow, workDate: string, status: string, previous: AttendanceRow | undefined, note: string) { return { rider_id: rider.id, rider_code: rider.rider_code, work_date: workDate, status, shift: previous?.shift ?? null, note, raw_data: { ...(previous?.raw_data ?? {}), source: "daily_violation_reconciliation", previous_status: previous?.status ?? "ON", reconciled_at: new Date().toISOString() } }; }
function violationPayload(rider: RiderRow, workDate: string, type: string, severity: string, note: string, assigned: number, snapshotId: string) { return { rider_id: rider.id, rider_code: rider.rider_code, rider_name: rider.full_name, work_date: workDate, violation_type: type, severity, zone: rider.delivery_district, note, status: "OPEN", source: "daily_20h_reconciliation", dedupe_key: `${workDate}:${normalize(rider.rider_code)}:${type}:daily_20h`, raw_data: { total_assigned: assigned, snapshot_id: snapshotId } }; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim(); }
