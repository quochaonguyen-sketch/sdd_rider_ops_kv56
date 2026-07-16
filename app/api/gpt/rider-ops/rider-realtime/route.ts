import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  auditGptRead,
  authorizeGptAction,
  gptJson,
  normalizeSearch,
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

const filtersSchema = z.object({
  date: dateSchema,
  query: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

type RiderRow = {
  id: string;
  rider_code: string;
  full_name: string | null;
  kv: string | null;
  cot: string | null;
  status: string | null;
  delivery_district: string | null;
  delivery_ward: string | null;
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
  snapshot_id: string;
  snapshot_at: string;
};

function realtimeStatus(row: RealtimeRow) {
  const assigned = Number(row.total_assigned ?? 0);
  const delivered = Number(row.delivered ?? 0);
  const delivering = Number(row.delivering ?? 0);
  const failed = Number(row.failed ?? 0);
  const idleSeconds = Number(row.idle_delivery_seconds ?? 0);
  const failureRate = assigned > 0 ? failed / assigned : 0;

  if (
    (assigned > 0 && delivered === 0) ||
    (delivering > 0 && idleSeconds > 3600) ||
    failureRate >= 0.2
  ) {
    return "warning";
  }
  return delivering > 0 ? "delivering" : "completed";
}

function matchPriority(rider: RiderRow, query: string) {
  const code = normalizeSearch(rider.rider_code);
  const name = normalizeSearch(rider.full_name);
  if (code === query) return 0;
  if (name === query) return 1;
  if (code.includes(query)) return 2;
  if (name.includes(query)) return 3;
  return 99;
}

export async function GET(request: Request) {
  const auth = authorizeGptAction(request);
  if (!auth.ok) return auth.response;

  const searchParams = new URL(request.url).searchParams;
  const parsedFilters = filtersSchema.safeParse({
    date: searchParams.get("date") ?? undefined,
    query: searchParams.get("query") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsedFilters.success) {
    return gptJson(
      {
        success: false,
        error: "Invalid realtime rider filters",
        issues: parsedFilters.error.flatten(),
      },
      400,
    );
  }

  try {
    const admin = createAdminClient();
    const filters = parsedFilters.data;
    const query = normalizeSearch(filters.query);
    const [riderResult, latestSnapshotResult] = await Promise.all([
      admin
        .from("riders")
        .select("id,rider_code,full_name,kv,cot,status,delivery_district,delivery_ward")
        .order("rider_code")
        .limit(2000),
      admin
        .from("realtime_delivery_riders")
        .select("snapshot_id,snapshot_at")
        .eq("work_date", filters.date)
        .order("snapshot_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const firstError = riderResult.error ?? latestSnapshotResult.error;
    if (firstError) throw new Error(firstError.message);

    const matchingRiders = ((riderResult.data ?? []) as RiderRow[])
      .map((rider) => ({ rider, priority: matchPriority(rider, query) }))
      .filter((item) => item.priority < 99)
      .sort(
        (a, b) =>
          a.priority - b.priority ||
          (a.rider.full_name ?? a.rider.rider_code).localeCompare(
            b.rider.full_name ?? b.rider.rider_code,
            "vi",
          ),
      )
      .slice(0, filters.limit)
      .map((item) => item.rider);

    const latestSnapshot = latestSnapshotResult.data ?? null;
    let realtimeRows: RealtimeRow[] = [];
    if (latestSnapshot && matchingRiders.length > 0) {
      const realtimeResult = await admin
        .from("realtime_delivery_riders")
        .select(
          "driver_id,driver_name,total_assigned,delivered,delivering,failed,zone_id,first_delivery_at,idle_delivery_seconds,snapshot_id,snapshot_at",
        )
        .eq("work_date", filters.date)
        .eq("snapshot_id", latestSnapshot.snapshot_id)
        .in(
          "driver_id",
          matchingRiders.map((rider) => rider.rider_code),
        );
      if (realtimeResult.error) throw new Error(realtimeResult.error.message);
      realtimeRows = (realtimeResult.data ?? []) as RealtimeRow[];
    }

    const realtimeByCode = new Map(
      realtimeRows.map((row) => [normalizeSearch(row.driver_id), row]),
    );
    const riders = matchingRiders.map((rider) => {
      const realtime = realtimeByCode.get(normalizeSearch(rider.rider_code)) ?? null;
      if (!realtime) {
        return {
          rider_id: rider.id,
          rider_code: rider.rider_code,
          full_name: rider.full_name,
          kv: rider.kv,
          cot: rider.cot,
          master_status: rider.status,
          delivery_district: rider.delivery_district,
          delivery_ward: rider.delivery_ward,
          has_realtime_data: false,
          realtime: null,
        };
      }

      const assigned = Number(realtime.total_assigned ?? 0);
      const delivered = Number(realtime.delivered ?? 0);
      const delivering = Number(realtime.delivering ?? 0);
      const failed = Number(realtime.failed ?? 0);
      return {
        rider_id: rider.id,
        rider_code: rider.rider_code,
        full_name: rider.full_name,
        kv: rider.kv,
        cot: rider.cot,
        master_status: rider.status,
        delivery_district: rider.delivery_district,
        delivery_ward: rider.delivery_ward,
        has_realtime_data: true,
        realtime: {
          driver_name: realtime.driver_name,
          total_assigned: assigned,
          delivered,
          delivering,
          failed,
          remaining_unfinished: Math.max(0, assigned - delivered - failed),
          delivery_progress_percent:
            assigned > 0 ? Number(((delivered / assigned) * 100).toFixed(2)) : null,
          failure_rate_percent:
            assigned > 0 ? Number(((failed / assigned) * 100).toFixed(2)) : null,
          operational_status: realtimeStatus(realtime),
          zone_id: realtime.zone_id,
          first_delivery_at: realtime.first_delivery_at,
          idle_delivery_seconds: Number(realtime.idle_delivery_seconds ?? 0),
          snapshot_id: realtime.snapshot_id,
          snapshot_at: realtime.snapshot_at,
        },
      };
    });

    await auditGptRead(admin, "/api/gpt/rider-ops/rider-realtime", {
      work_date: filters.date,
      query: filters.query,
      master_matches: matchingRiders.length,
      realtime_matches: realtimeRows.length,
    });

    return gptJson({
      success: true,
      work_date: filters.date,
      query: filters.query,
      snapshot_id: latestSnapshot?.snapshot_id ?? null,
      snapshot_at: latestSnapshot?.snapshot_at ?? null,
      total_matches: riders.length,
      riders,
      definitions: {
        snapshot_scope:
          "Chỉ lấy dữ liệu của snapshot_id mới nhất trong ngày; không cộng nhiều snapshot.",
        operational_status:
          "Cùng logic Realtime Dashboard: warning khi chưa giao được đơn nào, idle trên 1 giờ khi còn đơn, hoặc tỷ lệ lỗi từ 20%; delivering khi còn đơn đang giao; ngược lại completed.",
      },
    });
  } catch (error) {
    return gptJson(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unable to load rider realtime data",
      },
      500,
    );
  }
}
