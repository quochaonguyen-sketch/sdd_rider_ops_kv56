import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  rider_code: z.string().trim().min(2).max(30),
  rider_name: z.string().trim().min(2).max(120),
  requester_email: z.email().trim().max(254),
  off_dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(31),
  shift: z.enum(["FULL_DAY", "MORNING", "AFTERNOON"]),
  reason: z.string().trim().max(500).optional(),
});

const EVIDENCE_BUCKET = "off-request-evidence";
const MAX_EVIDENCE_SIZE = 5 * 1024 * 1024;
const EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp"];

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
  const formData = await request.formData().catch(() => null);
  const datesValue = formData?.get("off_dates");
  const evidenceValue = formData?.get("evidence");
  let dateItems: unknown = null;
  if (typeof datesValue === "string") {
    try { dateItems = JSON.parse(datesValue); } catch { dateItems = null; }
  }
  const parsedDates = z.array(z.string()).safeParse(dateItems);
  const parsed = requestSchema.safeParse({
    rider_code: formData?.get("rider_code"),
    rider_name: formData?.get("rider_name"),
    requester_email: formData?.get("requester_email"),
    off_dates: parsedDates?.success ? parsedDates.data : null,
    shift: formData?.get("shift"),
    reason: formData?.get("reason") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Thông tin đăng ký chưa hợp lệ." }, { status: 400 });
  }

  const evidence = evidenceValue instanceof File && evidenceValue.size > 0 ? evidenceValue : null;
  if (evidence && !EVIDENCE_TYPES.includes(evidence.type)) {
    return NextResponse.json({ success: false, error: "Bằng chứng phải là ảnh JPG, PNG hoặc WebP." }, { status: 400 });
  }
  if (evidence && evidence.size > MAX_EVIDENCE_SIZE) {
    return NextResponse.json({ success: false, error: "Ảnh bằng chứng tối đa 5 MB." }, { status: 400 });
  }

  const payload = parsed.data;
  const offDates = Array.from(new Set(payload.off_dates)).sort();
  const today = saigonDate();
  const lastAllowed = saigonDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  if (offDates.some((date) => date < today || date > lastAllowed)) {
    return NextResponse.json({ success: false, error: "Các ngày OFF phải từ hôm nay đến tối đa 90 ngày tới." }, { status: 400 });
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
    .select("id,status,off_date,evidence_path")
    .eq("rider_id", rider.id)
    .in("off_date", offDates);

  if (existingError) {
    return NextResponse.json({ success: false, error: existingError.message }, { status: 500 });
  }
  const blockedDates = (existing ?? []).filter((item) => item.status === "PENDING" || item.status === "APPROVED").map((item) => item.off_date);
  if (blockedDates.length > 0) {
    return NextResponse.json({ success: false, error: `Các ngày đã có yêu cầu: ${blockedDates.join(", ")}.` }, { status: 409 });
  }

  const batchId = crypto.randomUUID();
  let evidencePath: string | null = null;
  if (evidence) {
    const extension = evidence.type === "image/png" ? "png" : evidence.type === "image/webp" ? "webp" : "jpg";
    evidencePath = `${rider.id}/${batchId}.${extension}`;
    const { error: uploadError } = await admin.storage.from(EVIDENCE_BUCKET).upload(evidencePath, evidence, {
      contentType: evidence.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      return NextResponse.json({ success: false, error: `Không thể tải ảnh bằng chứng: ${uploadError.message}` }, { status: 500 });
    }
  }

  const values = offDates.map((offDate) => ({
    batch_id: batchId,
    rider_id: rider.id,
    rider_code: rider.rider_code,
    off_date: offDate,
    request_type: "PLANNED",
    shift: payload.shift,
    reason: payload.reason || null,
    evidence_path: evidencePath,
    evidence_name: evidence?.name || null,
    evidence_type: evidence?.type || null,
    requester_email: payload.requester_email.toLowerCase(),
    email_notification_status: "PENDING",
    email_notification_error: null,
    email_notified_at: null,
    status: "PENDING",
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
  }));

  const { data: saved, error: saveError } = await admin
    .from("rider_off_requests")
    .upsert(values, { onConflict: "rider_id,off_date" })
    .select("id,off_date,status");
  if (saveError) {
    if (evidencePath) await admin.storage.from(EVIDENCE_BUCKET).remove([evidencePath]);
    return NextResponse.json({ success: false, error: saveError.message }, { status: 500 });
  }
  const replacedEvidence = Array.from(new Set((existing ?? []).map((item) => item.evidence_path).filter((path): path is string => Boolean(path) && path !== evidencePath)));
  if (replacedEvidence.length > 0) await admin.storage.from(EVIDENCE_BUCKET).remove(replacedEvidence);

  await admin.from("activity_logs").insert({
    entity_type: "rider_off_request",
    entity_id: saved?.[0]?.id ?? null,
    action: "submitted",
    message: `${offDates.length} OFF requests submitted for ${rider.rider_code}`,
    raw_data: { source: "public_off_registration", batch_id: batchId, request_type: "PLANNED", shift: payload.shift, off_dates: offDates, has_evidence: Boolean(evidencePath) },
  });

  return NextResponse.json({ success: true, batch_id: batchId, request_ids: (saved ?? []).map((item) => item.id), rider_name: rider.full_name, off_dates: offDates }, { status: 201 });
}
