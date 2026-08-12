import "server-only";

import type { RiderRegistryData, RiderRegistryItem } from "@/types";
import { getCachedRiderRegistry } from "@/lib/cache/operations-cache";
import {
  districtDefinitionFor,
  districtMatches,
  hcmDistricts,
  normalizeLocation,
  wardMatches,
} from "@/lib/locations/hcm";

export type RiderRegistrySortKey = "name" | "status" | "zone" | "cot" | "updated";

export type RiderRegistryQuery = {
  query: string;
  kv: string;
  cot: string;
  pickupDistrict: string;
  pickupWard: string;
  deliveryDistrict: string;
  deliveryWard: string;
  status: string;
  shift: string;
  sortKey: RiderRegistrySortKey;
  sortDirection: "asc" | "desc";
  page: number;
  pageSize: number;
};

export const DEFAULT_RIDER_REGISTRY_QUERY: RiderRegistryQuery = {
  query: "",
  kv: "all",
  cot: "all",
  pickupDistrict: "all",
  pickupWard: "all",
  deliveryDistrict: "all",
  deliveryWard: "all",
  status: "all",
  shift: "all",
  sortKey: "updated",
  sortDirection: "desc",
  page: 1,
  pageSize: 20,
};

export function riderRegistryQueryFromUrl(url: URL): RiderRegistryQuery {
  const params = url.searchParams;
  const sortKey = params.get("sort");
  const sortDirection = params.get("direction");

  return {
    query: params.get("q")?.trim().slice(0, 160) ?? "",
    kv: filterValue(params.get("kv")),
    cot: filterValue(params.get("cot")),
    pickupDistrict: filterValue(params.get("pickup_district")),
    pickupWard: filterValue(params.get("pickup_ward")),
    deliveryDistrict: filterValue(params.get("delivery_district")),
    deliveryWard: filterValue(params.get("delivery_ward")),
    status: filterValue(params.get("status")),
    shift: filterValue(params.get("shift")),
    sortKey: isSortKey(sortKey) ? sortKey : DEFAULT_RIDER_REGISTRY_QUERY.sortKey,
    sortDirection: sortDirection === "asc" ? "asc" : "desc",
    page: positiveInteger(params.get("page"), 1),
    pageSize: Math.min(100, positiveInteger(params.get("page_size"), DEFAULT_RIDER_REGISTRY_QUERY.pageSize)),
  };
}

