import { createClient } from "@/lib/supabase/client";
import { riderCotLabel } from "@/components/lmhub-inventory/pickup-inventory-model";

export type RiderShare = { name: string; orders: number };
export type WardRiders = { loading: boolean; cot1: RiderShare[]; cot2: RiderShare[]; error: string | null };

// RPC cũ (giữ để tương thích, nhưng KHÔNG dùng cho panel nữa vì chậm).
export async function fetchPickupWardRiders(area: string, ward: string, statusLabel: string, signal?: AbortSignal): Promise<Omit<WardRiders, "loading">> {
  const supabase = createClient();
  const result = await supabase
    .rpc("pickup_48h_ward_riders", {
      p_area: area,
      p_ward: ward,
      p_status: statusLabel,
    })
    .abortSignal(signal as AbortSignal);
  if (result.error) throw result.error;

  const agg = new Map<string, RiderShare & { bucket: "COT1" | "COT2" }>();
  for (const row of (result.data ?? []) as Array<{ cot?: string | null; riders?: string | null; orders?: number | null }>) {
    const bucket = riderCotLabel(String(row.cot || "")) === "COT2" ? "COT2" : "COT1";
    const names = String(row.riders || "")
      .split(/[,;\n]+/)
      .map((part) => part.replace(/^\[COT[12]\]\s*/i, "").trim())
      .filter((part) => part && part !== "—");
    const list = names.length ? names : ["(chưa có tên rider)"];
    const qty = Number(row.orders ?? 0) || 0;
    // KHÔNG chia đều qty cho các rider (trước đây qty / list.length tạo ra 0.5 đơn
    // gây sai số). Mỗi đơn chung được tính NGUYÊN 1 lượt gán cho MỖI rider.
    // Tổng lượt gán vì thế có thể lớn hơn tổng đơn distinct của phường — đúng bản chất.
    for (const name of list) {
      const mapKey = `${bucket}||${name}`;
      const current = agg.get(mapKey) ?? { name, orders: 0, bucket };
      current.orders += qty;
      agg.set(mapKey, current);
    }
  }
  const byOrders = (a: RiderShare, b: RiderShare) => b.orders - a.orders || a.name.localeCompare(b.name, "vi");
  return {
    cot1: [...agg.values()].filter((item) => item.bucket === "COT1").sort(byOrders),
    cot2: [...agg.values()].filter((item) => item.bucket === "COT2").sort(byOrders),
    error: null,
  };
}

type GroupRow = {
  snapshot_id: string;
  driver_id: string;
  ward: string | null;
  ward_area: string | null;
  khu_vuc: string | null;
  assigned_orders: number | null;
  picked_orders: number | null;
  onhold_orders: number | null;
};

type RiderRow = { driver_id: string; driver_name: string | null };
type ProfileRow = { rider_code: string | null; cot: string | null };

