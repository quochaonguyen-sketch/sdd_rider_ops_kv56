import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageRiders } from "@/lib/auth/permissions";
import {
  writeRidersToThiCongPlan,
  THI_CONG_PLAN_SPREADSHEET_ID,
  THI_CONG_PLAN_SHEET_NAME,
} from "@/lib/google/thi-cong-plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { invalidateRidersCache } from "@/lib/cache/operations-cache";

const bodySchema = z.object({
  kv: z.string().trim().optional().nullable(),
  cot: z.string().trim().optional().nullable(),
  deliveryDistrict: z.string().trim().optional().nullable(),
  status: z.enum(["active", "inactive", "all"]).optional().default("all"),
});

async function managerSession() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { admin, role: profile?.role ?? "viewer" };
}

export async function PUT(request: Request) {
  const session = await managerSession();
  if (!session) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManageRiders(session.role)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền đồng bộ rider" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Bộ lọc không hợp lệ" }, { status: 400 });
  }

  try {
    let query = session.admin.from("riders").select("kv,home_district,cot,rider_code,full_name,pickup_district,pickup_ward,point_name,delivery_district,delivery_ward,status,updated_at").order("rider_code", { ascending: true });

    if (parsed.data.kv && parsed.data.kv !== "all") query = query.eq("kv", parsed.data.kv);
    if (parsed.data.cot && parsed.data.cot !== "all") query = query.eq("cot", parsed.data.cot);
    if (parsed.data.deliveryDistrict && parsed.data.deliveryDistrict !== "all") query = query.eq("delivery_district", parsed.data.deliveryDistrict);
    if (parsed.data.status && parsed.data.status !== "all") query = query.eq("status", parsed.data.status);

    const { data: riders, error } = await query;
    if (error) throw error;
    if (!riders || riders.length === 0) {
      return NextResponse.json({ success: false, error: "Không có rider khớp bộ lọc để đồng bộ" }, { status: 400 });
    }

    const result = await writeRidersToThiCongPlan(THI_CONG_PLAN_SPREADSHEET_ID, THI_CONG_PLAN_SHEET_NAME, riders);

    await session.admin.from("activity_logs").insert({
      entity_type: "rider",
      action: "synced_to_thi_cong_plan",
      message: `Synced ${result.updated} riders from web to Thi Công Plan`,
      raw_data: { filters: parsed.data, ...result },
    });
    invalidateRidersCache();

    return NextResponse.json({ success: true, ...result });
  } catch (syncError) {
    return NextResponse.json(
      { success: false, error: syncError instanceof Error ? syncError.message : "Không thể đồng bộ lên Thi Công Plan" },
      { status: 400 },
    );
  }
}