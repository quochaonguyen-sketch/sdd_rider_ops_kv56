import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageRiders } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { syncRidersToThiCongPlan, thiCongPlanConfig, type ThiCongPlanRider } from "@/lib/google/thi-cong-plan";

const riderColumns = "id,rider_code,kv,home_district,cot,pickup_district,pickup_ward,delivery_district,delivery_ward";
const bodySchema = z.union([
  z.object({ rider_id: z.string().uuid() }),
  z.object({ sync_all: z.literal(true) }),
]);

async function managerSession() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { admin, role: profile?.role ?? "viewer", user };
}

export async function GET() {
  const session = await managerSession();
  if (!session) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManageRiders(session.role)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền đồng bộ rider" }, { status: 403 });
  }
  return NextResponse.json({ success: true, ...thiCongPlanConfig() });
}

export async function POST(request: Request) {
  const session = await managerSession();
  if (!session) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManageRiders(session.role)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền đồng bộ rider" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Yêu cầu đồng bộ không hợp lệ" }, { status: 400 });

  const query = session.admin.from("riders").select(riderColumns);
  const { data, error } = "rider_id" in parsed.data
    ? await query.eq("id", parsed.data.rider_id)
    : await query.order("rider_code", { ascending: true });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  if ("rider_id" in parsed.data && (data?.length ?? 0) === 0) {
    return NextResponse.json({ success: false, error: "Không tìm thấy rider" }, { status: 404 });
  }

  try {
    const result = await syncRidersToThiCongPlan((data ?? []) as ThiCongPlanRider[], request.signal);
    await session.admin.from("activity_logs").insert({
      entity_type: "rider",
      action: "synced_thi_cong_plan",
      message: `Synced ${result.updated_riders} riders to Thi Công Plan`,
      raw_data: result,
    });
    return NextResponse.json(result);
  } catch (syncError) {
    return NextResponse.json(
      { success: false, error: syncError instanceof Error ? syncError.message : "Không thể đồng bộ Thi Công Plan" },
      { status: 400 },
    );
  }
}
