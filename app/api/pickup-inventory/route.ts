import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";

// Proxy cung origin cho trang Ton pickup: browser goi /api/pickup-inventory
// (khong can apikey Supabase), server doc DB bang service key.
// Ly do: mot so trinh duyet/mang chan request truc tiep ra Supabase
// ("No API key found in request"), trong khi server chay on dinh.
export async function GET(request: Request) {
  const context = await getCurrentUserContext().catch(() => null);
  if (!context) {
    return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  }
  if (!canAccessPickupManagement(context.profile.role, context.profile.permissions)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền xem tồn pickup" }, { status: 403 });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "board";
  const admin = createAdminClient();

  try {
    if (view === "detail") {
      const area = (url.searchParams.get("p_area") ?? "").trim();
      const ward = (url.searchParams.get("p_ward") ?? "").trim();
      const status = (url.searchParams.get("p_status") ?? "").trim();
      if (!area || !ward || !status) {
        return NextResponse.json({ success: false, error: "Thiếu p_area / p_ward / p_status" }, { status: 400 });
      }
      const rpc = await admin.rpc("pickup_ward_detail", { p_area: area, p_ward: ward, p_status: status });
      if (!rpc.error) {
        return NextResponse.json({ success: true, via: "rpc", rows: rpc.data ?? [] });
      }
      const fallback = await admin
        .from("pickup_48h_no_api2")
        .select("pickup_point_id,pickup_point_name,shipment_id,assigned_riders_today,cot_group,zone_name")
        .eq("area", area)
        .eq("ward", ward)
        .eq("status", status)
        .limit(2000);
      if (fallback.error) throw fallback.error;
      return NextResponse.json({ success: true, via: "raw", rows: fallback.data ?? [] });
    }

    // view=board: tong distinct theo (area, ward, cot) cho 1 status.
    const status = (url.searchParams.get("p_status") ?? "").trim();
    if (!status) {
      return NextResponse.json({ success: false, error: "Thiếu p_status" }, { status: 400 });
    }
    const rpc = await admin.rpc("pickup_ward_board", { p_status: status });
    if (!rpc.error) {
      return NextResponse.json({ success: true, via: "rpc", rows: rpc.data ?? [], snapshotAt: new Date().toISOString() });
    }
    // Fallback: quet raw phan trang song song, distinct theo shipment_id.
    type RawRow = { shipment_id?: string | null; ward?: string | null; area?: string | null; cot_group?: string | null };
    const seen = new Set<string>();
    const agg = new Map<string, number>();
    const PAGE = 1000;
    const CONC = 8;
    let from = 0;
    for (;;) {
      const batch = await Promise.all(
        Array.from({ length: CONC }, (_, i) => {
          const f = from + i * PAGE;
          return admin
            .from("pickup_48h_no_api2")
            .select("shipment_id,ward,area,cot_group")
            .eq("status", status)
            .in("area", ["KV5", "KV6"])
            .order("shipment_id", { ascending: true })
            .range(f, f + PAGE - 1);
        }),
      );
      let finished = false;
      for (const result of batch) {
        if (result.error) throw result.error;
        const chunk = (result.data ?? []) as RawRow[];
        for (const row of chunk) {
          const order = String(row.shipment_id ?? "").trim();
          if (!order || seen.has(order)) continue;
          seen.add(order);
          const key = `${String(row.area ?? "").trim().toUpperCase()}||${String(row.ward ?? "").trim() || "Chưa có phường"}||${String(row.cot_group ?? "COT1").trim() || "COT1"}`;
          agg.set(key, (agg.get(key) ?? 0) + 1);
        }
        if (chunk.length < PAGE) { finished = true; break; }
      }
      if (finished) break;
      from += PAGE * CONC;
      if (from > 60000) break;
    }
    const rows = [...agg.entries()].map(([key, orders]) => {
      const [area, ward, cot] = key.split("||");
      return { area, ward, cot, orders };
    });
    return NextResponse.json({ success: true, via: "raw", rows, snapshotAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Không tải được tồn pickup" },
      { status: 500 },
    );
  }
}
