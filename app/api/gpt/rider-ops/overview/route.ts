import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  auditGptRead,
  authorizeGptAction,
  gptJson,
  isCot1,
} from "@/lib/gpt-actions/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

type RiderRow = {
  id: string;
  rider_code: string;
  kv: string | null;
  cot: string | null;
  pickup_district: string | null;
  pickup_ward: string | null;
  delivery_district: string | null;
  status: string | null;
};

type AttendanceRow = {
  rider_id: string | null;
  rider_code: string;
  status: string;
};

type AssignmentRow = {
  rider_id: string;
  checked_in_at: string | null;
};

type RealtimeRow = {
  driver_id: string;
  total_assigned: number;
  delivered: number;
  delivering: number;
  failed: number;
};

const absentStatuses = new Set(["OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED"]);

function groupCounts(rows: RiderRow[], field: "kv" | "cot" | "delivery_district") {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = row[field]?.trim() || "Chưa gán";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts, ([label, count]) => ({ label, count })).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "vi"),
  );
}

function statusCounts(rows: AttendanceRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = row.status?.trim() || "UNKNOWN";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return Array.from(counts, ([status, count]) => ({ status, count })).sort(
    (a, b) => b.count - a.count || a.status.localeCompare(b.status),
  );
}

export async function GET(request: Request) {
  const auth = authorizeGptAction(request);
  if (!auth.ok) return auth.response;

  const workDate = new URL(request.url).searchParams.get("date");
  const parsedDate = dateSchema.safeParse(workDate);
  if (!parsedDate.success) {
    return gptJson(
      { success: false, error: "date must use a valid YYYY-MM-DD value" },
      400,
    );
  }

  try {
    const admin = createAdminClient();
    const [riderResult, attendanceResult, assignmentResult, absenceNoteResult, latestRealtimeResult] =
      await Promise.all([
        admin
          .from("riders")
          .select("id,rider_code,kv,cot,pickup_district,pickup_ward,delivery_district,status")
          .order("rider_code"),
        admin
          .from("attendance_logs")
          .select("rider_id,rider_code,status")
          .eq("work_date", parsedDate.data),
        admin
          .from("morning_delivery_assignments")
          .select("rider_id,checked_in_at")
          .eq("work_date", parsedDate.data),
        admin
          .from("morning_delivery_absence_notes")
          .select("rider_id,is_excused")
          .eq("work_date", parsedDate.data),
        admin
          .from("realtime_delivery_riders")
          .select("snapshot_id,snapshot_at")
          .eq("work_date", parsedDate.data)
          .order("snapshot_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const firstError =
      riderResult.error ??
      attendanceResult.error ??
      assignmentResult.error ??
      absenceNoteResult.error ??
      latestRealtimeResult.error;
    if (firstError) throw new Error(firstError.message);

    const riders = (riderResult.data ?? []) as RiderRow[];
    const attendance = (attendanceResult.data ?? []) as AttendanceRow[];
    const assignments = (assignmentResult.data ?? []) as AssignmentRow[];
    const activeRiders = riders.filter((rider) => rider.status === "active");
    const inactiveRiders = riders.filter((rider) => rider.status === "inactive");
    const activeRiderIds = new Set(activeRiders.map((rider) => rider.id));
    const activeRiderCodes = new Set(activeRiders.map((rider) => rider.rider_code));
    const absentRiderKeys = new Set<string>();

    for (const row of attendance) {
      if (!absentStatuses.has(row.status)) continue;
      if (row.rider_id && activeRiderIds.has(row.rider_id)) absentRiderKeys.add(row.rider_id);
      else if (activeRiderCodes.has(row.rider_code)) absentRiderKeys.add(row.rider_code);
    }

    const assignedRiderIds = new Set(assignments.map((row) => row.rider_id));
    const checkedInRiderIds = new Set(
      assignments.filter((row) => row.checked_in_at).map((row) => row.rider_id),
    );
    const morningUnassignedCot1Count = activeRiders.filter(
      (rider) =>
        isCot1(rider.cot) &&
        !rider.pickup_district?.trim() &&
        !rider.pickup_ward?.trim() &&
        !checkedInRiderIds.has(rider.id),
    ).length;

    let realtimeRows: RealtimeRow[] = [];
    const latestSnapshotId = latestRealtimeResult.data?.snapshot_id ?? null;
    if (latestSnapshotId) {
      const realtimeResult = await admin
        .from("realtime_delivery_riders")
        .select("driver_id,total_assigned,delivered,delivering,failed")
        .eq("work_date", parsedDate.data)
        .eq("snapshot_id", latestSnapshotId);
      if (realtimeResult.error) throw new Error(realtimeResult.error.message);
      realtimeRows = (realtimeResult.data ?? []) as RealtimeRow[];
    }

    const delivery = realtimeRows.reduce(
      (total, row) => ({
        total_assigned: total.total_assigned + Number(row.total_assigned ?? 0),
        delivered: total.delivered + Number(row.delivered ?? 0),
        delivering: total.delivering + Number(row.delivering ?? 0),
        failed: total.failed + Number(row.failed ?? 0),
      }),
      { total_assigned: 0, delivered: 0, delivering: 0, failed: 0 },
    );
    const activeDeliveryRiderCount = realtimeRows.filter(
      (row) => Number(row.total_assigned ?? 0) > 0,
    ).length;
    const managedActiveDeliveryRiderCount = realtimeRows.filter(
      (row) =>
        Number(row.total_assigned ?? 0) > 0 && activeRiderCodes.has(row.driver_id),
    ).length;
    const absenceNotes = absenceNoteResult.data ?? [];
    const excusedAbsenceCount = absenceNotes.filter((note) => note.is_excused).length;

    await auditGptRead(admin, "/api/gpt/rider-ops/overview", {
      work_date: parsedDate.data,
    });

    return gptJson({
      success: true,
      work_date: parsedDate.data,
      total_riders: riders.length,
      total_active_riders: activeRiders.length,
      total_inactive_riders: inactiveRiders.length,
      absent_rider_count: absentRiderKeys.size,
      active_delivery_rider_count: activeDeliveryRiderCount,
      managed_active_delivery_rider_count: managedActiveDeliveryRiderCount,
      realtime_active_riders_outside_master_count:
        activeDeliveryRiderCount - managedActiveDeliveryRiderCount,
      latest_snapshot_at: latestRealtimeResult.data?.snapshot_at ?? null,
      attendance_status_counts: statusCounts(attendance),
      rider_distribution: {
        by_kv: groupCounts(activeRiders, "kv"),
        by_cot: groupCounts(activeRiders, "cot"),
        by_delivery_district: groupCounts(activeRiders, "delivery_district"),
      },
      morning_operations: {
        assignment_rows: assignments.length,
        assigned_rider_count: assignedRiderIds.size,
        checked_in_rider_count: checkedInRiderIds.size,
        unassigned_cot1_rider_count: morningUnassignedCot1Count,
        absence_note_count: absenceNotes.length,
        excused_absence_count: excusedAbsenceCount,
      },
      realtime_delivery: {
        ...delivery,
        delivery_success_rate:
          delivery.total_assigned > 0
            ? Number(((delivery.delivered / delivery.total_assigned) * 100).toFixed(2))
            : null,
      },
      summary: `${activeRiders.length} rider active và ${inactiveRiders.length} rider inactive trong master; nguồn realtime có ${activeDeliveryRiderCount} rider có đơn, trong đó ${managedActiveDeliveryRiderCount} rider khớp master active; ${absentRiderKeys.size} rider master active có lịch OFF.`,
      definitions: {
        absent_rider_count:
          "Số rider active có trạng thái OFF_WEEKLY, OFF_APPROVED hoặc OFF_UNEXPECTED trong attendance_logs của ngày.",
        unassigned_cot1_rider_count:
          "Số rider active COT 1 chưa có khu vực pickup mặc định và chưa check-in vào phân công buổi sáng.",
        active_delivery_rider_count:
          "Tổng số rider của toàn bộ nguồn snapshot realtime mới nhất có total_assigned lớn hơn 0; phạm vi này có thể rộng hơn rider master của app.",
        managed_active_delivery_rider_count:
          "Số rider có đơn trong snapshot realtime mới nhất và đồng thời khớp rider_code active trong master của app.",
      },
    });
  } catch (error) {
    return gptJson(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unable to load rider overview",
      },
      500,
    );
  }
}
