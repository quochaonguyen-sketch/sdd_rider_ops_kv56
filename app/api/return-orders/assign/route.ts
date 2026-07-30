import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageOperations } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const assignmentSchema = z.object({
  shipment_id: z.string().trim().min(1).max(100),
  rider_code: z.string().trim().min(1).max(100).nullable(),
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

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!session.canAssign) {
    return NextResponse.json({ success: true, can_assign: false, riders: [] });
  }

  const { data, error } = await session.admin
    .from("riders")
    .select("id,rider_code,full_name,cot,kv")
    .eq("status", "active")
    .order("rider_code")
    .limit(1000);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    can_assign: true,
    riders: data ?? [],
  });
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

  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Thông tin gán rider không hợp lệ" },
      { status: 400 },
    );
  }

  const { shipment_id: shipmentId, rider_code: riderCode } = parsed.data;
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

  const { data: order, error: orderError } = await session.admin
    .from("return_order_snapshots")
    .select("shipment_id")
    .eq("snapshot_id", latest.snapshot_id)
    .eq("shipment_id", shipmentId)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ success: false, error: orderError.message }, { status: 400 });
  }
  if (!order) {
    return NextResponse.json(
      { success: false, error: "Đơn không còn trong snapshot mới nhất" },
      { status: 409 },
    );
  }

  if (!riderCode) {
    const { error } = await session.admin
      .from("return_order_assignments")
      .delete()
      .eq("shipment_id", shipmentId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    await session.admin.from("activity_logs").insert({
      entity_type: "return_order_assignment",
      entity_id: null,
      action: "unassigned",
      message: `Removed manual return rider from ${shipmentId}`,
      raw_data: { shipment_id: shipmentId, assigned_by: session.user.id },
    });

    return NextResponse.json({ success: true, assignment: null });
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
    return NextResponse.json(
      { success: false, error: "Không tìm thấy rider đang hoạt động" },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();
  const assignment = {
    shipment_id: shipmentId,
    rider_id: rider.id,
    rider_code: rider.rider_code,
    rider_name: rider.full_name ?? "",
    cot: rider.cot ?? "",
    assigned_by: session.user.id,
    assigned_at: now,
    updated_at: now,
  };
  const { data, error } = await session.admin
    .from("return_order_assignments")
    .upsert(assignment, { onConflict: "shipment_id" })
    .select("shipment_id,rider_code,rider_name,cot,assigned_at")
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  await session.admin.from("activity_logs").insert({
    entity_type: "return_order_assignment",
    entity_id: rider.id,
    action: "assigned",
    message: `Assigned ${rider.rider_code} to return order ${shipmentId}`,
    raw_data: {
      shipment_id: shipmentId,
      rider_code: rider.rider_code,
      assigned_by: session.user.id,
    },
  });

  return NextResponse.json({ success: true, assignment: data });
}
