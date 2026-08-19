import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma/client";

type PerformanceAggregate = {
  report_date: Date;
  driver_id: string;
  rider_name: string | null;
  district: string | null;
  delivery_assigned: bigint;
  delivery_delivered: bigint;
};

export type FailedLeader = {
  riderCode: string;
  riderName: string;
  district: string;
  failed: number;
  assigned: number;
};

type FailedLeaders = { day: FailedLeader[]; week: FailedLeader[] };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

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

  const rows = await prisma.$queryRaw<PerformanceAggregate[]>`
    select
      p.report_date::date as report_date,
      p.driver_id,
      max(r.full_name) as rider_name,
      max(nullif(trim(r.delivery_district), '')) as district,
      sum(coalesce(p.delivery_assigned, 0))::bigint as delivery_assigned,
      sum(coalesce(p.delivery_delivered, 0))::bigint as delivery_delivered
    from public.driver_performance_daily p
    join public.riders r on r.rider_code = p.driver_id
    where upper(coalesce(r.kv, '')) in ('KV5', 'KV6')
      and p.report_date between ${start}::date and ${end}::date
    group by p.report_date, p.driver_id
  `;

  const normalize = (value: string) => value.trim().toUpperCase();
  const newLeader = (riderCode: string, riderName: string | null, district: string | null): FailedLeader => ({
    riderCode,
    riderName: riderName ?? riderCode,
    district: district ?? "Chưa xác định",
    failed: 0,
    assigned: 0,
  });

  const dayMap = new Map<string, FailedLeader>();
  const weekMap = new Map<string, FailedLeader>();

  for (const row of rows) {
    const reportDate = row.report_date.toISOString().slice(0, 10);
    const riderCode = normalize(row.driver_id);
    const assigned = Number(row.delivery_assigned);
    const failed = Math.max(0, assigned - Number(row.delivery_delivered));

    const week = weekMap.get(riderCode) ?? newLeader(riderCode, row.rider_name, row.district);
    week.failed += failed;
    week.assigned += assigned;
    if (row.rider_name) week.riderName = row.rider_name;
    if (row.district) week.district = row.district;
    weekMap.set(riderCode, week);

    if (reportDate === end) {
      const day = dayMap.get(riderCode) ?? newLeader(riderCode, row.rider_name, row.district);
      day.failed += failed;
      day.assigned += assigned;
      if (row.rider_name) day.riderName = row.rider_name;
      if (row.district) day.district = row.district;
      dayMap.set(riderCode, day);
    }
  }

  const rank = (map: Map<string, FailedLeader>) =>
    Array.from(map.values())
      .filter((item) => item.failed > 0)
      .sort((a, b) => b.failed - a.failed || b.assigned - a.assigned)
      .slice(0, 5);

  const leaders: FailedLeaders = { day: rank(dayMap), week: rank(weekMap) };
  return NextResponse.json({ success: true, leaders });
}
