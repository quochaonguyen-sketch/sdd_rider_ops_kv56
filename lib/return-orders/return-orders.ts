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
  manual_assignment: boolean;
  return_driver_profile_name: string;
  return_driver_kv: string;
  create_time: string | null;
  receive_time: string | null;
  current_station_received_time: string | null;
};

export type ReturningRiderOrder = {
  shipmentId: string;
  shopeeOrderSn: string;
  zone: string;
  district: string;
  ward: string;
  scannedAt: string | null;
};

export type ReturningRiderPlanOrder = {
  shipmentId: string;
  shopeeOrderSn: string;
  zone: string;
  district: string;
  ward: string;
  cot: string;
  assignment: "manual" | "candidate";
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
    returningRiders: Array<{
      id: string;
      name: string;
      total: number;
      cots: string[];
      kv: string;
      scannedFrom: string | null;
      scannedOrders: ReturningRiderOrder[];
      planOrders: ReturningRiderPlanOrder[];
    }>;
  };
};

export type ReturnOrderFilters = {
  q: string;
  status: string;
  district: string;
  sort: "aging_desc" | "district_ward";
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
  const rawStatus = get("status");
  return {
    q: get("q").trim().slice(0, 100),
    status: rawStatus === "backlog" || ["10", "67"].includes(rawStatus)
      ? "backlog"
      : rawStatus === "returning" || rawStatus === "72"
        ? "returning"
        : "",
    district: RETURN_ORDER_DISTRICTS.includes(district as (typeof RETURN_ORDER_DISTRICTS)[number])
      ? district
      : "",
    sort: get("sort") === "aging_desc" ? "aging_desc" : "district_ward",
    page,
    pageSize,
  };
}

function safeSearch(value: string) {
  return value.replace(/[%_,().]/g, " ").replace(/\s+/g, " ").trim();
}

export function getReturnDriverCots(
  driverId: string,
  driverName: string,
  cot1: string,
  cot2: string,
) {
  const id = driverId.trim().toLocaleLowerCase("vi");
  const name = driverName.trim().toLocaleLowerCase("vi");
  const matches = (assignment: string) => {
    const normalized = assignment.trim().toLocaleLowerCase("vi");
    return Boolean(normalized && ((id && normalized.includes(id)) || (name && normalized.includes(name))));
  };

  return [
    ...(matches(cot1) ? ["COT1"] : []),
    ...(matches(cot2) ? ["COT2"] : []),
  ];
}

