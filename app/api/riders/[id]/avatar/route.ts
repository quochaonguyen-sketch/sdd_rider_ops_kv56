import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "rider-avatars";
const MAX_AVATAR_SIZE = 3 * 1024 * 1024;

export async function POST(request: Request, context: RouteContext<"/api/riders/[id]/avatar">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const formData = await request.formData();
  const avatar = formData.get("avatar");

  if (!(avatar instanceof File)) {
    return NextResponse.json({ success: false, error: "Vui lòng chọn ảnh avatar" }, { status: 400 });
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(avatar.type)) {
    return NextResponse.json({ success: false, error: "Avatar phải là ảnh JPG, PNG hoặc WebP" }, { status: 400 });
  }
  if (avatar.size > MAX_AVATAR_SIZE) {
    return NextResponse.json({ success: false, error: "Avatar tối đa 3 MB" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: rider, error: riderError } = await admin
    .from("riders")
    .select("id, rider_code, avatar_url")
    .eq("id", id)
    .maybeSingle();

  if (riderError || !rider) {
    return NextResponse.json({ success: false, error: "Không tìm thấy rider" }, { status: 404 });
  }

  const { data: buckets, error: bucketListError } = await admin.storage.listBuckets();
  if (bucketListError) {
    return NextResponse.json({ success: false, error: bucketListError.message }, { status: 400 });
  }
  if (!buckets.some((bucket) => bucket.name === BUCKET)) {
    const { error: bucketError } = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_AVATAR_SIZE,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    if (bucketError) {
      return NextResponse.json({ success: false, error: bucketError.message }, { status: 400 });
    }
  }

  const extension = avatar.type === "image/png" ? "png" : avatar.type === "image/webp" ? "webp" : "jpg";
  const path = `${id}/avatar-${Date.now()}.${extension}`;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, avatar, {
    contentType: avatar.type,
    cacheControl: "3600",
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json({ success: false, error: uploadError.message }, { status: 400 });
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(path);
  const { data: updated, error: updateError } = await admin
    .from("riders")
    .update({ avatar_url: publicUrl })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    await admin.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ success: false, error: updateError.message }, { status: 400 });
  }

  if (rider.avatar_url) {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const oldPath = rider.avatar_url.split(marker)[1];
    if (oldPath) await admin.storage.from(BUCKET).remove([decodeURIComponent(oldPath)]);
  }

  await admin.from("activity_logs").insert({
    entity_type: "rider",
    entity_id: id,
    action: "avatar_updated",
    message: `Updated avatar for rider ${rider.rider_code}`,
  });

  return NextResponse.json({ success: true, rider: updated });
}
