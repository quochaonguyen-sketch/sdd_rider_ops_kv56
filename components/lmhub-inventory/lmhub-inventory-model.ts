export type Area = "KV5" | "KV6";
export type CotFilter = "all" | "cot1" | "cot2";
export type HeatFilter = "all" | "hot";
export type InventoryRow = {
  snapshot_id: string;
  snapshot_at: string | null;
  shipment_id: string;
  received_time: string | null;
  ward: string;
  district: string;
  area: Area | string;
  zone_id: string;
  status: string;
  order_type: string;
  cot_group: string;
};
export type Counts = { cot1: number; cot2: number; total: number };
export type WardAgg = { ward: string; district: string; area: Area } & Counts;
export type DistrictAgg = { district: string; area: Area; wards: WardAgg[]; totals: Counts };

export const PAGE_SIZE = 40;
export const PAGE_ROWS = 1000;
export const RELOAD_DEBOUNCE_MS = 1500;
export const COLUMNS = "snapshot_id,snapshot_at,shipment_id,received_time,ward,district,area,zone_id,status,order_type,cot_group";
export const UNKNOWN_WARD = "Chưa xác định phường";
export const UNKNOWN_DISTRICT = "Chưa xác định quận";
export function buildAnalytics(kv5: DistrictAgg[], kv6: DistrictAgg[], cot: CotFilter) {
  const districts = [...kv5, ...kv6];
  const wards = districts.flatMap((item) => item.wards);
  const heatBins = [
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
  const topDistricts = districts
    .map((item) => ({ label: item.district, area: item.area, value: visibleTotal(item.totals, cot) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const cot1 = districts.reduce((sum, item) => sum + item.totals.cot1, 0);
  const cot2 = districts.reduce((sum, item) => sum + item.totals.cot2, 0);
  return {
    districts: districts.length,
    wards: wards.length,
    hotWards: wards.filter((ward) => heatLevel(visibleTotal(ward, "all")) === "red").length,
    visible: visibleBoardTotal(kv5, cot) + visibleBoardTotal(kv6, cot),
    cot1,
    cot2,
    topDistricts,
    heatBins,
  };
}

export function visibleBoardTotal(districts: DistrictAgg[], cot: CotFilter) {
  return districts.reduce((sum, item) => sum + visibleTotal(item.totals, cot), 0);
}

export function filterBoard(districts: DistrictAgg[], query: string, cot: CotFilter, heat: HeatFilter): DistrictAgg[] {
  const q = normalize(query);
  return districts
    .map((district) => {
      const wards = district.wards
        .filter((ward) => visibleTotal(ward, cot) > 0)
        .filter((ward) => heat === "all" || heatLevel(visibleTotal(ward, cot)) === "red")
        .filter((ward) => !q || normalize(`${ward.district} ${ward.ward}`).includes(q))
        .sort((a, b) => visibleTotal(b, cot) - visibleTotal(a, cot));
      return { ...district, wards, totals: wards.reduce((sum, ward) => addCounts(sum, ward), emptyCounts()) };
    })
    .filter((district) => district.wards.length > 0)
    .sort((a, b) => visibleTotal(b.totals, cot) - visibleTotal(a.totals, cot));
}

export function visibleTotal(counts: Counts, cot: CotFilter) {
  if (cot === "cot1") return counts.cot1;
  if (cot === "cot2") return counts.cot2;
  return counts.total;
}
export function visibleCount(counts: Counts, key: "cot1" | "cot2", cot: CotFilter) {
  if (cot !== "all" && cot !== key) return 0;
  return counts[key];
}
export function heatLevel(value: number) {
  if (value <= 0) return "none";
  if (value <= 5) return "green";
  if (value <= 20) return "yellow";
  if (value <= 35) return "orange";
  return "red";
}
export function heatClass(value: number) {
  const level = heatLevel(value);
  if (level === "green") return "bg-[var(--color-success-soft)] text-[var(--color-success)]";
  if (level === "yellow" || level === "orange") return "bg-[var(--color-warning-soft)] text-[var(--color-warning)]";
  if (level === "red") return "bg-[var(--color-error-soft)] text-[var(--color-error)]";
  return "text-[var(--color-muted)]";
}
export function heatBarClass(value: number) {
  const level = heatLevel(value);
  if (level === "green") return "bg-[var(--color-success)]";
  if (level === "yellow" || level === "orange") return "bg-[var(--color-warning)]";
  if (level === "red") return "bg-[var(--color-error)]";
  return "bg-[var(--color-accent)]";
}
export function buildBoard(rows: InventoryRow[], area: Area): DistrictAgg[] {
  const map = new Map<string, Map<string, Counts>>();
  for (const row of rows) {
    if (row.area !== area) continue;
    const district = row.district || UNKNOWN_DISTRICT;
    const ward = row.ward || UNKNOWN_WARD;
    if (!map.has(district)) map.set(district, new Map());
    const wards = map.get(district)!;
    const current = wards.get(ward) ?? emptyCounts();
    current[cotBucket(row.cot_group)] += 1;
    current.total += 1;
    wards.set(ward, current);
  }
  return [...map.entries()].map(([district, wards]) => {
    const wardList: WardAgg[] = [...wards.entries()].map(([ward, counts]) => ({ ward, district, area, ...counts }));
    return { district, area, wards: wardList, totals: wardList.reduce((sum, item) => addCounts(sum, item), emptyCounts()) };
  });
}
export function cotBucket(value: string): "cot1" | "cot2" {
  const text = normalize(value);
  return text.includes("cot 1") || /\bcot\s*1\b/.test(text) ? "cot1" : "cot2";
}
export function emptyCounts(): Counts { return { cot1: 0, cot2: 0, total: 0 }; }
export function addCounts(a: Counts, b: Counts): Counts { return { cot1: a.cot1 + b.cot1, cot2: a.cot2 + b.cot2, total: a.total + b.total }; }
export function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}
export function normalizeArea(value: string): Area | string {
  const key = normalize(String(value ?? "")).replace(/\s+/g, " ");
  if (key === "kv5" || key === "khu vuc 5" || key === "khuvuc5" || key === "area 5") return "KV5";
  if (key === "kv6" || key === "khu vuc 6" || key === "khuvuc6" || key === "area 6") return "KV6";
  return String(value ?? "").trim();
}
export function normalizeRow(row: InventoryRow): InventoryRow {
  return { ...row, shipment_id: String(row.shipment_id ?? "").trim(), ward: String(row.ward ?? "").trim(), district: String(row.district ?? "").trim(), area: normalizeArea(String(row.area ?? "")), zone_id: String(row.zone_id ?? "").trim(), status: String(row.status ?? "").trim(), order_type: String(row.order_type ?? "").trim(), cot_group: String(row.cot_group ?? "").trim() };
}
export function toTime(value: string | null): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}
export function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim();
}
export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}
export function formatRelative(value: string | null): string {
  if (!value) return "Chưa có snapshot";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Chưa có snapshot";
  const diff = Date.now() - date.getTime();
  if (diff < 30_000) return "vừa xong";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}