async function loadReturnDashboardContext(
  supabase: ReturnType<typeof createAdminClient>,
  snapshotId: string,
) {
  const [fm, lm, returning, mapped, returningRows, planRows, wardRows, riderProfiles, ...districtResults] = await Promise.all([
    supabase
      .from("return_order_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_id", snapshotId)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .eq("order_status", 67),
    supabase
      .from("return_order_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_id", snapshotId)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .eq("order_status", 10),
    supabase
      .from("return_order_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_id", snapshotId)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .eq("order_status", 72),
    supabase
      .from("return_order_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("snapshot_id", snapshotId)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .in("order_status", [10, 67, 72]),
    supabase
      .from("return_order_snapshots")
      .select(
        "shipment_id,shopee_order_sn,return_driver_id,return_driver_name,return_riders_cot1,return_riders_cot2,return_zone,seller_area,seller_district,seller_new_ward,seller_ward,current_station_received_time",
      )
      .eq("snapshot_id", snapshotId)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .eq("order_status", 72)
      .neq("return_driver_id", ""),
    supabase
      .from("return_order_snapshots")
      .select(
        "shipment_id,shopee_order_sn,return_rider_codes,return_riders_cot1,return_riders_cot2,return_zone,seller_area,seller_district,seller_new_ward,seller_ward",
      )
      .eq("snapshot_id", snapshotId)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .in("order_status", [10, 67]),
    supabase
      .from("return_order_snapshots")
      .select("seller_district,seller_new_ward,seller_ward")
      .eq("snapshot_id", snapshotId)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .in("order_status", [10, 67, 72])
      .in("seller_district", [...RETURN_ORDER_DISTRICTS]),
    supabase
      .from("riders")
      .select("rider_code,full_name,kv,cot"),
    ...RETURN_ORDER_DISTRICTS.map((district) =>
      supabase
        .from("return_order_snapshots")
        .select("*", { count: "exact", head: true })
        .eq("snapshot_id", snapshotId)
        .in("seller_area", ["Khu vực 5", "Khu vực 6"])
        .in("order_status", [10, 67, 72])
        .eq("seller_district", district),
    ),
  ]);
  if (fm.error) throw fm.error;
  if (lm.error) throw lm.error;
  if (returning.error) throw returning.error;
  if (mapped.error) throw mapped.error;
  if (returningRows.error) throw returningRows.error;
  if (planRows.error) throw planRows.error;
  if (wardRows.error) throw wardRows.error;
  if (riderProfiles.error) throw riderProfiles.error;
  for (const district of districtResults) if (district.error) throw district.error;
  return { fm, lm, returning, mapped, returningRows, planRows, wardRows, riderProfiles, districtResults };
}

type ReturnDashboardContext = Awaited<ReturnType<typeof loadReturnDashboardContext>>;
const returnDashboardCache = new Map<string, {
  expiresAt: number;
  promise: Promise<ReturnDashboardContext>;
}>();
const RETURN_DASHBOARD_TTL_MS = 30_000;

async function getCachedReturnDashboardContext(
  supabase: ReturnType<typeof createAdminClient>,
  snapshotId: string,
) {
  const cached = returnDashboardCache.get(snapshotId);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = loadReturnDashboardContext(supabase, snapshotId);
  returnDashboardCache.set(snapshotId, {
    expiresAt: Date.now() + RETURN_DASHBOARD_TTL_MS,
    promise,
  });
  try {
    return await promise;
  } catch (error) {
    returnDashboardCache.delete(snapshotId);
    throw error;
  }
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
    .in("seller_area", ["Khu vực 5", "Khu vực 6"])
    .in("order_status", [10, 67, 72]);

  if (filters.status === "backlog") query = query.in("order_status", [10, 67]);
  if (filters.status === "returning") query = query.eq("order_status", 72);
  if (filters.district) query = query.eq("seller_district", filters.district);
  const search = safeSearch(filters.q);
  if (search) {
    query = query.or(
      `shipment_id.ilike.%${search}%,sls_tracking_number.ilike.%${search}%,shopee_order_sn.ilike.%${search}%,seller_ward.ilike.%${search}%,seller_new_ward.ilike.%${search}%,seller_area.ilike.%${search}%,pickup_point_id.ilike.%${search}%,return_zone.ilike.%${search}%,return_rider_codes.ilike.%${search}%,return_rider_names.ilike.%${search}%,return_driver_id.ilike.%${search}%,return_driver_name.ilike.%${search}%`,
    );
  }

  const from = (filters.page - 1) * filters.pageSize;
  const orderedQuery = filters.sort === "aging_desc"
    ? query
        .order("create_time", { ascending: true, nullsFirst: false })
        .order("seller_district", { ascending: true, nullsFirst: false })
        .order("seller_new_ward", { ascending: true, nullsFirst: false })
    : query
        .order("seller_district", { ascending: true, nullsFirst: false })
        .order("seller_new_ward", { ascending: true, nullsFirst: false })
        .order("seller_ward", { ascending: true, nullsFirst: false })
        .order("current_station_received_time", { ascending: false, nullsFirst: false });
  const [
    { data, error, count },
    { fm, lm, returning, mapped, returningRows, planRows, wardRows, riderProfiles, districtResults },
    assignmentRows,
  ] = await Promise.all([
    orderedQuery.range(from, from + filters.pageSize - 1),
    getCachedReturnDashboardContext(supabase, latest.snapshot_id),
    supabase
      .from("return_order_assignments")
      .select("shipment_id,rider_code,rider_name,cot"),
  ]);
  if (error) throw error;
  if (assignmentRows.error) throw assignmentRows.error;

  const fmHub = fm.count ?? 0;
  const lmHub = lm.count ?? 0;
  const returningCount = returning.count ?? 0;
  const assignmentsByShipment = new Map(
    (assignmentRows.data ?? []).map((assignment) => [assignment.shipment_id, assignment]),
  );
  const normalizeIdentity = (value: unknown) =>
    String(value ?? "").trim().toLocaleLowerCase("vi");
  const riderByCode = new Map(
    (riderProfiles.data ?? []).map((rider) => [normalizeIdentity(rider.rider_code), rider]),
  );
  const riderByName = new Map(
    (riderProfiles.data ?? [])
      .filter((rider) => normalizeIdentity(rider.full_name))
      .map((rider) => [normalizeIdentity(rider.full_name), rider]),
  );
  const riderProfileFor = (id: unknown, name: unknown) =>
    riderByCode.get(normalizeIdentity(id)) ?? riderByName.get(normalizeIdentity(name));
  const assignmentWithKv = (assignment: unknown) => {
    const value = String(assignment ?? "").trim();
    if (!value) return "";
    return value
      .split(/\s*[,;]\s*/)
      .filter(Boolean)
      .map((riderAssignment) => {
        const normalized = normalizeIdentity(riderAssignment);
        const leadingCode = normalizeIdentity(riderAssignment.split("·")[0]);
        const profile = riderByCode.get(leadingCode) ?? (riderProfiles.data ?? []).find((rider) => {
          const name = normalizeIdentity(rider.full_name);
          return Boolean(name && normalized.includes(name));
        });
        const kvNumber = String(profile?.kv ?? "").match(/\d+/)?.[0];
        return kvNumber ? `${riderAssignment} · KV${kvNumber}` : riderAssignment;
      })
      .join(", ");
  };
  const rows = (data ?? []).map((row) => {
    const assignment = assignmentsByShipment.get(row.shipment_id);
    const returnDriverId = String(assignment?.rider_code || row.return_driver_id || "").trim();
    const returnDriverName = String(assignment?.rider_name || row.return_driver_name || "").trim();
    const returnDriverProfile = riderProfileFor(returnDriverId, returnDriverName);
    return {
      ...row,
      return_riders_cot1: assignmentWithKv(row.return_riders_cot1),
      return_riders_cot2: assignmentWithKv(row.return_riders_cot2),
      return_driver_id: returnDriverId,
      return_driver_name: returnDriverName,
      return_driver_profile_name: String(
        returnDriverProfile?.full_name || returnDriverName,
      ).trim(),
      return_driver_kv: String(returnDriverProfile?.kv || "").trim(),
      manual_assignment: Boolean(assignment),
    };
  }) as ReturnOrderRow[];
  const riderTotals = new Map<
    string,
    {
      id: string;
      name: string;
      total: number;
      cots: Set<string>;
      kv: string;
      scannedOrders: ReturningRiderOrder[];
      planOrders: ReturningRiderPlanOrder[];
    }
  >();
  for (const row of returningRows.data ?? []) {
    const assignment = assignmentsByShipment.get(row.shipment_id);
    const id = String(assignment?.rider_code || row.return_driver_id || "").trim();
    if (!id) continue;
    const current = riderTotals.get(id);
    const cots = current?.cots ?? new Set<string>();
    const profile = riderProfileFor(id, assignment?.rider_name || row.return_driver_name);
    const assignedCot = String(assignment?.cot || "").trim().toLocaleUpperCase("vi");
    if (["COT1", "1"].includes(assignedCot)) {
      cots.add("COT1");
    } else if (["COT2", "2"].includes(assignedCot)) {
      cots.add("COT2");
    } else {
      for (const cot of getReturnDriverCots(
        id,
        String(assignment?.rider_name || row.return_driver_name || "").trim(),
        String(row.return_riders_cot1 || ""),
        String(row.return_riders_cot2 || ""),
      )) {
        cots.add(cot);
      }
    }
    riderTotals.set(id, {
      id,
      name: String(
        profile?.full_name ||
        assignment?.rider_name ||
        row.return_driver_name ||
        current?.name ||
        "",
      ).trim(),
      total: (current?.total ?? 0) + 1,
      cots,
      kv: String(profile?.kv || current?.kv || "").trim(),
      scannedOrders: [
        ...(current?.scannedOrders ?? []),
        {
          shipmentId: row.shipment_id,
          shopeeOrderSn: String(row.shopee_order_sn || "").trim(),
          zone: String(row.return_zone || "").trim(),
          district: String(row.seller_district || "").trim(),
          ward: String(row.seller_new_ward || row.seller_ward || "").trim(),
          scannedAt: row.current_station_received_time,
        },
      ],
      planOrders: current?.planOrders ?? [],
    });
  }

  const splitRiderCodes = (value: unknown) =>
    String(value ?? "")
      .split(/\s*[,;]\s*/)
      .map((code) => normalizeIdentity(code))
      .filter(Boolean);
  const cotForRider = (riderId: string, cot1: unknown, cot2: unknown) => {
    const hasRider = (value: unknown) =>
      String(value ?? "")
        .split(/\s*[,;]\s*/)
        .some((entry) => normalizeIdentity(entry.split("·")[0]) === riderId);
    if (hasRider(cot1)) return "COT1";
    if (hasRider(cot2)) return "COT2";
    const profileCot = String(riderByCode.get(riderId)?.cot || "").trim().toUpperCase();
    if (["COT1", "1"].includes(profileCot)) return "COT1";
    if (["COT2", "2"].includes(profileCot)) return "COT2";
    return "";
  };

  for (const row of planRows.data ?? []) {
    const assignment = assignmentsByShipment.get(row.shipment_id);
    const manuallyAssignedId = normalizeIdentity(assignment?.rider_code);
    const candidateIds = manuallyAssignedId
      ? [manuallyAssignedId]
      : splitRiderCodes(row.return_rider_codes);

    for (const riderId of new Set(candidateIds)) {
      const rider = riderTotals.get(riderId);
      if (!rider) continue;
      const cot = String(assignment?.cot || "").trim().toUpperCase()
        || cotForRider(riderId, row.return_riders_cot1, row.return_riders_cot2);
      rider.planOrders.push({
        shipmentId: row.shipment_id,
        shopeeOrderSn: String(row.shopee_order_sn || "").trim(),
        zone: String(row.return_zone || "").trim(),
        district: String(row.seller_district || "").trim(),
        ward: String(row.seller_new_ward || row.seller_ward || "").trim(),
        cot,
        assignment: manuallyAssignedId ? "manual" : "candidate",
      });
      if (cot) rider.cots.add(cot);
    }
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
    rows,
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
      returningRiders: [...riderTotals.values()]
        .map((rider) => ({
          ...rider,
          cots: [...rider.cots],
          scannedFrom: rider.scannedOrders
            .map((order) => order.scannedAt)
            .filter((value): value is string => Boolean(value))
            .sort((a, b) => a.localeCompare(b))[0] ?? null,
          scannedOrders: rider.scannedOrders.sort((a, b) =>
            (b.scannedAt ?? "").localeCompare(a.scannedAt ?? "")),
          planOrders: rider.planOrders.sort((a, b) =>
            a.zone.localeCompare(b.zone, "vi")
            || a.ward.localeCompare(b.ward, "vi")
            || a.shipmentId.localeCompare(b.shipmentId, "vi")),
        }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "vi")),
    },
  };
}
