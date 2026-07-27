import { createAdminClient } from "@/lib/supabase/admin";

export const RETURN_ORDER_DISTRICTS = ["Quận 12", "Quận Gò Vấp", "Quận Bình Thạnh", "Quận 3"] as const;

export type ReturnOrderRow = {
  shipment_id: string;
  sls_tracking_number: string;
  shopee_order_sn: string;
  order_status: number;
  status_label: string;
  lowest_seller_address_id: string;
  seller_district: string;
  seller_ward: string;
  seller_new_ward: string;
  seller_area: string;
  seller_zone_id: string;
  order_zone_id: string;
  current_station_name: string;
  pickup_station_name: string;
  pickup_point_id: string;
  return_zone: string;
  return_rider_codes: string;
  return_rider_names: string;
  return_riders_cot1: string;
  return_riders_cot2: string;
  return_driver_id: string;
  return_driver_name: string;
  create_time: string | null;
  receive_time: string | null;
  current_station_received_time: string | null;
};

export type ReturnOrderResult = {
  rows: ReturnOrderRow[];
  total: number;
  page: number;
  pageSize: number;
  snapshotAt: string | null;
  summary: {
    total: number;
    fmHub: number;
    lmHub: number;
    returning: number;
    mapped: number;
    districts: Record<string, number>;
    wardsByDistrict: Record<string, Array<{ ward: string; total: number }>>;
    returningRiders: Array<{ id: string; name: string; total: number }>;
  };
};

