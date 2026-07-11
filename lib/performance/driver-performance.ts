import { cache } from "react";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma/client";

export const performanceSortSchema = z.enum(["rider", "delivery", "pickup", "deliveryRate", "pickupRate"]);
export const performanceDirectionSchema = z.enum(["asc", "desc"]);

export type PerformanceSortKey = z.infer<typeof performanceSortSchema>;
export type PerformanceDirection = z.infer<typeof performanceDirectionSchema>;

export type PerformanceFilters = {
  date: string;
  q: string;
  sort: PerformanceSortKey;
  dir: PerformanceDirection;
  page: number;
  pageSize: number;
};

export type PerformanceRow = {
  report_date: string;
  driver_id: string;
  driver_name: string | null;
  rider_name: string | null;
  kv: string | null;
  cot: string | null;
  pickup_district: string | null;
  delivery_district: string | null;
  delivery_assigned: number;
  delivery_delivered: number;
  pickup_assigned: number;
  pickup_picked: number;
  delivery_rate: number | null;
  pickup_rate: number | null;
};

export type PerformanceSummary = {
  groups: number;
  active_riders: number;
  delivery_assigned: number;
  delivery_delivered: number;
  pickup_assigned: number;
  pickup_picked: number;
};

export type PerformanceResult = {
  filters: PerformanceFilters;
  rows: PerformanceRow[];
  summary: PerformanceSummary;
};

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const emptySummary: PerformanceSummary = {
  groups: 0,
  active_riders: 0,
  delivery_assigned: 0,
  delivery_delivered: 0,
  pickup_assigned: 0,
  pickup_picked: 0,
};

type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams;

