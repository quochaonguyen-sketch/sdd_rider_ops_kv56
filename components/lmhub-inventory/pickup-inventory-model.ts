import {
  addCounts,
  cotBucket,
  emptyCounts,
  filterBoard,
  heatLevel,
  normalize,
  normalizeArea,
  visibleBoardTotal,
  visibleTotal,
  type Area,
  type CotFilter,
  type Counts,
  type DistrictAgg,
  type HeatFilter,
  type InventoryFocus,
  type WardAgg,
} from "@/components/lmhub-inventory/lmhub-inventory-model";

export type PickupSummaryRow = {
  snapshot_id: string | null;
  snapshot_at: string | null;
  khu_vuc: string | null;
  ward: string | null;
  phuong: string | null;
  cot: string | null;
  area: string | null;
  route_area: string | null;
  assign_orders: number | null;
  picked_orders: number | null;
  onhold_orders: number | null;
  created_orders: number | null;
};

export type PickupRiderRow = {
  snapshot_id: string | null;
  snapshot_at: string | null;
  driver_id: string;
  driver_name: string | null;
  khu_vuc: string | null;
  ward: string | null;
  phuong: string | null;
  area: string | null;
  ward_area: string | null;
  assigned_orders: number | null;
  picked_orders: number | null;
  onhold_orders: number | null;
};

export type PickupMetrics = Counts & {
  assigned: number;
  picked: number;
  onhold: number;
  pending: number;
};

export const PICKUP_SUMMARY_COLUMNS =
  "snapshot_id,snapshot_at,khu_vuc,ward,phuong,cot,area,route_area,assign_orders,picked_orders,onhold_orders,created_orders";
export const PICKUP_RIDER_COLUMNS =
  "snapshot_id,snapshot_at,driver_id,driver_name,khu_vuc,ward,phuong,area,ward_area,assigned_orders,picked_orders,onhold_orders";
export const PAGE_ROWS = 1000;
export const PAGE_SIZE = 40;
export const UNKNOWN_WARD = "Chưa xác định phường";
export const UNKNOWN_ROUTE = "Chưa xác định tuyến";

export function stockOf(assigned: number, picked: number) {
  return Math.max(0, n(assigned) - n(picked));
}

export function n(value: number | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export function cleanWard(row: { ward?: string | null; phuong?: string | null }) {
  return String(row.ward || row.phuong || "").trim() || UNKNOWN_WARD;
}

export function cleanRoute(value: string | null | undefined) {
  return String(value || "").trim() || UNKNOWN_ROUTE;
}

export function cleanArea(value: string | null | undefined): Area | string {
  return normalizeArea(String(value ?? ""));
}

export function pendingOf(row: { assign_orders?: number | null; picked_orders?: number | null }) {
  return stockOf(n(row.assign_orders), n(row.picked_orders));
}

export function riderPending(row: PickupRiderRow) {
  return stockOf(n(row.assigned_orders), n(row.picked_orders));
}

export function buildPickupBoard(rows: PickupSummaryRow[], area: Area): DistrictAgg[] {
  const map = new Map<string, Map<string, Counts>>();
  for (const row of rows) {
    if (cleanArea(row.area) !== area) continue;
    const ward = cleanWard(row);
    const route = cleanRoute(row.khu_vuc);
    if (!map.has(ward)) map.set(ward, new Map());
    const routes = map.get(ward)!;
    const current = routes.get(route) ?? emptyCounts();
    const stock = pendingOf(row);
    current[cotBucket(String(row.cot ?? ""))] += stock;
    current.total += stock;
    routes.set(route, current);
  }
  return [...map.entries()].map(([ward, routes]) => {
    const routeList: WardAgg[] = [...routes.entries()].map(([route, counts]) => ({
      ward: route,
      district: ward,
      area,
      ...counts,
    }));
    return {
      district: ward,
      area,
      wards: routeList,
      totals: routeList.reduce((sum, item) => addCounts(sum, item), emptyCounts()),
    };
  });
}

export function pickupAnalytics(kv5: DistrictAgg[], kv6: DistrictAgg[], cot: CotFilter) {
  const districts = [...kv5, ...kv6];
  const routes = districts.flatMap((item) => item.wards);
  const heatBins = [
    { key: "zero", label: "Hết tồn (0)", count: 0, className: "bg-white border border-[var(--color-rule)]" },
    { key: "green", label: "Ít (1–5)", count: 0, className: "bg-[var(--color-success)]" },
    { key: "yellow", label: "Vừa (6–20)", count: 0, className: "bg-[var(--color-warning)]" },
    { key: "orange", label: "Cao (21–35)", count: 0, className: "bg-[#d97706]" },
    { key: "red", label: "Đỏ (36+)", count: 0, className: "bg-[var(--color-error)]" },
  ];
  for (const route of routes) {
    const level = heatLevel(visibleTotal(route, cot));
    const bin = heatBins.find((item) => item.key === level);
    if (bin) bin.count += 1;
  }
  const topWards = districts
    .map((item) => ({ label: item.district, area: item.area, value: visibleTotal(item.totals, cot) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  return {
    wards: districts.length,
    routes: routes.length,
    hotWards: districts.filter((item) => heatLevel(visibleTotal(item.totals, "all")) === "red").length,
    emptyWards: districts.filter((item) => visibleTotal(item.totals, cot) <= 0).length,
    visible: visibleBoardTotal(kv5, cot) + visibleBoardTotal(kv6, cot),
    cot1: districts.reduce((sum, item) => sum + item.totals.cot1, 0),
    cot2: districts.reduce((sum, item) => sum + item.totals.cot2, 0),
    topWards,
    heatBins,
  };
}

export function filterPickupBoard(districts: DistrictAgg[], query: string, cot: CotFilter, heat: HeatFilter) {
  return filterBoard(districts, query, cot, heat);
}

export function matchesFocus(row: { area?: string | null; ward?: string | null; phuong?: string | null; khu_vuc?: string | null }, focus: InventoryFocus) {
  if (cleanArea(row.area) !== focus.area) return false;
  if (cleanWard(row) !== focus.district) return false;
  if (focus.ward && cleanRoute(row.khu_vuc) !== focus.ward) return false;
  return true;
}

export function matchesCot(value: string | null | undefined, cot: CotFilter) {
  if (cot === "all") return true;
  return cotBucket(String(value ?? "")) === cot;
}

export function searchBlob(parts: Array<string | null | undefined>) {
  return normalize(parts.filter(Boolean).join(" "));
}

export type { Area, CotFilter, HeatFilter, InventoryFocus, DistrictAgg };
export { visibleBoardTotal, visibleTotal, pct } from "@/components/lmhub-inventory/lmhub-inventory-model";
