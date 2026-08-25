import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VIOLATION_STATUSES = [
  "OFF_UNEXPECTED",
  "WORKING_REST_DAY",
  "NO_PICKUP",
  "NO_DELIVERY",
] as const;

type ViolationRider = {
  riderCode: string;
  riderName: string;
  district: string;
  offUnexpected: number;
  workingRestDay: number;
  noPickup: number;
  noDelivery: number;
};

type ViolationStatus = {
  key: string;
  label: string;
  count: number;
  severity: "critical" | "warning";
};

export type ViolationLeader = {
  riderCode: string;
  riderName: string;
  district: string;
  total: number;
  breakdown: Array<{ key: string; label: string; count: number }>;
};

export type TopViolations = {
  day: ViolationLeader[];
  week: ViolationLeader[];
  statuses: ViolationStatus[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_META: Record<(typeof VIOLATION_STATUSES)[number], { label: string; severity: "critical" | "warning" }> = {
  OFF_UNEXPECTED: { label: "OFF đột xuất", severity: "critical" },
  WORKING_REST_DAY: { label: "OFF nhưng không OFF", severity: "warning" },
  NO_PICKUP: { label: "Không lên lấy hàng (pick)", severity: "critical" },
  NO_DELIVERY: { label: "Không đi giao", severity: "warning" },
};

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const STATUS_FIELD: Record<(typeof VIOLATION_STATUSES)[number], "offUnexpected" | "workingRestDay" | "noPickup" | "noDelivery"> = {
  OFF_UNEXPECTED: "offUnexpected",
  WORKING_REST_DAY: "workingRestDay",
  NO_PICKUP: "noPickup",
  NO_DELIVERY: "noDelivery",
};

function isKv56(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim().toUpperCase();
  return /^(?:(?:KV|KHU)[\s.]*)?[56]$/.test(normalized);
}

type LogRow = {
  rider_code: string;
  work_date: string;
  status: string;
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const rawEnd = new URL(request.url).searchParams.get("end") ?? "";
  const end = DATE_RE.test(rawEnd) ? rawEnd : new Date().toISOString().slice(0, 10);
  const start = shiftDate(end, -6);

  const pageSize = 1000;
  const rows: LogRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from("attendance_logs")
      .select("rider_code,work_date,status")
      .gte("work_date", start)
      .lte("work_date", end)
      .in("status", VIOLATION_STATUSES)
      .order("work_date", { ascending: true })
      .range(from, from + pageSize - 1);

    if (result.error) {
      return NextResponse.json({ success: false, error: result.error.message }, { status: 400 });
    }
    const page = (result.data ?? []) as LogRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const riderCodes = [...new Set(rows.map((row) => row.rider_code.trim().toUpperCase()).filter(Boolean))];
  const profileResult = riderCodes.length
    ? await supabase
        .from("riders")
        .select("rider_code,full_name,delivery_district,kv")
        .in("rider_code", riderCodes)
    : { data: [], error: null };
  if (profileResult.error) {
    return NextResponse.json({ success: false, error: profileResult.error.message }, { status: 400 });
  }
  const profiles = new Map<string, { full_name: string | null; delivery_district: string | null; kv: string | null }>();
  for (const profile of profileResult.data ?? []) {
    profiles.set(profile.rider_code.trim().toUpperCase(), profile);
  }

  const newLeader = (riderCode: string): ViolationRider => ({
    riderCode,
    riderName: riderCode,
    district: "Chưa xác định",
    offUnexpected: 0,
    workingRestDay: 0,
    noPickup: 0,
    noDelivery: 0,
  });

  const dayMap = new Map<string, ViolationRider>();
  const weekMap = new Map<string, ViolationRider>();
  const statusCounts = VIOLATION_STATUSES.reduce<Record<string, number>>((map, status) => ({ ...map, [status]: 0 }), {});

  for (const row of rows) {
    const riderCode = row.rider_code.trim().toUpperCase();
    if (!riderCode) continue;

    const profile = profiles.get(riderCode);
    if (!profile || !isKv56(profile.kv)) continue;

    const status = VIOLATION_STATUSES.find((item) => item === row.status);
    if (!status) continue;

    const date = String(row.work_date).slice(0, 10);
    const apply = (map: Map<string, ViolationRider>) => {
      const rider = map.get(riderCode) ?? newLeader(riderCode);
      rider[STATUS_FIELD[status]] += 1;
      rider.riderName = profile.full_name ?? rider.riderName;
      rider.district = profile.delivery_district ?? rider.district;
      map.set(riderCode, rider);
    };

    apply(weekMap);
    statusCounts[status] += 1;
    if (date === end) apply(dayMap);
  }

  const rank = (map: Map<string, ViolationRider>): ViolationLeader[] =>
    Array.from(map.values())
      .filter((rider) => rider.offUnexpected + rider.workingRestDay + rider.noPickup + rider.noDelivery > 0)
      .map((rider) => ({
        riderCode: rider.riderCode,
        riderName: rider.riderName ?? rider.riderCode,
        district: rider.district,
        total: rider.offUnexpected + rider.workingRestDay + rider.noPickup + rider.noDelivery,
        breakdown: VIOLATION_STATUSES.filter((status) => rider[STATUS_FIELD[status]] > 0).map((status) => ({
          key: status,
          label: STATUS_META[status].label,
          count: rider[STATUS_FIELD[status]],
        })),
      }))
      .sort((a, b) => b.total - a.total || a.riderName.localeCompare(b.riderName, "vi"))
      .slice(0, 5);

  const statuses: ViolationStatus[] = VIOLATION_STATUSES.map((status) => ({
    key: status,
    label: STATUS_META[status].label,
    count: statusCounts[status],
    severity: STATUS_META[status].severity,
  }));

  const data: TopViolations = { day: rank(dayMap), week: rank(weekMap), statuses };
  return NextResponse.json({ success: true, violations: data });
}