function clean(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function toArea(value: string | null | undefined): string {
  const v = clean(value).toUpperCase();
  if (v === "KV5" || v === "KV6") return v;
  return "";
}

/**
 * Pivot NHANH: tải 1 lần 3 bảng nhỏ (đã tổng hợp sẵn bởi job pickup48h),
 * dựng sẵn Map<area||ward, {cot1, cot2}> trong RAM.
 * Bấm phường = lookup đồng bộ, hiện ngay, không query raw pickup_48h_no_api2 nữa.
 *
 * - status Assigned -> dùng assigned_orders
 * - status Pickup Onhold -> dùng onhold_orders
 * - status Created -> bảng groups không có cột created -> trả map rỗng
 */
export async function fetchPickupWardRiderMap(
  statusLabel: string,
  signal?: AbortSignal,
): Promise<Record<string, { cot1: RiderShare[]; cot2: RiderShare[] }>> {
  const supabase = createClient();
  const useOnhold = /onhold/i.test(statusLabel);
  const isCreated = /created/i.test(statusLabel);
  if (isCreated) return {};

  const [groupRes, riderRes, profileRes] = await Promise.all([
    supabase
      .from("pickup_48h_rider_groups")
      .select("snapshot_id,driver_id,ward,ward_area,khu_vuc,assigned_orders,picked_orders,onhold_orders")
      .abortSignal(signal as AbortSignal)
      .limit(10000),
    supabase
      .from("pickup_48h_realtime_riders")
      .select("driver_id,driver_name")
      .abortSignal(signal as AbortSignal)
      .limit(5000),
    supabase.from("riders").select("rider_code,cot").abortSignal(signal as AbortSignal).limit(10000),
  ]);
  const firstError = groupRes.error ?? riderRes.error ?? profileRes.error;
  if (firstError) throw firstError;

  const groups = (groupRes.data ?? []) as GroupRow[];
  if (!groups.length) return {};

  // Chỉ giữ snapshot mới nhất (job REPLACE toàn bảng mỗi lần chạy).
  let latest: string | null = null;
  for (const row of groups) {
    if (row.snapshot_id && (latest === null || row.snapshot_id > latest)) latest = row.snapshot_id;
  }
  const nameById = new Map<string, string>();
  for (const row of ((riderRes.data ?? []) as RiderRow[])) {
    if (row.driver_id) nameById.set(row.driver_id, clean(row.driver_name) || row.driver_id);
  }
  const cotById = new Map<string, string>();
  for (const row of ((profileRes.data ?? []) as ProfileRow[])) {
    const code = clean(row.rider_code);
    if (code && clean(row.cot)) cotById.set(code, clean(row.cot));
  }

  // Gom theo ward trước, rider sau: Map<wardKey, Map<riderId, orders>>
  const byWard = new Map<string, Map<string, { name: string; cot: string; orders: number }>>();
  for (const row of groups) {
    if (latest && row.snapshot_id !== latest) continue;
    const ward = clean(row.ward);
    if (!ward) continue;
    const wardArea = toArea(row.ward_area) || toArea(row.khu_vuc);
    if (wardArea !== "KV5" && wardArea !== "KV6") continue;
    const qty = useOnhold ? Number(row.onhold_orders ?? 0) : Number(row.assigned_orders ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const riderId = clean(row.driver_id);
    if (!riderId) continue;
    const key = `${wardArea}||${ward}`;
    let riders = byWard.get(key);
    if (!riders) {
      riders = new Map();
      byWard.set(key, riders);
    }
    const current =
      riders.get(riderId) ??
      { name: nameById.get(riderId) ?? riderId, cot: cotById.get(riderId) ?? "", orders: 0 };
    current.orders += qty;
    riders.set(riderId, current);
  }

  const byOrders = (a: RiderShare, b: RiderShare) => b.orders - a.orders || a.name.localeCompare(b.name, "vi");
  const out: Record<string, { cot1: RiderShare[]; cot2: RiderShare[] }> = {};
  for (const [key, riders] of byWard) {
    const cot1: RiderShare[] = [];
    const cot2: RiderShare[] = [];
    for (const rider of riders.values()) {
      const item = { name: rider.name, orders: rider.orders };
      if (riderCotLabel(rider.cot) === "COT2") cot2.push(item);
      else cot1.push(item);
    }
    cot1.sort(byOrders);
    cot2.sort(byOrders);
    out[key] = { cot1, cot2 };
  }
  return out;
}

// --- Đối soát chính xác đơn chung nhiều rider cho 1 phường ---
// Query raw CHỈ 1 phường (ít dòng nên nhanh), đếm theo shipment_id distinct.
// Trả về: tổng đơn distinct, lượt gán từng rider (số nguyên), danh sách đơn chung.
  export type SharedOrder = { order: string; riders: string[] };
  export type ExactRider = RiderShare & { cot: string };
  // Chi tiet tung don (1 dong/don): don chung nhieu rider thi riders xep chong
  // trong cung 1 o thay vi tach luot.
  export type OrderDetail = { order: string; riders: string[]; cot: string };
  export type WardExact = {
    distinctTotal: number;
    assignTotal: number;
    sharedTotal: number;
    noRiderTotal: number;
    perRider: ExactRider[];
    shared: SharedOrder[];
    orders: OrderDetail[];
  };

  // Chay dua timeout: thong tin phu (ten driver, tuyen) khong bao gio duoc
  // treo UI. Qua timeout -> tra fallback rong, khong throw.
  function withTimeout<T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout sau ${ms}ms`)), ms);
      const done = (fn: () => void) => { clearTimeout(timer); fn(); };
      signal?.addEventListener("abort", () => done(() => reject(new DOMException("aborted", "AbortError"))), { once: true });
      promise.then(
        (value) => done(() => resolve(value)),
        (err) => done(() => reject(err)),
      );
    });
  }

  // Cache ten driver (id -> ten, ten -> id) dung chung cho modal Zone.
  // Nap 1 lan / 5 phut thay vi moi lan mo popup lai tai 5000 dong.
  let driverNameCache: { at: number; byId: Map<string, string>; byName: Map<string, string> } | null = null;
  let driverNameInflight: Promise<{ byId: Map<string, string>; byName: Map<string, string> }> | null = null;
  export function getDriverNameMaps(signal?: AbortSignal): Promise<{ byId: Map<string, string>; byName: Map<string, string> }> {
    if (driverNameCache && Date.now() - driverNameCache.at < 5 * 60_000) {
      return Promise.resolve({ byId: driverNameCache.byId, byName: driverNameCache.byName });
    }
    if (!driverNameInflight) {
      driverNameInflight = (async () => {
        const byId = new Map<string, string>();
        const byName = new Map<string, string>();
        try {
          const supabase = createClient();
          const res = await withTimeout(
            Promise.resolve(supabase.from("pickup_48h_realtime_riders").select("driver_id,driver_name").abortSignal(signal as AbortSignal).limit(5000)),
            8000,
            signal,
          );
          if (!res.error) {
            for (const r of (res.data ?? []) as Array<{ driver_id?: string | null; driver_name?: string | null }>) {
              const id = clean(r.driver_id);
              const name = clean(r.driver_name) || id;
              if (!id) continue;
              if (!byId.has(id)) byId.set(id, name);
              if (name && !byName.has(name)) byName.set(name, id);
              if (name && !byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), id);
            }
          }
          driverNameCache = { at: Date.now(), byId, byName };
        } catch {
          // Fallback rong: cot Zone hien "—", khong chan hien bang chinh.
        } finally {
          driverNameInflight = null;
        }
        return { byId, byName };
      })();
    }
    return driverNameInflight;
  }

  // Cache tuyen (driver -> tap khu_vuc) theo phuong, TTL 2 phut.
  const wardRoutesCache = new Map<string, { at: number; map: Map<string, Set<string>> }>();
  export async function getWardRoutes(area: string, ward: string, signal?: AbortSignal): Promise<Map<string, Set<string>>> {
    void area;
    const key = ward;
    const hit = wardRoutesCache.get(key);
    if (hit && Date.now() - hit.at < 2 * 60_000) return hit.map;
    const map = new Map<string, Set<string>>();
    try {
      const supabase = createClient();
      const res = await withTimeout(
        Promise.resolve(supabase.from("pickup_48h_rider_groups").select("driver_id,khu_vuc").eq("ward", ward).abortSignal(signal as AbortSignal).limit(2000)),
        8000,
        signal,
      );
      if (!res.error) {
        for (const g of (res.data ?? []) as Array<{ driver_id?: string | null; khu_vuc?: string | null }>) {
          const id = clean(g.driver_id);
          const route = clean(g.khu_vuc);
          if (!id || !route) continue;
          let set = map.get(id);
          if (!set) { set = new Set(); map.set(id, set); }
          set.add(route);
        }
      }
      wardRoutesCache.set(key, { at: Date.now(), map });
    } catch {
      // Fallback rong.
    }
    return map;
  }

export function splitRiders(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(/[,;\n]+/)
    .map((part) => part.replace(/^\[COT[12]\]\s*/i, "").trim())
    .filter((part) => part && part !== "—");
}

export type WardDetailRow = {
  pickup_point_id?: string | null;
  pickup_point_name?: string | null;
  shipment_id?: string | null;
  cot_group?: string | null;
  assigned_riders_today?: string | null;
  zone_name?: string | null;
};

// Chi tiet 1 phuong, uu tien: API cung origin (server dung service key,
// trinh duyet khong can apikey) -> RPC truc tiep -> GET truc tiep.
export async function fetchPickupWardDetailRows(
  area: string,
  ward: string,
  statusLabel: string,
  signal?: AbortSignal,
): Promise<WardDetailRow[]> {
  try {
    const params = new URLSearchParams({ view: "detail", p_area: area, p_ward: ward, p_status: statusLabel });
    const res = await fetch(`/api/pickup-inventory?${params.toString()}`, { cache: "no-store", signal });
    const payload = await res.json().catch(() => null) as { success?: boolean; rows?: WardDetailRow[]; error?: string } | null;
    if (!res.ok || !payload?.success) throw new Error(payload?.error ?? `API ${res.status}`);
    return payload.rows ?? [];
  } catch (err) {
    if (signal?.aborted) throw err;
    // eslint-disable-next-line no-console
    console.warn("[pickup-ward-detail] API loi, fallback Supabase truc tiep:", err);
  }
  const supabase = createClient();
  try {
    const rpc = await supabase
      .rpc("pickup_ward_detail", { p_area: area, p_ward: ward, p_status: statusLabel })
      .abortSignal(signal as AbortSignal);
    if (!rpc.error) return (rpc.data ?? []) as WardDetailRow[];
    // eslint-disable-next-line no-console
    console.warn("[pickup-ward-detail] RPC loi, fallback GET:", rpc.error.message);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[pickup-ward-detail] RPC throw, fallback GET:", err);
  }
  const result = await supabase
    .from("pickup_48h_no_api2")
    .select("pickup_point_id,pickup_point_name,shipment_id,assigned_riders_today,cot_group,zone_name")
    .eq("area", area)
    .eq("ward", ward)
    .eq("status", statusLabel)
    .abortSignal(signal as AbortSignal)
    .limit(2000);
  if (result.error) throw result.error;
  return (result.data ?? []) as WardDetailRow[];
}

export async function fetchPickupWardExact(
  area: string,
  ward: string,
  statusLabel: string,
  signal?: AbortSignal,
): Promise<WardExact> {
  // COT cua rider suy tu cot_group cua CHINH don do trong phuong (bo phieu
  // theo so don) — 0 query them, khong tai 10k dong bang riders.
  const rows = await fetchPickupWardDetailRows(area, ward, statusLabel, signal);
  const seen = new Set<string>();
  const perRider = new Map<string, { orders: number; cot1: number; cot2: number }>();
  const shared: SharedOrder[] = [];
  const orders: OrderDetail[] = [];
  let noRiderTotal = 0;
  const bump = (name: string, cotGroup: string) => {
    const current = perRider.get(name) ?? { orders: 0, cot1: 0, cot2: 0 };
    current.orders += 1;
    if (riderCotLabel(cotGroup) === "COT2") current.cot2 += 1;
    else current.cot1 += 1;
    perRider.set(name, current);
  };
  for (const row of rows) {
    const order = String(row.shipment_id ?? "").trim() || "—";
    if (seen.has(order)) continue; // distinct theo shipment_id
    seen.add(order);
    const riders = splitRiders(row.assigned_riders_today);
    const cotGroup = String(row.cot_group ?? "");
    const cot = riderCotLabel(cotGroup) === "COT2" ? "COT2" : "COT1";
    orders.push({ order, riders: riders.length ? riders : ["(chưa có tên rider)"], cot });
    if (!riders.length) {
      noRiderTotal += 1;
      bump("(chưa có tên rider)", cotGroup);
    } else {
      for (const name of riders) bump(name, cotGroup);
      if (riders.length > 1) shared.push({ order, riders });
    }
  }
  // Don chung len truoc de nhin thay ngay, roi toi ma don.
  orders.sort((a, b) => b.riders.length - a.riders.length || a.order.localeCompare(b.order));
    const perRiderList: ExactRider[] = [...perRider.entries()]
      .map(([name, stat]) => ({
        name,
        orders: stat.orders,
        cot: stat.cot2 > stat.cot1 ? "COT2" : "COT1",
      }))
      .sort((a, b) => b.orders - a.orders || a.name.localeCompare(b.name, "vi"));
    const assignTotal = perRiderList.reduce((sum, item) => sum + item.orders, 0);
  return {
    distinctTotal: seen.size,
    assignTotal,
    sharedTotal: shared.length,
    noRiderTotal,
    perRider: perRiderList,
    shared: shared.slice(0, 50), // chỉ hiện 50 đơn chung đầu để UI gọn
    orders: orders.slice(0, 500),
  };
}
