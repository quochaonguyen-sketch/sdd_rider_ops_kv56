import {
  addCounts,
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

export type PickupPivotRow = {
  driver_id: string;
  driver_name: string | null;
  area: string | null;
  rider_cot: string | null;
  assigned_cot1: number | null;
  assigned_cot2: number | null;
  assigned_total: number | null;
  onhold_orders: number | null;
  zones: string | null;
  snapshot_id: string | null;
  snapshot_at: string | null;
  updated_at: string | null;
};

export const PICKUP_PIVOT_COLUMNS =
  "driver_id,driver_name,area,rider_cot,assigned_cot1,assigned_cot2,assigned_total,onhold_orders,zones,snapshot_id,snapshot_at,updated_at";
export const PAGE_ROWS = 1000;
export const PAGE_SIZE = 40;
export const UNKNOWN_ZONE = "Chưa có tuyến";

export function n(value: number | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export function cleanArea(value: string | null | undefined): Area | string {
  return normalizeArea(String(value ?? ""));
}

export function cleanZones(value: string | null | undefined) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ") || UNKNOWN_ZONE;
}

export function riderCotLabel(value: string | null | undefined) {
  const raw = String(value ?? "").replace(/\s+/g, "").toUpperCase();
  if (raw.includes("COT1") || raw === "1") return "COT1";
  if (raw.includes("COT2") || raw === "2") return "COT2";
  return raw || "COT?";
}

export function riderSheetLabel(row: PickupPivotRow) {
  const name = String(row.driver_name || "").trim() || "—";
  return `[${riderCotLabel(row.rider_cot)}] ${row.driver_id}-${name}`;
}

export function riderPending(row: PickupPivotRow) {
  return Math.max(0, n(row.assigned_total));
}

export function buildPickupBoard(rows: PickupPivotRow[], area: Area): DistrictAgg[] {
  const map = new Map<string, WardAgg[]>();
  for (const row of rows) {
    if (cleanArea(row.area) !== area) continue;
    const zones = cleanZones(row.zones);
    const counts: Counts = {
      cot1: n(row.assigned_cot1),
      cot2: n(row.assigned_cot2),
      total: n(row.assigned_total) || n(row.assigned_cot1) + n(row.assigned_cot2),
    };
    const item: WardAgg = {
      ward: riderSheetLabel(row),
      district: zones,
      area,
      ...counts,
    };
    const list = map.get(zones) ?? [];
    list.push(item);
    map.set(zones, list);
  }
  return [...map.entries()].map(([zones, riders]) => ({
    district: zones,
    area,
    wards: riders.sort((a, b) => visibleTotal(b, "all") - visibleTotal(a, "all") || a.ward.localeCompare(b.ward, "vi")),
    totals: riders.reduce((sum, item) => addCounts(sum, item), emptyCounts()),
  }));
}

export function pickupAnalytics(kv5: DistrictAgg[], kv6: DistrictAgg[], cot: CotFilter) {
  const districts = [...kv5, ...kv6];
  const riders = districts.flatMap((item) => item.wards);
  const heatBins = [
    { key: "zero", label: "Hết tồn (0)", count: 0, className: "bg-white border border-[var(--color-rule)]" },
    { key: "green", label: "Ít (1–5)", count: 0, className: "bg-[var(--color-success)]" },
    { key: "yellow", label: "Vừa (6–20)", count: 0, className: "bg-[var(--color-warning)]" },
    { key: "orange", label: "Cao (21–35)", count: 0, className: "bg-[#d97706]" },
    { key: "red", label: "Đỏ (36+)", count: 0, className: "bg-[var(--color-error)]" },
  ];
  for (const rider of riders) {
    const level = heatLevel(visibleTotal(rider, cot));
    const bin = heatBins.find((item) => item.key === level);
    if (bin) bin.count += 1;
  }
  const topZones = districts
    .map((item) => ({ label: item.district, area: item.area, value: visibleTotal(item.totals, cot) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  return {
    zones: districts.length,
    riders: riders.length,
    hotRiders: riders.filter((item) => heatLevel(visibleTotal(item, "all")) === "red").length,
    emptyRiders: riders.filter((item) => visibleTotal(item, cot) <= 0).length,
    visible: visibleBoardTotal(kv5, cot) + visibleBoardTotal(kv6, cot),
    cot1: districts.reduce((sum, item) => sum + item.totals.cot1, 0),
    cot2: districts.reduce((sum, item) => sum + item.totals.cot2, 0),
    topZones,
    heatBins,
  };
}

export function filterPickupBoard(districts: DistrictAgg[], query: string, cot: CotFilter, heat: HeatFilter) {
  return filterBoard(districts, query, cot, heat);
}

export function matchesFocus(row: PickupPivotRow, focus: InventoryFocus) {
  if (cleanArea(row.area) !== focus.area) return false;
  if (cleanZones(row.zones) !== focus.district) return false;
  if (focus.ward && riderSheetLabel(row) !== focus.ward) return false;
  return true;
}

export function matchesRiderCot(value: string | null | undefined, cot: CotFilter) {
  if (cot === "all") return true;
  return riderCotLabel(value).toLowerCase() === cot;
}

export function searchBlob(parts: Array<string | null | undefined>) {
  return normalize(parts.filter(Boolean).join(" "));
}

export type { Area, CotFilter, HeatFilter, InventoryFocus, DistrictAgg };
export { visibleBoardTotal, visibleTotal, pct } from "@/components/lmhub-inventory/lmhub-inventory-model";
