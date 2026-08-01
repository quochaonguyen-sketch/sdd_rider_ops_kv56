import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const lookupSchema = z.string().trim().min(1).max(100);
const orderColumns = ["shipment_id", "sls_tracking_number", "shopee_order_sn"] as const;

function splitList(value: unknown) {
  return String(value ?? "")
    .split(/\s*[,;]\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const parsed = lookupSchema.safeParse(new URL(request.url).searchParams.get("code"));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Mã đơn không hợp lệ" }, { status: 400 });
  }

  const code = parsed.data.toUpperCase();
  const admin = createAdminClient();
  const { data: latest, error: latestError } = await admin
    .from("return_order_snapshots")
    .select("snapshot_id,snapshot_at")
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) return NextResponse.json({ success: false, error: latestError.message }, { status: 400 });
  if (!latest) {
    return NextResponse.json({ success: false, error: "Chưa có snapshot đơn trả" }, { status: 404 });
  }

  const lookups = await Promise.all(orderColumns.map((column) =>
    admin
      .from("return_order_snapshots")
      .select("shipment_id,sls_tracking_number,shopee_order_sn,order_status,status_label,seller_district,seller_ward,seller_new_ward,return_zone,return_rider_codes,return_rider_names,return_riders_cot1,return_riders_cot2,return_driver_id,return_driver_name")
      .eq("snapshot_id", latest.snapshot_id)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .eq(column, code)
      .limit(1)
      .maybeSingle(),
  ));
  const lookupError = lookups.find((result) => result.error)?.error;
  if (lookupError) return NextResponse.json({ success: false, error: lookupError.message }, { status: 400 });

  const order = lookups.find((result) => result.data)?.data;
  if (!order) {
    return NextResponse.json({ success: false, error: "Không tìm thấy đơn trong snapshot mới nhất" }, { status: 404 });
  }

  const [handoverResult, assignmentResult] = await Promise.all([
    admin
      .from("return_order_handovers")
      .select("rider_code,rider_name,handed_over_at")
      .eq("shipment_id", order.shipment_id)
      .maybeSingle(),
    admin
      .from("return_order_assignments")
      .select("rider_code,rider_name,cot,assigned_at")
      .eq("shipment_id", order.shipment_id)
      .maybeSingle(),
  ]);
  if (handoverResult.error) return NextResponse.json({ success: false, error: handoverResult.error.message }, { status: 400 });
  if (assignmentResult.error) return NextResponse.json({ success: false, error: assignmentResult.error.message }, { status: 400 });

  const plannedCodes = splitList(order.return_rider_codes);
  const plannedNames = splitList(order.return_rider_names);
  const identityCodes = [...new Set([
    handoverResult.data?.rider_code,
    assignmentResult.data?.rider_code,
    order.return_driver_id,
    ...plannedCodes,
  ].map((value) => String(value ?? "").trim()).filter(Boolean))];
  const profilesResult = identityCodes.length
    ? await admin.from("riders").select("rider_code,full_name,kv,cot").in("rider_code", identityCodes)
    : { data: [], error: null };
  if (profilesResult.error) return NextResponse.json({ success: false, error: profilesResult.error.message }, { status: 400 });

  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.rider_code, profile]));
  const rider = (riderCode: string, riderName: string, source: "handover" | "manual" | "returning" | "planned", cot = "") => {
    const profile = profiles.get(riderCode);
    return {
      code: riderCode,
      name: String(profile?.full_name || riderName || "").trim(),
      kv: String(profile?.kv || "").trim(),
      cot: String(cot || profile?.cot || "").trim(),
      source,
    };
  };

  const confirmedRider = handoverResult.data
    ? rider(handoverResult.data.rider_code, handoverResult.data.rider_name, "handover")
    : assignmentResult.data
      ? rider(assignmentResult.data.rider_code, assignmentResult.data.rider_name, "manual", assignmentResult.data.cot)
      : order.return_driver_id
        ? rider(order.return_driver_id, order.return_driver_name, "returning")
        : null;
  const plannedRiders = confirmedRider ? [] : plannedCodes.map((riderCode, index) =>
    rider(riderCode, plannedNames[index] ?? "", "planned"));

  return NextResponse.json({
    success: true,
    order: {
      shipmentId: order.shipment_id,
      trackingNumber: order.sls_tracking_number,
      shopeeOrderSn: order.shopee_order_sn,
      status: order.order_status,
      statusLabel: order.status_label,
      district: order.seller_district,
      ward: order.seller_new_ward || order.seller_ward,
      returnZone: order.return_zone,
      snapshotAt: latest.snapshot_at,
      confirmedRider,
      plannedRiders,
      planCot1: confirmedRider ? "" : order.return_riders_cot1,
      planCot2: confirmedRider ? "" : order.return_riders_cot2,
      handedOverAt: handoverResult.data?.handed_over_at ?? null,
    },
  });
}