function getParam(params: SearchParamsLike, key: string) {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function parsePerformanceFilters(params: SearchParamsLike): PerformanceFilters {
  const parsedDate = dateSchema.safeParse(getParam(params, "date"));
  const rawPage = Number(getParam(params, "page") ?? 1);
  const rawPageSize = Number(getParam(params, "pageSize") ?? 100);

  return {
    date: parsedDate.success ? parsedDate.data : todayString(),
    q: (getParam(params, "q") ?? "").trim().slice(0, 80),
    sort: performanceSortSchema.catch("delivery").parse(getParam(params, "sort")),
    dir: performanceDirectionSchema.catch("desc").parse(getParam(params, "dir")),
    page: Math.max(1, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1),
    pageSize: Math.min(200, Math.max(25, Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 100)),
  };
}

function orderExpression(sort: PerformanceSortKey) {
  if (sort === "rider") return Prisma.sql`coalesce(final.rider_name, final.driver_name, final.driver_id)`;
  if (sort === "pickup") return Prisma.sql`final.pickup_picked`;
  if (sort === "deliveryRate") return Prisma.sql`final.delivery_rate`;
  if (sort === "pickupRate") return Prisma.sql`final.pickup_rate`;
  return Prisma.sql`final.delivery_delivered`;
}

function orderDirection(direction: PerformanceDirection) {
  return direction === "asc" ? Prisma.sql`asc nulls last` : Prisma.sql`desc nulls last`;
}

export const getDriverPerformance = cache(async (filters: PerformanceFilters): Promise<PerformanceResult> => {
  const orderBy = orderExpression(filters.sort);
  const direction = orderDirection(filters.dir);
  const offset = (filters.page - 1) * filters.pageSize;
  const likeQuery = `%${filters.q}%`;
  const searchClause = filters.q
    ? Prisma.sql`and (
        p.driver_id ilike ${likeQuery}
        or p.driver_name ilike ${likeQuery}
        or p.contract_type_name ilike ${likeQuery}
        or r.full_name ilike ${likeQuery}
        or r.kv ilike ${likeQuery}
        or r.cot ilike ${likeQuery}
        or r.pickup_district ilike ${likeQuery}
        or r.delivery_district ilike ${likeQuery}
      )`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<
    Array<{
      report_date: Date;
      driver_id: string;
      driver_name: string | null;
      rider_name: string | null;
      kv: string | null;
      cot: string | null;
      pickup_district: string | null;
      delivery_district: string | null;
      delivery_assigned: bigint;
      delivery_delivered: bigint;
      pickup_assigned: bigint;
      pickup_picked: bigint;
      delivery_rate: Prisma.Decimal | null;
      pickup_rate: Prisma.Decimal | null;
      total_groups: bigint | null;
      total_delivery_assigned: Prisma.Decimal | null;
      total_delivery_delivered: Prisma.Decimal | null;
      total_pickup_assigned: Prisma.Decimal | null;
      total_pickup_picked: Prisma.Decimal | null;
      total_active_riders: bigint | null;
    }>
  >`
    with rider_scope as (
      select
        rider_code,
        full_name,
        kv,
        cot,
        pickup_district,
        delivery_district
      from public.riders
      where upper(coalesce(kv, '')) in ('KV5', 'KV6')
    ),
    grouped as (
      select
        p.report_date::date as report_date,
        p.driver_id,
        max(p.driver_name) as driver_name,
        max(r.full_name) as rider_name,
        max(r.kv) as kv,
        max(r.cot) as cot,
        max(r.pickup_district) as pickup_district,
        max(r.delivery_district) as delivery_district,
        sum(coalesce(p.delivery_assigned, 0))::bigint as delivery_assigned,
        sum(coalesce(p.delivery_delivered, 0))::bigint as delivery_delivered,
        sum(coalesce(p.pickup_assigned, 0))::bigint as pickup_assigned,
        sum(coalesce(p.pickup_picked, 0))::bigint as pickup_picked
      from public.driver_performance_daily p
      join rider_scope r on r.rider_code = p.driver_id
      where p.report_date = ${filters.date}::date
        ${searchClause}
      group by p.report_date, p.driver_id
    ),
    final as (
      select
        *,
        case when delivery_assigned > 0 then delivery_delivered::numeric / delivery_assigned * 100 end as delivery_rate,
        case when pickup_assigned > 0 then pickup_picked::numeric / pickup_assigned * 100 end as pickup_rate
      from grouped
    ),
    totals as (
      select
        count(*)::bigint as total_groups,
        coalesce(sum(delivery_assigned), 0) as total_delivery_assigned,
        coalesce(sum(delivery_delivered), 0) as total_delivery_delivered,
        coalesce(sum(pickup_assigned), 0) as total_pickup_assigned,
        coalesce(sum(pickup_picked), 0) as total_pickup_picked,
        count(distinct driver_id)::bigint as total_active_riders
      from final
    )
    select
      final.*,
      totals.total_groups,
      totals.total_delivery_assigned,
      totals.total_delivery_delivered,
      totals.total_pickup_assigned,
      totals.total_pickup_picked,
      totals.total_active_riders
    from final
    cross join totals
    order by ${orderBy} ${direction}, final.delivery_delivered desc, final.pickup_picked desc, final.driver_id asc
    limit ${filters.pageSize}
    offset ${offset}
  `;

  const first = rows[0];
  return {
    filters,
    rows: rows.map((row) => ({
      report_date: row.report_date.toISOString().slice(0, 10),
      driver_id: row.driver_id,
      driver_name: row.driver_name,
      rider_name: row.rider_name,
      kv: row.kv,
      cot: row.cot,
      pickup_district: row.pickup_district,
      delivery_district: row.delivery_district,
      delivery_assigned: Number(row.delivery_assigned),
      delivery_delivered: Number(row.delivery_delivered),
      pickup_assigned: Number(row.pickup_assigned),
      pickup_picked: Number(row.pickup_picked),
      delivery_rate: decimalToNumber(row.delivery_rate),
      pickup_rate: decimalToNumber(row.pickup_rate),
    })),
    summary: first
      ? {
          groups: Number(first.total_groups ?? 0),
          active_riders: Number(first.total_active_riders ?? 0),
          delivery_assigned: decimalToNumber(first.total_delivery_assigned) ?? 0,
          delivery_delivered: decimalToNumber(first.total_delivery_delivered) ?? 0,
          pickup_assigned: decimalToNumber(first.total_pickup_assigned) ?? 0,
          pickup_picked: decimalToNumber(first.total_pickup_picked) ?? 0,
        }
      : emptySummary,
  };
});

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  if (value === null || value === undefined) return null;
  return Number(value);
}
