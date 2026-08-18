import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolveOffScheduleSpreadsheetId,
  syncScheduleUpdatesToGoogleSheet,
  type GoogleScheduleStatus,
} from "@/lib/google/off-schedule";

type OutboxRow = {
  id: string;
  rider_code: string;
  work_date: string;
  attendance_status: GoogleScheduleStatus;
  operation: "UPSERT" | "CLEAR";
  attempts: number;
};

export type AttendanceSheetSyncResult = {
  success: boolean;
  queued: number;
  synced: number;
  error?: string;
};

const MAX_ATTEMPTS = 8;

function retryAt(attempt: number) {
  const minutes = Math.min(60, 2 ** Math.min(attempt, 6));
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/**
 * Delivers the latest change for each rider/day. Earlier events are marked
 * synced as superseded, which keeps the queue small without losing the final
 * attendance state.
 */
export async function processAttendanceSheetSync(
  limit = 300,
  sheetUrl?: string | null,
): Promise<AttendanceSheetSyncResult> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("attendance_sheet_sync_outbox")
    .select("id,rider_code,work_date,attendance_status,operation,attempts")
    .in("state", ["PENDING", "FAILED"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as OutboxRow[];
  if (!rows.length) return { success: true, queued: 0, synced: 0 };

  const rowIds = rows.map((row) => row.id);
  const { error: lockingError } = await admin
    .from("attendance_sheet_sync_outbox")
    .update({ state: "PROCESSING" })
    .in("id", rowIds)
    .in("state", ["PENDING", "FAILED"]);
  if (lockingError) throw new Error(lockingError.message);

  const latestByKey = new Map<string, OutboxRow>();
  rows.forEach((row) => latestByKey.set(`${row.rider_code}|${row.work_date}`, row));
  const latest = [...latestByKey.values()];
  const riderCodes = [...new Set(latest.map((row) => row.rider_code))];
  const { data: riders, error: riderError } = await admin
    .from("riders")
    .select("rider_code,full_name")
    .in("rider_code", riderCodes);
  if (riderError) throw new Error(riderError.message);
  const riderNames = new Map((riders ?? []).map((rider) => [rider.rider_code, rider.full_name ?? ""]));

  try {
    const spreadsheetId = resolveOffScheduleSpreadsheetId(sheetUrl);
    if (!spreadsheetId) throw new Error("Chưa cấu hình OFF_SCHEDULE_SPREADSHEET_ID trên máy chủ");
    await syncScheduleUpdatesToGoogleSheet(spreadsheetId, latest.map((row) => ({
      rider_code: row.rider_code,
      rider_name: riderNames.get(row.rider_code) ?? "",
      work_date: String(row.work_date).slice(0, 10),
      status: row.operation === "CLEAR" ? "ON" : row.attendance_status,
    })));
    const { error: completeError } = await admin
      .from("attendance_sheet_sync_outbox")
      .update({ state: "SYNCED", synced_at: new Date().toISOString(), last_error: null })
      .in("id", rowIds);
    if (completeError) throw new Error(completeError.message);
    return { success: true, queued: rows.length, synced: latest.length };
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Không thể đồng bộ Google Sheet";
    await Promise.all(rows.map((row) => admin
      .from("attendance_sheet_sync_outbox")
      .update({
        state: row.attempts + 1 >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
        attempts: row.attempts + 1,
        next_attempt_at: retryAt(row.attempts + 1),
        last_error: message.slice(0, 1000),
      })
      .eq("id", row.id)));
    return { success: false, queued: rows.length, synced: 0, error: message };
  }
}
