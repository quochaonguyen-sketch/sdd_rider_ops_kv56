import { createClient } from "@/lib/supabase/client";
import { riderCotLabel } from "@/components/lmhub-inventory/pickup-inventory-model";

export type RiderShare = { name: string; orders: number };
export type WardRiders = { loading: boolean; cot1: RiderShare[]; cot2: RiderShare[]; error: string | null };

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
    const share = list.length ? qty / list.length : qty;
    for (const name of list) {
      const mapKey = `${bucket}||${name}`;
      const current = agg.get(mapKey) ?? { name, orders: 0, bucket };
      current.orders += share;
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