export type ReturnOrderFilters = {
  q: string;
  status: string;
  district: string;
  page: number;
  pageSize: number;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function parseReturnOrderFilters(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): ReturnOrderFilters {
  const get = (key: string) =>
    params instanceof URLSearchParams ? params.get(key) ?? "" : first(params[key]);
  const page = Math.max(1, Number.parseInt(get("page"), 10) || 1);
  const pageSize = Math.min(100, Math.max(10, Number.parseInt(get("pageSize"), 10) || 50));
  const district = get("district");
  return {
    q: get("q").trim().slice(0, 100),
    status: ["10", "67", "72"].includes(get("status")) ? get("status") : "",
    district: RETURN_ORDER_DISTRICTS.includes(district as (typeof RETURN_ORDER_DISTRICTS)[number])
      ? district
      : "",
    page,
    pageSize,
  };
}

function safeSearch(value: string) {
  return value.replace(/[%_,().]/g, " ").replace(/\s+/g, " ").trim();
}

export async function getReturnOrders(filters: ReturnOrderFilters): Promise<ReturnOrderResult> {
  const supabase = createAdminClient();
  const { data: latest, error: latestError } = await supabase
    .from("return_order_snapshots")
    .select("snapshot_id,snapshot_at")
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) throw latestError;
  if (!latest) {
    return {
      rows: [],
      total: 0,
      page: filters.page,
      pageSize: filters.pageSize,
      snapshotAt: null,
      summary: {
        total: 0,
        fmHub: 0,
        lmHub: 0,
        returning: 0,
        mapped: 0,
        districts: {},
        wardsByDistrict: {},
        returningRiders: [],
      },
    };
  }

  let query = supabase
    .from("return_order_snapshots")
    .select(
      "shipment_id,sls_tracking_number,shopee_order_sn,order_status,status_label,lowest_seller_address_id,seller_district,seller_ward,seller_new_ward,seller_area,seller_zone_id,order_zone_id,current_station_name,pickup_station_name,pickup_point_id,return_zone,return_rider_codes,return_rider_names,return_riders_cot1,return_riders_cot2,return_driver_id,return_driver_name,create_time,receive_time,current_station_received_time",
      { count: "exact" },
    )
    .eq("snapshot_id", latest.snapshot_id)
    .in("seller_area", ["Khu vực 5", "Khu vực 6"]);

  if (filters.status) query = query.eq("order_status", Number(filters.status));
  if (filters.district) query = query.eq("seller_district", filters.district);
  const search = safeSearch(filters.q);
  if (search) {
    query = query.or(
      `shipment_id.ilike.%${search}%,sls_tracking_number.ilike.%${search}%,shopee_order_sn.ilike.%${search}%,seller_ward.ilike.%${search}%,seller_new_ward.ilike.%${search}%,seller_area.ilike.%${search}%,pickup_point_id.ilike.%${search}%,return_zone.ilike.%${search}%,return_rider_codes.ilike.%${search}%,return_rider_names.ilike.%${search}%,return_driver_id.ilike.%${search}%,return_driver_name.ilike.%${search}%`,
    );
  }

  const from = (filters.page - 1) * filters.pageSize;
  const [{ data, error, count }, fm, lm, returning, mapped, returningRows, wardRows, ...districtResults] = await Promise.all([
    query
      .order("current_station_received_time", { ascending: false, nullsFirst: false })
      .range(from, from + filters.pageSize - 1),
    supabase
      .from("return_order_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_id", latest.snapshot_id)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .eq("order_status", 67),
    supabase
      .from("return_order_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_id", latest.snapshot_id)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .eq("order_status", 10),
    supabase
      .from("return_order_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_id", latest.snapshot_id)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .eq("order_status", 72),
    supabase
      .from("return_order_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_id", latest.snapshot_id)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"]),
    supabase
      .from("return_order_snapshots")
      .select("return_driver_id,return_driver_name")
      .eq("snapshot_id", latest.snapshot_id)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .eq("order_status", 72)
      .neq("return_driver_id", ""),
    supabase
      .from("return_order_snapshots")
      .select("seller_district,seller_new_ward,seller_ward")
      .eq("snapshot_id", latest.snapshot_id)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .in("seller_district", [...RETURN_ORDER_DISTRICTS]),
    ...RETURN_ORDER_DISTRICTS.map((district) =>
      supabase
        .from("return_order_snapshots")
        .select("*", { count: "exact", head: true })
        .eq("snapshot_id", latest.snapshot_id)
        .in("seller_area", ["Khu vực 5", "Khu vực 6"])
        .eq("seller_district", district),
    ),
  ]);
  if (error) throw error;
  if (fm.error) throw fm.error;
  if (lm.error) throw lm.error;
  if (returning.error) throw returning.error;
  if (mapped.error) throw mapped.error;
  if (returningRows.error) throw returningRows.error;
  if (wardRows.error) throw wardRows.error;
  for (const district of districtResults) if (district.error) throw district.error;

  const fmHub = fm.count ?? 0;
  const lmHub = lm.count ?? 0;
  const returningCount = returning.count ?? 0;
  const riderTotals = new Map<string, { id: string; name: string; total: number }>();
  for (const row of returningRows.data ?? []) {
    const id = String(row.return_driver_id || "").trim();
    if (!id) continue;
    const current = riderTotals.get(id);
    riderTotals.set(id, {
      id,
      name: String(row.return_driver_name || current?.name || "").trim(),
      total: (current?.total ?? 0) + 1,
    });
  }
  const wardCounts = new Map<string, Map<string, number>>();
  for (const district of RETURN_ORDER_DISTRICTS) wardCounts.set(district, new Map());
  for (const row of wardRows.data ?? []) {
    const district = row.seller_district || "Chưa xác định";
    const districtWards = wardCounts.get(district);
    if (!districtWards) continue;
    const ward = row.seller_new_ward || row.seller_ward || "Chưa xác định";
    districtWards.set(ward, (districtWards.get(ward) ?? 0) + 1);
  }

  return {
    rows: (data ?? []) as ReturnOrderRow[],
    total: count ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
    snapshotAt: latest.snapshot_at,
    summary: {
      total: fmHub + lmHub + returningCount,
      fmHub,
      lmHub,
      returning: returningCount,
      mapped: mapped.count ?? 0,
      districts: Object.fromEntries(
        RETURN_ORDER_DISTRICTS.map((district, index) => [district, districtResults[index]?.count ?? 0]),
      ),
      wardsByDistrict: Object.fromEntries(
        RETURN_ORDER_DISTRICTS.map((district) => [
          district,
          [...(wardCounts.get(district)?.entries() ?? [])]
            .map(([ward, total]) => ({ ward, total }))
            .sort((a, b) => b.total - a.total || a.ward.localeCompare(b.ward, "vi")),
        ]),
      ),
      returningRiders: [...riderTotals.values()].sort(
        (a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi"),
      ),
    },
  };
}
