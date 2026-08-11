import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSearch } from "@/lib/gpt-actions/server";
import { resolveWorkDateScope, type WorkDateScope } from "@/lib/ai/work-date";

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
  work_date: string;
};

type OffRequestRow = {
  rider_id: string;
  rider_code: string;
  request_type: "WEEKLY" | "PLANNED" | "EMERGENCY";
  off_date: string;
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
  date_scope: WorkDateScope;
  page_path: string;
  scope_note: string;
  sources: string[];
  data: Record<string, unknown>;
};

const offStatuses = new Set(["OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED"]);
const offRequestStatus = {
  WEEKLY: "OFF_WEEKLY",
  PLANNED: "OFF_APPROVED",
  EMERGENCY: "OFF_UNEXPECTED",
} as const;
const OFF_DETAIL_LIMIT = 100;

export async function loadAiOperationsContext({
  admin,
  pagePath,
  question,
}: {
  admin: SupabaseClient;
  pagePath: string;
  question: string;
}): Promise<AiOperationsContext> {
  const dateScope = resolveWorkDateScope(question);
  const workDate = dateScope.referenceDate;
  const includeVolume = /volume|pickup|delivery|đơn|don/i.test(question);

  const [riderResult, attendanceResult, offRequestResult, latestRealtimeResult, deliveryVolumeResult, pickupVolumeResult] = await Promise.all([
    admin
      .from("riders")
      .select("id,rider_code,full_name,kv,cot,status,delivery_district,delivery_ward,pickup_district,pickup_ward")
      .order("rider_code")
      .limit(2000),
    admin
      .from("attendance_logs")
      .select("rider_id,rider_code,status,work_date")
      .gte("work_date", dateScope.start)
      .lte("work_date", dateScope.end)
      .limit(5000),
    admin
      .from("rider_off_requests")
      .select("rider_id,rider_code,request_type,off_date")
      .gte("off_date", dateScope.start)
      .lte("off_date", dateScope.end)
      .eq("status", "APPROVED")
      .limit(5000),
    admin
      .from("realtime_delivery_riders")
      .select("snapshot_id,snapshot_at")
      .eq("work_date", workDate)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    includeVolume
      ? admin.from("delivery_order").select("district,area,total_orders").gte("report_date", dateScope.start).lte("report_date", dateScope.end).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    includeVolume
      ? admin.from("pickup_volume").select("district,area,total_orders").gte("report_date", dateScope.start).lte("report_date", dateScope.end).limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError =
    riderResult.error ??
    attendanceResult.error ??
    offRequestResult.error ??
    latestRealtimeResult.error ??
    deliveryVolumeResult.error ??
    pickupVolumeResult.error;
  if (firstError) throw new Error(firstError.message);

  const riders = (riderResult.data ?? []) as RiderRow[];
  const attendance = (attendanceResult.data ?? []) as AttendanceRow[];
  const approvedOffRequests = (offRequestResult.data ?? []) as OffRequestRow[];
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

  const requestedOffScope = resolveOffScope(questionNormalized, riders);
  const offRows = [
    ...attendance
      .filter((row) => offStatuses.has(row.status))
      .map((row) => ({ ...row, source: "attendance_logs" as const })),
    ...approvedOffRequests.map((row) => ({
      rider_id: row.rider_id,
      rider_code: row.rider_code,
      status: offRequestStatus[row.request_type],
      work_date: row.off_date,
      source: "rider_off_requests" as const,
    })),
  ];
  const offByRiderDate = new Map<string, {
    rider_code: string;
    full_name: string | null;
    cot: string | null;
    work_date: string;
    district: string | null;
    ward: string | null;
    area_source: string;
    off_status: string;
    sources: string[];
  }>();
  for (const offRow of offRows) {
    const rider =
      (offRow.rider_id ? riderById.get(offRow.rider_id) : undefined) ??
      riderByCode.get(offRow.rider_code);
    if (!rider || rider.status !== "active") continue;
    const area = areaForScope(rider, requestedOffScope.area_mode);
    const entryKey = `${rider.rider_code}|${offRow.work_date}`;
    const existing = offByRiderDate.get(entryKey);
    if (existing) {
      if (!existing.sources.includes(offRow.source)) existing.sources.push(offRow.source);
      if (offStatusPriority(offRow.status) > offStatusPriority(existing.off_status)) existing.off_status = offRow.status;
      continue;
    }
    offByRiderDate.set(entryKey, {
      rider_code: rider.rider_code,
      full_name: rider.full_name,
      cot: rider.cot,
      work_date: offRow.work_date,
      district: area.district,
      ward: area.ward,
      area_source: area.source,
      off_status: offRow.status,
      sources: [offRow.source],
    });
  }
  const allOffRiders = Array.from(offByRiderDate.values());
  const scopedOffRiders = allOffRiders
    .filter((rider) => matchesOffScope(rider, requestedOffScope))
    .sort(
      (a, b) =>
        a.work_date.localeCompare(b.work_date) ||
        (a.ward ?? "").localeCompare(b.ward ?? "", "vi") ||
        a.rider_code.localeCompare(b.rider_code, "vi"),
    );
  const offRiders = scopedOffRiders.slice(0, OFF_DETAIL_LIMIT);
  const matchedRiderCodes = new Set(matchedRiders.map((rider) => rider.rider_code));
  const matchedRiderOffSchedule = allOffRiders
    .filter((entry) => matchedRiderCodes.has(entry.rider_code))
    .sort((a, b) => a.work_date.localeCompare(b.work_date) || a.rider_code.localeCompare(b.rider_code, "vi"));

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
      date_scope: dateScope,
      active_off_rider_count: new Set(allOffRiders.map((row) => row.rider_code)).size,
      off_entry_count: allOffRiders.length,
      requested_scope: requestedOffScope,
      scoped_off_rider_count: new Set(scopedOffRiders.map((row) => row.rider_code)).size,
      scoped_off_entry_count: scopedOffRiders.length,
      scoped_off_status_counts: offStatusCounts(scopedOffRiders),
      matched_rider_off_schedule: matchedRiderOffSchedule,
      off_riders: offRiders,
      off_riders_returned: offRiders.length,
      off_riders_truncated: scopedOffRiders.length > offRiders.length,
      included_off_statuses: Array.from(offStatuses),
      included_sources: ["attendance_logs", "approved rider_off_requests"],
      definition: "Chỉ tính rider active và khử trùng theo rider_code + work_date. Câu hỏi theo tuần dùng đủ thứ Hai–Chủ nhật và giữ từng ngày OFF. Nếu câu hỏi nói giao/delivery thì lọc delivery district; nói pickup/lấy hàng thì lọc pickup district; nếu không nói rõ mới dùng khu vực vận hành mặc định.",
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

  const sources = ["riders", "attendance_logs", "rider_off_requests", "realtime_delivery_riders"];
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
    date_scope: dateScope,
    page_path: pagePath,
    scope_note: `Dữ liệu lịch theo date_scope ${dateScope.label}; realtime chỉ dùng ngày tham chiếu ${workDate}. Danh sách OFF hợp nhất OFF tuần, OFF phép và OFF đột xuất từ attendance_logs với yêu cầu OFF đã duyệt, sau đó khử trùng theo rider + ngày. Câu hỏi nhắc tên rider phải dùng attendance.matched_rider_off_schedule. Chỉ gọi danh sách là đầy đủ khi off_riders_truncated=false.`,
    sources,
    data,
  };
}

type OffScope = {
  district: string | null;
  cot: string | null;
  area_mode: "delivery" | "pickup" | "operating";
};

function areaForScope(rider: RiderRow, mode: OffScope["area_mode"]) {
  if (mode === "delivery") {
    return { district: rider.delivery_district, ward: rider.delivery_ward, source: "delivery" };
  }
  if (mode === "pickup") {
    return { district: rider.pickup_district, ward: rider.pickup_ward, source: "pickup" };
  }
  return operatingArea(rider);
}

function operatingArea(rider: RiderRow) {
  if (isCotOne(rider.cot)) {
    return {
      district: rider.pickup_district ?? rider.delivery_district,
      ward: rider.pickup_ward ?? rider.delivery_ward,
      source: rider.pickup_district || rider.pickup_ward ? "pickup" : "delivery_fallback",
    };
  }
  return {
    district: rider.delivery_district ?? rider.pickup_district,
    ward: rider.delivery_ward ?? rider.pickup_ward,
    source: rider.delivery_district || rider.delivery_ward ? "delivery" : "pickup_fallback",
  };
}

function resolveOffScope(questionNormalized: string, riders: RiderRow[]): OffScope {
  const cotNumber = questionNormalized.match(/\bcot\s*([12])\b/)?.[1] ?? null;
  const areaMode: OffScope["area_mode"] = /\b(giao|delivery)\b/.test(questionNormalized)
    ? "delivery"
    : /\b(pickup|lay\s+hang|layhang)\b/.test(questionNormalized)
      ? "pickup"
      : "operating";
  const mentionedDistricts = Array.from(
    new Set(
      riders
        .flatMap((rider) => [rider.delivery_district, rider.pickup_district])
        .filter((district): district is string => Boolean(district?.trim())),
    ),
  )
    .filter((district) => questionMentionsDistrict(questionNormalized, district))
    .sort((a, b) => normalizeSearch(b).length - normalizeSearch(a).length);

  return {
    district: mentionedDistricts[0] ?? null,
    cot: cotNumber ? `COT${cotNumber}` : null,
    area_mode: areaMode,
  };
}

function offStatusPriority(status: string) {
  if (status === "OFF_UNEXPECTED") return 3;
  if (status === "OFF_APPROVED") return 2;
  if (status === "OFF_WEEKLY") return 1;
  return 0;
}

function offStatusCounts(rows: Array<{ off_status: string }>) {
  const counts = {
    OFF_WEEKLY: 0,
    OFF_APPROVED: 0,
    OFF_UNEXPECTED: 0,
  };
  for (const row of rows) {
    if (row.off_status in counts) counts[row.off_status as keyof typeof counts] += 1;
  }
  return counts;
}

function questionMentionsDistrict(questionNormalized: string, district: string) {
  const normalizedDistrict = normalizeSearch(district);
  const districtNumber = normalizedDistrict.match(/^(?:quan|q)\s*0*(\d{1,2})$/)?.[1];
  if (districtNumber) {
    return new RegExp(`\\b(?:quan|q)\\s*0*${districtNumber}\\b`).test(questionNormalized);
  }
  return normalizedDistrict.length >= 3 && questionNormalized.includes(normalizedDistrict);
}

function matchesOffScope(
  rider: { district: string | null; cot: string | null },
  scope: OffScope,
) {
  const districtMatches = !scope.district || normalizeDistrict(rider.district) === normalizeDistrict(scope.district);
  const cotMatches = !scope.cot || normalizeCot(rider.cot) === normalizeCot(scope.cot);
  return districtMatches && cotMatches;
}

function normalizeDistrict(value: string | null | undefined) {
  const normalized = normalizeSearch(value).replace(/[^a-z0-9]/g, "");
  const districtNumber = normalized.match(/^(?:quan|q)0*(\d{1,2})$/)?.[1];
  return districtNumber ? `quan${Number(districtNumber)}` : normalized;
}

function normalizeCot(value: string | null | undefined) {
  return normalizeSearch(value).replace(/[^a-z0-9]/g, "");
}

function isCotOne(value: string | null | undefined) {
  return normalizeCot(value) === "cot1" || normalizeCot(value) === "1";
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
