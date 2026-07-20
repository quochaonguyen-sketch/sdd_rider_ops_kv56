import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  rider_code: z.string().trim().min(2).max(30),
  rider_name: z.string().trim().min(2).max(120),
  off_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  request_type: z.enum(["WEEKLY", "PLANNED", "EMERGENCY"]),
  shift: z.enum(["FULL_DAY", "MORNING", "AFTERNOON"]),
  reason: z.string().trim().max(500).optional(),
});

function saigonDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeIdentity(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/\s+/g, " ").trim().toLowerCase();
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Thông tin đăng ký chưa hợp lệ." }, { status: 400 });
  }

  const payload = parsed.data;
  const today = saigonDate();
  const lastAllowed = saigonDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  if (payload.off_date < today || payload.off_date > lastAllowed) {
    return NextResponse.json({ success: false, error: "Ngày OFF phải từ hôm nay đến tối đa 90 ngày tới." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: rider, error: riderError } = await admin
    .from("riders")
    .select("id,rider_code,full_name,status")
    .ilike("rider_code", payload.rider_code)
    .maybeSingle();

  if (riderError) {
    return NextResponse.json({ success: false, error: "Không thể kiểm tra thông tin rider." }, { status: 500 });
  }

  const verified = rider && normalizeIdentity(rider.full_name ?? "") === normalizeIdentity(payload.rider_name);
  if (!verified || String(rider.status ?? "active").toLowerCase() === "inactive") {
    return NextResponse.json({ success: false, error: "Mã rider hoặc họ tên không khớp dữ liệu." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await admin
    .from("rider_off_requests")
    .select("id,status")
    .eq("rider_id", rider.id)
    .eq("off_date", payload.off_date)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ success: false, error: existingError.message }, { status: 500 });
  }
  if (existing?.status === "PENDING" || existing?.status === "APPROVED") {
    return NextResponse.json({ success: false, error: existing.status === "APPROVED" ? "Lịch OFF ngày này đã được duyệt." : "Yêu cầu ngày này đang chờ duyệt." }, { status: 409 });
  }

  const values = {
    rider_id: rider.id,
    rider_code: rider.rider_code,
    off_date: payload.off_date,
    request_type: payload.request_type,
    shift: payload.shift,
    reason: payload.reason || null,
    status: "PENDING",
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
  };

  const query = existing
    ? admin.from("rider_off_requests").update(values).eq("id", existing.id)
    : admin.from("rider_off_requests").insert(values);
  const { data: saved, error: saveError } = await query.select("id,off_date,status").single();
  if (saveError) {
    return NextResponse.json({ success: false, error: saveError.message }, { status: 500 });
  }

  await admin.from("activity_logs").insert({
    entity_type: "rider_off_request",
    entity_id: saved.id,
    action: "submitted",
    message: `OFF request submitted for ${rider.rider_code} on ${payload.off_date}`,
    raw_data: { source: "public_off_registration", request_type: payload.request_type, shift: payload.shift },
  });

  return NextResponse.json({ success: true, request_id: saved.id, rider_name: rider.full_name, off_date: saved.off_date }, { status: existing ? 200 : 201 });
}
