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
  type DistrictAgg,
  type HeatFilter,
  type InventoryFocus,
  type WardAgg,
} from "@/components/lmhub-inventory/lmhub-inventory-model";

export type PickupStatusKey = "assigned" | "onhold" | "created";

export type PickupStatusRow = {
  area: string | null;
  district: string | null;
  ward: string | null;
  zone: string | null;
  cot: string | null;
  orders: number | null;
  snapshot_id: string | null;
  snapshot_at: string | null;
  updated_at: string | null;
};

export const PICKUP_STATUS_COLUMNS = "area,district,ward,zone,cot,orders,snapshot_id,snapshot_at,updated_at";
export const PICKUP_PIVOT_TABLE = "pickup_48h_status_pivot";
export const PAGE_ROWS = 1000;
export const PAGE_SIZE = 40;
export const UNKNOWN_DISTRICT = "Chưa có quận";
export const UNKNOWN_WARD = "Chưa có phường";

export const PICKUP_STATUS_TABLE: Record<PickupStatusKey, "pickup_48h_status_pivot"> = {
  assigned: "pickup_48h_status_pivot",
  onhold: "pickup_48h_status_pivot",
  created: "pickup_48h_status_pivot",
};

export const PICKUP_STATUS_LABEL: Record<PickupStatusKey, string> = {
  assigned: "Assigned",
  onhold: "Pickup Onhold",
  created: "Created",
};

export function n(value: number | null | undefined) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export function cleanArea(value: string | null | undefined): Area | string {
  return normalizeArea(String(value ?? ""));
}

export function riderCotLabel(value: string | null | undefined) {
  const raw = String(value ?? "").replace(/\s+/g, "").toUpperCase();
  if (raw.includes("COT2") || raw === "2") return "COT2";
  if (raw.includes("COT1") || raw === "1") return "COT1";
  return raw || "COT1";
}

export function buildPickupBoard(rows: PickupStatusRow[], area: Area): DistrictAgg[] {
  const map = new Map<string, Map<string, WardAgg>>();
  for (const row of rows) {
    if (cleanArea(row.area) !== area) continue;
    const district = String(row.district || "").trim() || UNKNOWN_DISTRICT;
    const ward = String(row.ward || "").trim() || UNKNOWN_WARD;
    const cot = riderCotLabel(row.cot);
    const qty = n(row.orders);
    const districts = map.get(district) ?? new Map<string, WardAgg>();
    const current = districts.get(ward) ?? {
      ward,
      district,
      area,
      cot1: 0,
      cot2: 0,
      total: 0,
    };
    const next: WardAgg = {
      ...current,
      cot1: current.cot1 + (cot === "COT2" ? 0 : qty),
      cot2: current.cot2 + (cot === "COT2" ? qty : 0),
      total: current.total + qty,
    };
    districts.set(ward, next);
    map.set(district, districts);
  }
  return [...map.entries()]
    .map(([district, wards]) => {
      const list = [...wards.values()].sort((a, b) => visibleTotal(b, "all") - visibleTotal(a, "all") || a.ward.localeCompare(b.ward, "vi"));
      return {
        district,
        area,
        wards: list,
        totals: list.reduce((sum, item) => addCounts(sum, item), emptyCounts()),
      };
    })
    .sort((a, b) => visibleTotal(b.totals, "all") - visibleTotal(a.totals, "all") || a.district.localeCompare(b.district, "vi"));
}

export function pickupAnalytics(kv5: DistrictAgg[], kv6: DistrictAgg[], cot: CotFilter) {
  const districts = [...kv5, ...kv6];
  const wards = districts.flatMap((item) => item.wards);
  const heatBins = [
    { key: "zero", label: "Hết tồn (0)", count: 0, className: "bg-white border border-[var(--color-rule)]" },
    { key: "green", label: "Ít (1–5)", count: 0, className: "bg-[var(--color-success)]" },
    { key: "yellow", label: "Vừa (6–20)", count: 0, className: "bg-[var(--color-warning)]" },
    { key: "orange", label: "Cao (21–35)", count: 0, className: "bg-[#d97706]" },
    { key: "red", label: "Đỏ (36+)", count: 0, className: "bg-[var(--color-error)]" },
  ];
  for (const ward of wards) {
    const level = heatLevel(visibleTotal(ward, cot));
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
    riders: wards.length,
    hotRiders: wards.filter((item) => heatLevel(visibleTotal(item, "all")) === "red").length,
    emptyRiders: wards.filter((item) => visibleTotal(item, cot) <= 0).length,
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

export function matchesFocus(row: PickupStatusRow, focus: InventoryFocus) {
  if (cleanArea(row.area) !== focus.area) return false;
  const district = String(row.district || "").trim() || UNKNOWN_DISTRICT;
  if (district !== focus.district) return false;
  if (!focus.ward) return true;
  const ward = String(row.ward || "").trim() || UNKNOWN_WARD;
  return ward === focus.ward;
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
