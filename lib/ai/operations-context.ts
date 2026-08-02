import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSearch } from "@/lib/gpt-actions/server";

type RiderRow = {
  id: string;
  rider_code: string;
  full_name: string | null;
  kv: string | null;
  cot: string | null;
  status: string | null;
  delivery_district: string | null;
  delivery_ward: string | null;
  pickup_district: string | null;
  pickup_ward: string | null;
};

type AttendanceRow = {
  rider_id: string | null;
  rider_code: string;
  status: string;
};

type RealtimeRow = {
  driver_id: string;
  driver_name: string | null;
  total_assigned: number;
  delivered: number;
  delivering: number;
  failed: number;
  zone_id: string | null;
  first_delivery_at: string | null;
  idle_delivery_seconds: number;
  snapshot_at: string;
};

type VolumeRow = {
  district: string | null;
  area: string | null;
  total_orders: number | null;
};

export type AiOperationsContext = {
  context_version: 1;
  generated_at: string;
  work_date: string;
  page_path: string;
  scope_note: string;
  sources: string[];
  data: Record<string, unknown>;
};

const offStatuses = new Set(["OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED"]);

export async function loadAiOperationsContext({
  admin,
  pagePath,
  question,
}: {
  admin: SupabaseClient;
  pagePath: string;
  question: string;
}): Promise<AiOperationsContext> {
  const workDate = resolveWorkDate(question);
  const includeVolume = /volume|pickup|delivery|đơn|don/i.test(question);

  const [riderResult, attendanceResult, latestRealtimeResult, deliveryVolumeResult, pickupVolumeResult] = await Promise.all([
    admin
      .from("riders")
      .select("id,rider_code,full_name,kv,cot,status,delivery_district,delivery_ward,pickup_district,pickup_ward")
      .order("rider_code")
      .limit(2000),
    admin.from("attendance_logs").select("rider_id,rider_code,status").eq("work_date", workDate).limit(2000),
    admin
      .from("realtime_delivery_riders")
      .select("snapshot_id,snapshot_at")
      .eq("work_date", workDate)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    includeVolume
      ? admin.from("delivery_order").select("district,area,total_orders").eq("report_date", workDate).limit(2000)
      : Promise.resolve({ data: [], error: null }),
    includeVolume
      ? admin.from("pickup_volume").select("district,area,total_orders").eq("report_date", workDate).limit(2000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError =
    riderResult.error ??
    attendanceResult.error ??
    latestRealtimeResult.error ??
    deliveryVolumeResult.error ??
    pickupVolumeResult.error;
  if (firstError) throw new Error(firstError.message);

  const riders = (riderResult.data ?? []) as RiderRow[];
  const attendance = (attendanceResult.data ?? []) as AttendanceRow[];
  const latestSnapshot = latestRealtimeResult.data ?? null;
  let realtime: RealtimeRow[] = [];

  if (latestSnapshot?.snapshot_id) {
    const realtimeResult = await admin
      .from("realtime_delivery_riders")
      .select("driver_id,driver_name,total_assigned,delivered,delivering,failed,zone_id,first_delivery_at,idle_delivery_seconds,snapshot_at")
      .eq("work_date", workDate)
      .eq("snapshot_id", latestSnapshot.snapshot_id)
      .limit(2000);
    if (realtimeResult.error) throw new Error(realtimeResult.error.message);
    realtime = (realtimeResult.data ?? []) as RealtimeRow[];
  }

  const activeRiders = riders.filter((rider) => rider.status === "active");
  const riderById = new Map(riders.map((rider) => [rider.id, rider]));
  const riderByCode = new Map(riders.map((rider) => [rider.rider_code, rider]));
  const realtimeByCode = new Map(realtime.map((row) => [row.driver_id, row]));
  const questionNormalized = normalizeSearch(question);
  const matchedRiders = riders
    .filter((rider) => {
      const code = normalizeSearch(rider.rider_code);
      const name = normalizeSearch(rider.full_name);
      return (code.length >= 4 && questionNormalized.includes(code)) || (name.length >= 5 && questionNormalized.includes(name));
    })
    .slice(0, 5)
    .map((rider) => riderDetail(rider, realtimeByCode.get(rider.rider_code) ?? null));

  const offRiders = attendance
    .filter((row) => offStatuses.has(row.status))
    .map((row) => (row.rider_id ? riderById.get(row.rider_id) : undefined) ?? riderByCode.get(row.rider_code))
    .filter((rider): rider is RiderRow => Boolean(rider))
    .slice(0, 10)
    .map((rider) => ({
      rider_code: rider.rider_code,
      full_name: rider.full_name,
      cot: rider.cot,
      district: rider.delivery_district ?? rider.pickup_district,
      ward: rider.delivery_ward ?? rider.pickup_ward,
      off_status: attendance.find((row) => row.rider_id === rider.id || row.rider_code === rider.rider_code)?.status ?? null,
    }));

  const realtimeTotals = realtime.reduce(
    (total, row) => ({
      total_assigned: total.total_assigned + Number(row.total_assigned ?? 0),
      delivered: total.delivered + Number(row.delivered ?? 0),
      delivering: total.delivering + Number(row.delivering ?? 0),
      failed: total.failed + Number(row.failed ?? 0),
    }),
    { total_assigned: 0, delivered: 0, delivering: 0, failed: 0 },
  );
  const topRisks = realtime
    .map((row) => ({ ...row, risk_score: riskScore(row), risk_reasons: riskReasons(row) }))
    .filter((row) => row.risk_score > 0)
    .sort((a, b) => b.risk_score - a.risk_score || Number(b.failed) - Number(a.failed))
    .slice(0, 10)
    .map((row) => ({
      rider_code: row.driver_id,
      rider_name: riderByCode.get(row.driver_id)?.full_name ?? row.driver_name,
      district: riderByCode.get(row.driver_id)?.delivery_district ?? row.zone_id,
      total_assigned: Number(row.total_assigned ?? 0),
      delivered: Number(row.delivered ?? 0),
      delivering: Number(row.delivering ?? 0),
      failed: Number(row.failed ?? 0),
      idle_minutes: Math.round(Number(row.idle_delivery_seconds ?? 0) / 60),
      risk_reasons: row.risk_reasons,
    }));

  const data: Record<string, unknown> = {
    rider_master: {
      total: riders.length,
      active: activeRiders.length,
      inactive: riders.length - activeRiders.length,
      active_by_kv: countBy(activeRiders, (rider) => rider.kv),
      active_by_cot: countBy(activeRiders, (rider) => rider.cot),
      active_by_delivery_district: countBy(activeRiders, (rider) => rider.delivery_district),
    },
    attendance: {
      status_counts: countBy(attendance, (row) => row.status),
      off_rider_count: attendance.filter((row) => offStatuses.has(row.status)).length,
      off_riders_sample: offRiders,
      off_riders_truncated: attendance.filter((row) => offStatuses.has(row.status)).length > offRiders.length,
    },
    realtime_delivery: {
      snapshot_id: latestSnapshot?.snapshot_id ?? null,
      snapshot_at: latestSnapshot?.snapshot_at ?? null,
      rider_count: realtime.length,
      active_rider_count: realtime.filter((row) => Number(row.total_assigned ?? 0) > 0).length,
      ...realtimeTotals,
      delivery_success_rate_percent:
        realtimeTotals.total_assigned > 0 ? Number(((realtimeTotals.delivered / realtimeTotals.total_assigned) * 100).toFixed(2)) : null,
      top_operational_risks: topRisks,
    },
    matched_riders: matchedRiders,
  };

  const sources = ["riders", "attendance_logs", "realtime_delivery_riders"];
  if (includeVolume) {
    data.volume = {
      delivery: summarizeVolume((deliveryVolumeResult.data ?? []) as VolumeRow[]),
      pickup: summarizeVolume((pickupVolumeResult.data ?? []) as VolumeRow[]),
    };
    sources.push("delivery_order", "pickup_volume");
  }

  return {
    context_version: 1,
    generated_at: new Date().toISOString(),
    work_date: workDate,
    page_path: pagePath,
    scope_note: "Dữ liệu theo work_date; realtime chỉ dùng snapshot_id mới nhất. Danh sách chi tiết đã giới hạn, còn aggregate được tính trên toàn bộ dòng tải về.",
    sources,
    data,
  };
}

function riderDetail(rider: RiderRow, realtime: RealtimeRow | null) {
  return {
    rider_code: rider.rider_code,
    full_name: rider.full_name,
    kv: rider.kv,
    cot: rider.cot,
    status: rider.status,
    delivery_district: rider.delivery_district,
    delivery_ward: rider.delivery_ward,
    pickup_district: rider.pickup_district,
    pickup_ward: rider.pickup_ward,
    realtime: realtime
      ? {
          total_assigned: Number(realtime.total_assigned ?? 0),
          delivered: Number(realtime.delivered ?? 0),
          delivering: Number(realtime.delivering ?? 0),
          failed: Number(realtime.failed ?? 0),
          idle_minutes: Math.round(Number(realtime.idle_delivery_seconds ?? 0) / 60),
          first_delivery_at: realtime.first_delivery_at,
          snapshot_at: realtime.snapshot_at,
        }
      : null,
  };
}

function riskScore(row: RealtimeRow) {
  const assigned = Number(row.total_assigned ?? 0);
  const delivered = Number(row.delivered ?? 0);
  const delivering = Number(row.delivering ?? 0);
  const failed = Number(row.failed ?? 0);
  const idleSeconds = Number(row.idle_delivery_seconds ?? 0);
  const failureRate = assigned > 0 ? failed / assigned : 0;
  return (assigned > 0 && delivered === 0 ? 4 : 0) + (delivering > 0 && idleSeconds > 3600 ? 3 : 0) + (failureRate >= 0.2 ? 2 : 0) + Math.min(failed, 20) / 20;
}

function riskReasons(row: RealtimeRow) {
  const assigned = Number(row.total_assigned ?? 0);
  const delivered = Number(row.delivered ?? 0);
  const delivering = Number(row.delivering ?? 0);
  const failed = Number(row.failed ?? 0);
  const idleSeconds = Number(row.idle_delivery_seconds ?? 0);
  const reasons: string[] = [];
  if (assigned > 0 && delivered === 0) reasons.push("chưa giao thành công đơn nào");
  if (delivering > 0 && idleSeconds > 3600) reasons.push("còn đơn và idle trên 60 phút");
  if (assigned > 0 && failed / assigned >= 0.2) reasons.push("tỷ lệ failed từ 20%");
  return reasons;
}

function countBy<T>(rows: T[], getLabel: (row: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = getLabel(row)?.trim() || "Chưa gán";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "vi"))
    .slice(0, 20);
}

function summarizeVolume(rows: VolumeRow[]) {
  const scoped = rows.filter((row) => /(?:^|\D)[56](?:\D|$)/.test(normalizeSearch(row.area)));
  const byDistrict = new Map<string, number>();
  for (const row of scoped) {
    const district = row.district?.trim() || "Chưa xác định";
    byDistrict.set(district, (byDistrict.get(district) ?? 0) + Number(row.total_orders ?? 0));
  }
  return {
    total_orders: scoped.reduce((sum, row) => sum + Number(row.total_orders ?? 0), 0),
    row_count: scoped.length,
    by_district: Array.from(byDistrict, ([district, total_orders]) => ({ district, total_orders })).sort((a, b) => b.total_orders - a.total_orders).slice(0, 20),
  };
}

function resolveWorkDate(question: string) {
  const explicitDate = question.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (explicitDate && !Number.isNaN(new Date(`${explicitDate}T00:00:00Z`).getTime())) return explicitDate;
  const today = todayInVietnam();
  if (normalizeSearch(question).includes("hom qua")) return shiftDate(today, -1);
  return today;
}

function todayInVietnam() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
