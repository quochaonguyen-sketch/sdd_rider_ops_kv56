import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageOperations } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const handoverSchema = z.object({
  shipment_id: z.string().trim().min(1).max(100),
  rider_code: z.string().trim().min(1).max(100),
  source: z.enum(["camera", "manual"]).default("camera"),
});

async function getSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { admin, user, canManage: canManageOperations(profile?.role) };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!session.canManage) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền ghi nhận bàn giao" }, { status: 403 });
  }

  const parsed = handoverSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Mã đơn hoặc rider không hợp lệ" }, { status: 400 });
  }
  const { shipment_id: shipmentId, rider_code: riderCode, source } = parsed.data;

  const { data: latest, error: latestError } = await session.admin
    .from("return_order_snapshots")
    .select("snapshot_id")
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return NextResponse.json({ success: false, error: latestError.message }, { status: 400 });
  if (!latest) return NextResponse.json({ success: false, error: "Chưa có snapshot đơn trả" }, { status: 409 });

  const { data: order, error: orderError } = await session.admin
    .from("return_order_snapshots")
    .select("shipment_id,order_status")
    .eq("snapshot_id", latest.snapshot_id)
    .eq("shipment_id", shipmentId)
    .maybeSingle();
  if (orderError) return NextResponse.json({ success: false, error: orderError.message }, { status: 400 });
  if (!order) return NextResponse.json({ success: false, error: "Không tìm thấy đơn trong snapshot mới nhất" }, { status: 404 });
  if (order.order_status !== 72) {
    return NextResponse.json({ success: false, error: "Chỉ được bàn giao đơn đang trả (status 72)" }, { status: 409 });
  }

  const { data: rider, error: riderError } = await session.admin
    .from("riders")
    .select("rider_code,full_name")
    .eq("rider_code", riderCode)
    .eq("status", "active")
    .maybeSingle();
  if (riderError) return NextResponse.json({ success: false, error: riderError.message }, { status: 400 });
  if (!rider) return NextResponse.json({ success: false, error: "Không tìm thấy rider đang hoạt động" }, { status: 404 });

  const { data: existing, error: existingError } = await session.admin
    .from("return_order_handovers")
    .select("shipment_id,rider_code,rider_name,handed_over_at")
    .eq("shipment_id", shipmentId)
    .maybeSingle();
  if (existingError) return NextResponse.json({ success: false, error: existingError.message }, { status: 400 });
  if (existing) {
    return NextResponse.json({ success: false, duplicate: true, handover: existing, error: "Đơn này đã được ghi nhận bàn giao" }, { status: 409 });
  }

  const { data: handover, error: insertError } = await session.admin
    .from("return_order_handovers")
    .insert({
      shipment_id: shipmentId,
      snapshot_id: latest.snapshot_id,
      rider_code: rider.rider_code,
      rider_name: rider.full_name ?? "",
      scanned_by: session.user.id,
      source,
    })
    .select("shipment_id,rider_code,rider_name,handed_over_at,source")
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ success: false, duplicate: true, error: "Đơn này vừa được ghi nhận bàn giao ở thiết bị khác" }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: insertError.message }, { status: 400 });
  }

  await session.admin.from("activity_logs").insert({
    entity_type: "return_order_handover",
    entity_id: null,
    action: "scanned",
    message: `Handover scanned for ${shipmentId}`,
    raw_data: { shipment_id: shipmentId, rider_code: rider.rider_code, source, scanned_by: session.user.id },
  });
  return NextResponse.json({ success: true, handover });
}
