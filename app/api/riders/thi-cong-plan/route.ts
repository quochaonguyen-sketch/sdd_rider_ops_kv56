import { NextResponse } from "next/server";
import { canManageRiders } from "@/lib/auth/permissions";
import { readRidersFromThiCongPlan, thiCongPlanConfig } from "@/lib/google/thi-cong-plan";
import { canonicalDistrictName } from "@/lib/locations/hcm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function normalizedDistrict(value: string | null) {
  return canonicalDistrictName(value) === "Quận Bình Thạnh" ? "Quận Bình Thạnh" : value;
}

async function managerSession() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { admin, role: profile?.role ?? "viewer" };
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

  try {
    const source = await readRidersFromThiCongPlan(request.signal);
    if (source.riders.length === 0) {
      return NextResponse.json({ success: false, error: "Tab Thi Công Plan không có rider hợp lệ để đồng bộ" }, { status: 400 });
    }

    const existingCodes = new Set<string>();
    const riderCodes = source.riders.map((rider) => rider.rider_code);
    for (let index = 0; index < riderCodes.length; index += 500) {
      const { data, error } = await session.admin
        .from("riders")
        .select("rider_code")
        .in("rider_code", riderCodes.slice(index, index + 500));
      if (error) throw error;
      data?.forEach((rider) => existingCodes.add(rider.rider_code));
    }

    for (let index = 0; index < source.riders.length; index += 500) {
      const payload = source.riders.slice(index, index + 500).map((rider) => ({
        ...rider,
        home_district: normalizedDistrict(rider.home_district),
        pickup_district: normalizedDistrict(rider.pickup_district),
        delivery_district: normalizedDistrict(rider.delivery_district),
        name: rider.full_name,
      }));
      const { error } = await session.admin.from("riders").upsert(payload, { onConflict: "rider_code" });
      if (error) throw error;
    }

    const updatedRiders = source.riders.filter((rider) => existingCodes.has(rider.rider_code)).length;
    const result = {
      success: true as const,
      synced_riders: source.riders.length,
      inserted_riders: source.riders.length - updatedRiders,
      updated_riders: updatedRiders,
      sheet_rows: source.sheet_rows,
      skipped_rows: source.skipped_rows,
    };
    await session.admin.from("activity_logs").insert({
      entity_type: "rider",
      action: "synced_from_thi_cong_plan",
      message: `Synced ${result.synced_riders} riders from Thi Công Plan to web`,
      raw_data: result,
    });
    return NextResponse.json(result);
  } catch (syncError) {
    return NextResponse.json(
      { success: false, error: syncError instanceof Error ? syncError.message : "Không thể đồng bộ dữ liệu từ Thi Công Plan" },
      { status: 400 },
    );
  }
}
