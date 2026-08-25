import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageOperations } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  shipment_ids: z.array(z.string().trim().min(1).max(100)).min(1).max(1000),
  rider_code: z.string().trim().min(1).max(100),
});

async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  return {
    admin,
    user,
    canAssign: canManageOperations(profile?.role),
  };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!session.canAssign) {
    return NextResponse.json(
      { success: false, error: "Bạn không có quyền gán rider trả hàng" },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Thông tin gán rider không hợp lệ",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const { shipment_ids: shipmentIds, rider_code: riderCode } = parsed.data;

  const { data: latest, error: latestError } = await session.admin
    .from("return_order_snapshots")
    .select("snapshot_id")
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) {
    return NextResponse.json({ success: false, error: latestError.message }, { status: 400 });
  }
  if (!latest) {
    return NextResponse.json({ success: false, error: "Chưa có snapshot đơn trả" }, { status: 409 });
  }

  const { data: rider, error: riderError } = await session.admin
    .from("riders")
    .select("id,rider_code,full_name,cot")
    .eq("rider_code", riderCode)
    .eq("status", "active")
    .maybeSingle();
  if (riderError) {
    return NextResponse.json({ success: false, error: riderError.message }, { status: 400 });
  }
  if (!rider) {
    return NextResponse.json({ success: false, error: "Không tìm thấy rider đang hoạt động" }, { status: 404 });
  }

  const { data: existing, error: existingError } = await session.admin
    .from("return_order_snapshots")
    .select("shipment_id")
    .eq("snapshot_id", latest.snapshot_id)
    .in("shipment_id", shipmentIds)
    .in("order_status", [10, 67]);
  if (existingError) {
    return NextResponse.json({ success: false, error: existingError.message }, { status: 400 });
  }
  const validShipmentIds = new Set((existing ?? []).map((row) => row.shipment_id));
  const assignableIds = shipmentIds.filter((id) => validShipmentIds.has(id));

  if (!assignableIds.length) {
    return NextResponse.json(
      { success: false, error: "Các đơn này không còn trong snapshot hoặc đã chuyển trạng thái" },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const upsertRows = assignableIds.map((shipmentId) => ({
    shipment_id: shipmentId,
    rider_id: rider.id,
    rider_code: rider.rider_code,
    rider_name: rider.full_name ?? "",
    cot: rider.cot ?? "",
    assigned_by: session.user.id,
    assigned_at: now,
    updated_at: now,
  }));

  const { error } = await session.admin
    .from("return_order_assignments")
    .upsert(upsertRows, { onConflict: "shipment_id" });
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  await session.admin.from("activity_logs").insert({
    entity_type: "return_order_assignment",
    entity_id: rider.id,
    action: "assigned_batch",
    message: `Assigned ${rider.rider_code} to ${assignableIds.length} return orders`,
    raw_data: {
      shipment_ids: assignableIds,
      rider_code: rider.rider_code,
      assigned_by: session.user.id,
    },
  });

  return NextResponse.json({
    success: true,
    rider_code: rider.rider_code,
    rider_name: rider.full_name ?? "",
    cot: rider.cot ?? "",
    assigned_count: assignableIds.length,
    skipped_count: shipmentIds.length - assignableIds.length,
  });
}
