import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  rider_id: z.string().uuid(),
  delivery_district: z.string().trim().max(100).nullable(),
  delivery_ward: z.string().trim().max(500).nullable(),
});

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "leader") {
    return NextResponse.json({ success: false, error: "Bạn không có quyền sửa tuyến cố định" }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Tuyến cố định không hợp lệ" }, { status: 400 });
  }
  if (Boolean(parsed.data.delivery_district) !== Boolean(parsed.data.delivery_ward)) {
    return NextResponse.json({ success: false, error: "Phải chọn đủ quận và phường" }, { status: 400 });
  }

  const { data: rider, error: riderError } = await admin
    .from("riders")
    .select("id,rider_code,pickup_district,pickup_ward")
    .eq("id", parsed.data.rider_id)
    .maybeSingle();
  if (riderError || !rider) {
    return NextResponse.json({ success: false, error: riderError?.message ?? "Không tìm thấy rider" }, { status: 404 });
  }
  if (rider.pickup_district?.trim() || rider.pickup_ward?.trim()) {
    return NextResponse.json({ success: false, error: "Rider có tuyến pickup không thuộc bảng tự xếp bắt buộc" }, { status: 409 });
  }

  const { data, error } = await admin
    .from("riders")
    .update({
      delivery_district: parsed.data.delivery_district || null,
      delivery_ward: parsed.data.delivery_ward || null,
    })
    .eq("id", rider.id)
    .select("id,rider_code,delivery_district,delivery_ward")
    .single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  await admin.from("activity_logs").insert({
    entity_type: "rider_default_delivery_route",
    entity_id: rider.id,
    action: "updated",
    message: `Updated default delivery route for ${rider.rider_code}`,
    raw_data: parsed.data,
  });
  return NextResponse.json({ success: true, rider: data });
}
