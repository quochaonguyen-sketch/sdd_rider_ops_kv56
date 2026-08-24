import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma/client";

type PerformanceRow = {
  report_date: Date;
  driver_id: string;
  rider_name: string | null;
  district: string | null;
  kv: string | null;
  delivery_assigned: bigint;
  delivery_delivered: bigint;
};

export type DistrictOnHold = {
  district: string;
  area: "KV5" | "KV6";
  onHold: number;
  assigned: number;
  delivered: number;
  riders: number;
  worstRider: { riderCode: string; riderName: string; onHold: number } | null;
};

export type DistrictOnHoldDaily = {
  date: string;
  district: string;
  area: "KV5" | "KV6";
  onHold: number;
  assigned: number;
};

export type DistrictOnHoldState = {
  day: DistrictOnHold[];
  week: DistrictOnHold[];
  daily: DistrictOnHoldDaily[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

type DistrictAccumulator = Omit<DistrictOnHold, "worstRider" | "riders"> & {
  riders: number;
  riderCodes: Set<string>;
  worstRider: DistrictOnHold["worstRider"];
};

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const rawEnd = new URL(request.url).searchParams.get("end") ?? "";
  const end = DATE_RE.test(rawEnd) ? rawEnd : new Date().toISOString().slice(0, 10);
  const start = shiftDate(end, -6);

  const rows = await prisma.$queryRaw<PerformanceRow[]>`
    select
      p.report_date::date as report_date,
      p.driver_id,
      max(r.full_name) as rider_name,
      max(nullif(trim(r.delivery_district), '')) as district,
      max(upper(trim(coalesce(r.kv, '')))) as kv,
      sum(coalesce(p.delivery_assigned, 0))::bigint as delivery_assigned,
      sum(coalesce(p.delivery_delivered, 0))::bigint as delivery_delivered
    from public.driver_performance_daily p
    join public.riders r on r.rider_code = p.driver_id
    where upper(coalesce(r.kv, '')) in ('KV5', 'KV6')
      and p.report_date between ${start}::date and ${end}::date
    group by p.report_date, p.driver_id
  `;

  const createAccumulator = (district: string, area: "KV5" | "KV6"): DistrictAccumulator => ({
    district,
    area,
    onHold: 0,
    assigned: 0,
    delivered: 0,
    riders: 0,
    riderCodes: new Set(),
    worstRider: null,
  });

  const dayMap = new Map<string, DistrictAccumulator>();
  const weekMap = new Map<string, DistrictAccumulator>();
  const dailyMap = new Map<string, DistrictOnHoldDaily>();

  for (const row of rows) {
    const reportDate = row.report_date.toISOString().slice(0, 10);
    const riderCode = row.driver_id.trim().toUpperCase();
    const district = row.district?.trim() || "Chưa xác định";
    const area = row.kv === "KV6" ? "KV6" : "KV5";
    const assigned = Number(row.delivery_assigned);
    const delivered = Number(row.delivery_delivered);
    const onHold = Math.max(0, assigned - delivered);
    const riderName = row.rider_name ?? riderCode;

    const apply = (map: Map<string, DistrictAccumulator>) => {
      const item = map.get(district) ?? createAccumulator(district, area);
      item.onHold += onHold;
      item.assigned += assigned;
      item.delivered += delivered;
      item.riderCodes.add(riderCode);
      if (onHold > 0 && (!item.worstRider || onHold > item.worstRider.onHold)) {
        item.worstRider = { riderCode, riderName, onHold };
      }
      map.set(district, item);
    };

    apply(weekMap);
    if (reportDate === end) apply(dayMap);

    const dailyKey = `${reportDate}|${district}`;
    const daily = dailyMap.get(dailyKey) ?? { date: reportDate, district, area, onHold: 0, assigned: 0 };
    daily.onHold += onHold;
    daily.assigned += assigned;
    dailyMap.set(dailyKey, daily);
  }

  const finalize = (map: Map<string, DistrictAccumulator>): DistrictOnHold[] =>
    Array.from(map.values())
      .map(({ riderCodes, ...item }) => ({ ...item, riders: riderCodes.size }))
      .sort((a, b) => b.onHold - a.onHold || a.district.localeCompare(b.district, "vi"));

  const onhold: DistrictOnHoldState = {
    day: finalize(dayMap),
    week: finalize(weekMap),
    daily: Array.from(dailyMap.values()).sort(
      (a, b) => a.date.localeCompare(b.date) || a.district.localeCompare(b.district, "vi"),
    ),
  };

  return NextResponse.json({ success: true, onhold });
}
