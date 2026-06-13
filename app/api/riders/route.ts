import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const createRiderSchema = z.object({
  kv: z.string().trim().optional().nullable(),
  home_district: z.string().trim().optional().nullable(),
  cot: z.string().trim().optional().nullable(),
  rider_code: z.string().trim().min(1, "ID is required"),
  full_name: z.string().trim().min(1, "Fullname is required"),
  pickup_district: z.string().trim().optional().nullable(),
  pickup_ward: z.string().trim().optional().nullable(),
  point_name: z.string().trim().optional().nullable(),
  delivery_district: z.string().trim().optional().nullable(),
  delivery_ward: z.string().trim().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});

function emptyToNull(value: string | null | undefined) {
  return value?.trim() || null;
}

async function getSignedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: Request) {
  const user = await getSignedInUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = createRiderSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid rider", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const rider = parsed.data;
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("riders")
    .select("id")
    .eq("rider_code", rider.rider_code)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { success: false, error: `ID ${rider.rider_code} đã tồn tại` },
      { status: 409 },
    );
  }

  const { data, error } = await admin
    .from("riders")
    .insert({
      kv: emptyToNull(rider.kv),
      home_district: emptyToNull(rider.home_district),
      cot: emptyToNull(rider.cot),
      rider_code: rider.rider_code,
      full_name: rider.full_name,
      name: rider.full_name,
      pickup_district: emptyToNull(rider.pickup_district),
      pickup_ward: emptyToNull(rider.pickup_ward),
      point_name: emptyToNull(rider.point_name),
      delivery_district: emptyToNull(rider.delivery_district),
      delivery_ward: emptyToNull(rider.delivery_ward),
      status: rider.status,
      raw_data: rider,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  await admin.from("activity_logs").insert({
    entity_type: "rider",
    entity_id: data.id,
    action: "inserted",
    message: `Inserted rider ${rider.rider_code}`,
    raw_data: rider,
  });

  return NextResponse.json({ success: true, rider: data });
}

export async function PATCH(request: Request) {
  const user = await getSignedInUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = createRiderSchema.extend({ id: z.string().uuid() }).safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid rider", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, ...rider } = parsed.data;
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin
    .from("riders")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (existingError || !existing) {
    return NextResponse.json({ success: false, error: "Không tìm thấy rider" }, { status: 404 });
  }

  const { data: duplicate } = await admin
    .from("riders")
    .select("id")
    .eq("rider_code", rider.rider_code)
    .neq("id", id)
    .maybeSingle();

  if (duplicate) {
    return NextResponse.json(
      { success: false, error: `ID ${rider.rider_code} đã tồn tại` },
      { status: 409 },
    );
  }

  const { data, error } = await admin
    .from("riders")
    .update({
      kv: emptyToNull(rider.kv),
      home_district: emptyToNull(rider.home_district),
      cot: emptyToNull(rider.cot),
      rider_code: rider.rider_code,
      full_name: rider.full_name,
      name: rider.full_name,
      pickup_district: emptyToNull(rider.pickup_district),
      pickup_ward: emptyToNull(rider.pickup_ward),
      point_name: emptyToNull(rider.point_name),
      delivery_district: emptyToNull(rider.delivery_district),
      delivery_ward: emptyToNull(rider.delivery_ward),
      status: rider.status,
      raw_data: rider,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  await admin.from("activity_logs").insert({
    entity_type: "rider",
    entity_id: id,
    action: "updated",
    message: `Updated rider ${rider.rider_code}`,
    raw_data: rider,
  });

  return NextResponse.json({ success: true, rider: data });
}