export async function getRiderRegistryData(query: RiderRegistryQuery): Promise<RiderRegistryData> {
  const { data: riders, cache } = await getCachedRiderRegistry();
  const normalizedQuery = normalizeLocation(query.query);
  const filtered = riders
    .filter((rider) => matchesRegistryQuery(rider, query, normalizedQuery))
    .sort((a, b) => compareRiders(a, b, query.sortKey) * (query.sortDirection === "asc" ? 1 : -1));
  const pageCount = Math.max(1, Math.ceil(filtered.length / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const start = (page - 1) * query.pageSize;

  return {
    riders: filtered.slice(start, start + query.pageSize),
    total: filtered.length,
    page,
    page_size: query.pageSize,
    page_count: pageCount,
    stats: registryStats(riders),
    options: {
      cots: uniqueOptions(riders.map((rider) => rider.cot)),
      shifts: uniqueOptions(riders.map((rider) => rider.current_shift)),
      delivery_districts: uniqueOptions(
        riders.map((rider) => districtDefinitionFor(rider.delivery_district, hcmDistricts)?.shortName ?? rider.delivery_district),
      ),
    },
    cache,
  };
}

export function emptyRiderRegistryData(): RiderRegistryData {
  return {
    riders: [],
    total: 0,
    page: 1,
    page_size: DEFAULT_RIDER_REGISTRY_QUERY.pageSize,
    page_count: 1,
    stats: { total: 0, active: 0, inactive: 0, on_shift: 0, unassigned: 0 },
    options: { cots: [], shifts: [], delivery_districts: [] },
    cache: { hit: false, expires_at: null },
  };
}

function matchesRegistryQuery(rider: RiderRegistryItem, query: RiderRegistryQuery, normalizedQuery: string) {
  const matchesQuery =
    !normalizedQuery ||
    [
      rider.rider_code,
      rider.full_name,
      rider.home_district,
      rider.pickup_district,
      rider.pickup_ward,
      rider.point_name,
      rider.delivery_district,
      rider.delivery_ward,
      rider.cot,
      rider.kv,
      rider.phone,
    ].some((value) => normalizeLocation(value).includes(normalizedQuery));
  const matchesKv = query.kv === "all" || canonicalKv(rider.kv) === query.kv;
  const matchesCot = query.cot === "all" || rider.cot === query.cot;
  const matchesPickupDistrict =
    query.pickupDistrict === "all" || districtMatches(rider.pickup_district, query.pickupDistrict, hcmDistricts);
  const matchesPickupWard =
    query.pickupWard === "all" || wardMatches(rider.pickup_district, rider.pickup_ward, query.pickupWard, hcmDistricts);
  const matchesDeliveryDistrict =
    query.deliveryDistrict === "all" ||
    (query.deliveryDistrict === "__unassigned__"
      ? !rider.zone_id && !rider.delivery_district
      : districtMatches(rider.delivery_district, query.deliveryDistrict, hcmDistricts));
  const matchesDeliveryWard =
    query.deliveryWard === "all" ||
    wardMatches(rider.delivery_district, rider.delivery_ward, query.deliveryWard, hcmDistricts);
  const matchesStatus = query.status === "all" || rider.status === query.status;
  const matchesShift =
    query.shift === "all" ||
    (query.shift === "__has__"
      ? Boolean(rider.current_shift)
      : query.shift === "__none__"
        ? !rider.current_shift
        : rider.current_shift === query.shift);

  return (
    matchesQuery &&
    matchesKv &&
    matchesCot &&
    matchesPickupDistrict &&
    matchesPickupWard &&
    matchesDeliveryDistrict &&
    matchesDeliveryWard &&
    matchesStatus &&
    matchesShift
  );
}

function registryStats(riders: RiderRegistryItem[]) {
  let active = 0;
  let onShift = 0;
  let unassigned = 0;

  for (const rider of riders) {
    if (rider.status !== "inactive") active += 1;
    if (rider.current_shift) onShift += 1;
    if (!rider.zone_id && !rider.delivery_district) unassigned += 1;
  }

  return {
    total: riders.length,
    active,
    inactive: riders.length - active,
    on_shift: onShift,
    unassigned,
  };
}

function compareRiders(a: RiderRegistryItem, b: RiderRegistryItem, key: RiderRegistrySortKey) {
  if (key === "name") return (a.full_name ?? a.rider_code).localeCompare(b.full_name ?? b.rider_code, "vi", { numeric: true });
  if (key === "status") return (a.status ?? "active").localeCompare(b.status ?? "active");
  if (key === "zone") return (a.delivery_district ?? "").localeCompare(b.delivery_district ?? "", "vi", { numeric: true });
  if (key === "cot") return (a.cot ?? "").localeCompare(b.cot ?? "", "vi", { numeric: true });
  return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
}

function uniqueOptions(values: Array<string | null | undefined>) {
  const options = new Map<string, string>();
  for (const value of values) {
    const clean = value?.trim();
    if (!clean) continue;
    options.set(normalizeLocation(clean), clean);
  }
  return Array.from(options.values()).sort((a, b) => a.localeCompare(b, "vi"));
}

function canonicalKv(value: string | null) {
  const match = normalizeLocation(value).match(/^(?:kv|khu vuc)?\s*([56])$/);
  return match ? `KV${match[1]}` : value?.trim().toUpperCase() ?? "";
}

function filterValue(value: string | null) {
  return value?.trim() || "all";
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isSortKey(value: string | null): value is RiderRegistrySortKey {
  return value === "name" || value === "status" || value === "zone" || value === "cot" || value === "updated";
}
