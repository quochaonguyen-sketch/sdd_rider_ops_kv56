import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth/permissions";
import { sendOffRequestDecisionEmail, type OffRequestEmailResult } from "@/lib/email/off-request-notification";
import { processAttendanceSheetSync, type AttendanceSheetSyncResult } from "@/lib/google/attendance-sheet-sync";
import { normalizeCot, normalizeWard, offArea } from "@/lib/off-schedule/ward";
import type { WardConflict } from "@/types";

const updateSchema = z.object({
  action: z.enum(["APPROVE", "REJECT", "RESEND_EMAIL"]),
  review_note: z.string().trim().max(500).optional(),
  sheet_url: z.string().trim().max(1000).optional().nullable(),
});

const attendanceStatus = {
  WEEKLY: "OFF_WEEKLY",
  PLANNED: "OFF_APPROVED",
  EMERGENCY: "OFF_UNEXPECTED",
} as const;

export async function PATCH(request: Request, context: RouteContext<"/api/off-requests/[id]">) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!canManageOperations(profile?.role)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền xếp lịch OFF." }, { status: 403 });
  }

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Thao tác không hợp lệ." }, { status: 400 });
  const { id } = await context.params;

  const { data: offRequest, error: loadError } = await admin.from("rider_off_requests").select("*").eq("id", id).maybeSingle();
  if (loadError) return NextResponse.json({ success: false, error: loadError.message }, { status: 500 });
  if (!offRequest) return NextResponse.json({ success: false, error: "Không tìm thấy yêu cầu OFF." }, { status: 404 });
  if (parsed.data.action === "RESEND_EMAIL" && !["APPROVED", "REJECTED"].includes(offRequest.status)) {
    return NextResponse.json({ success: false, error: "Chỉ gửi email sau khi yêu cầu đã được xử lý." }, { status: 400 });
  }

  let sheetSync: AttendanceSheetSyncResult | null = null;

  if (parsed.data.action === "APPROVE") {
    const status = attendanceStatus[offRequest.request_type as keyof typeof attendanceStatus];
    if (!status) return NextResponse.json({ success: false, error: "Loại OFF không được hỗ trợ." }, { status: 400 });
    const { error: attendanceError } = await admin.from("attendance_logs").upsert({
      rider_id: offRequest.rider_id,
      rider_code: offRequest.rider_code,
      work_date: offRequest.off_date,
      status,
      shift: offRequest.shift === "FULL_DAY" ? null : offRequest.shift,
      note: offRequest.reason || parsed.data.review_note || null,
      raw_data: { source: "rider_off_request", request_id: offRequest.id, request_type: offRequest.request_type },
    }, { onConflict: "rider_code,work_date" });
    if (attendanceError) return NextResponse.json({ success: false, error: attendanceError.message }, { status: 500 });

    sheetSync = await processAttendanceSheetSync(300, parsed.data.sheet_url ?? null);
  } else if (parsed.data.action === "REJECT" && offRequest.status === "APPROVED") {
    const { data: attendance } = await admin
      .from("attendance_logs")
      .select("id,raw_data")
      .eq("rider_code", offRequest.rider_code)
      .eq("work_date", offRequest.off_date)
      .maybeSingle();
    if (attendance?.raw_data && (attendance.raw_data as Record<string, unknown>).request_id === offRequest.id) {
      const { error: removeError } = await admin.from("attendance_logs").delete().eq("id", attendance.id);
      if (removeError) return NextResponse.json({ success: false, error: removeError.message }, { status: 500 });
    }

    sheetSync = await processAttendanceSheetSync(300, parsed.data.sheet_url ?? null);
  }

  const nextStatus = parsed.data.action === "RESEND_EMAIL"
    ? offRequest.status as "APPROVED" | "REJECTED"
    : parsed.data.action === "APPROVE" ? "APPROVED" : "REJECTED";
  let updated = offRequest;
  if (parsed.data.action !== "RESEND_EMAIL") {
    const { data, error: updateError } = await admin.from("rider_off_requests").update({
      status: nextStatus,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: parsed.data.review_note || null,
      email_notification_status: "PENDING",
      email_notification_error: null,
      email_notified_at: null,
    }).eq("id", id).select("*").single();
    if (updateError) return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    updated = data;
  }

  let wardWarning: WardConflict | null = null;
  if (nextStatus === "APPROVED") {
    wardWarning = await findWardOffConflict(admin, offRequest);
  }

  const { data: riderProfile } = await admin.from("riders").select("full_name").eq("id", offRequest.rider_id).maybeSingle();
  const emailResult: OffRequestEmailResult = offRequest.requester_email
    ? await sendOffRequestDecisionEmail({
        to: offRequest.requester_email,
        riderName: riderProfile?.full_name ?? null,
        riderCode: offRequest.rider_code,
        offDate: offRequest.off_date,
        shift: offRequest.shift,
        decision: nextStatus,
        reviewNote: parsed.data.review_note || offRequest.review_note,
      })
    : { status: "NOT_CONFIGURED", error: "Yêu cầu không có email người đăng ký" };

  const { data: notified, error: notificationUpdateError } = await admin.from("rider_off_requests").update({
    email_notification_status: emailResult.status,
    email_notification_error: emailResult.error?.slice(0, 1000) || null,
    email_notified_at: emailResult.status === "SENT" ? new Date().toISOString() : null,
  }).eq("id", id).select("*").single();
  if (!notificationUpdateError && notified) updated = notified;

  await admin.from("activity_logs").insert({
    entity_type: "rider_off_request",
    entity_id: id,
    action: parsed.data.action === "RESEND_EMAIL" ? "email_retried" : nextStatus.toLowerCase(),
    message: `${offRequest.rider_code} OFF request ${nextStatus.toLowerCase()} for ${offRequest.off_date}`,
    raw_data: { reviewer_id: user.id, attendance_synced: parsed.data.action !== "RESEND_EMAIL", email_status: emailResult.status, email_provider_id: emailResult.providerId ?? null },
  });
  return NextResponse.json({ success: true, request: updated, email_notification: emailResult, sheet_sync: sheetSync ?? undefined, ward_warning: wardWarning });
}


async function findWardOffConflict(
  admin: ReturnType<typeof createAdminClient>,
  offRequest: { id: string; rider_id: string; off_date: string },
): Promise<WardConflict | null> {
  const { data: rider, error: riderError } = await admin
    .from("riders")
    .select("id,cot,delivery_district,delivery_ward,pickup_district,pickup_ward")
    .eq("id", offRequest.rider_id)
    .maybeSingle();
  if (riderError || !rider) return null;
  const displayWard = offArea(rider).ward;
  const ward = normalizeWard(displayWard);
  if (!ward) return null;

  const { data: sameDate } = await admin
    .from("rider_off_requests")
    .select("id,rider_id,rider_code,status")
    .eq("off_date", offRequest.off_date)
    .in("status", ["PENDING", "APPROVED"])
    .neq("id", offRequest.id)
    .limit(200);
  if (!sameDate?.length) return null;

  const riderIds = Array.from(new Set(sameDate.map((item) => item.rider_id)));
  const { data: riders, error: ridersError } = await admin
    .from("riders")
    .select("id,full_name,cot,delivery_district,delivery_ward,pickup_district,pickup_ward")
    .in("id", riderIds);
  if (ridersError) return null;
  const ridersById = new Map((riders ?? []).map((item) => [item.id, item]));

  const cot = normalizeCot(rider.cot) || null;
  const sameWard = sameDate.filter((item) => {
    const other = ridersById.get(item.rider_id);
    if (!other) return false;
    const sameWardName = normalizeWard(offArea(other).ward) === ward;
    const sameCot = normalizeCot(other.cot) === normalizeCot(rider.cot);
    return sameWardName && sameCot;
  });
  if (!sameWard.length) return null;

  return {
    ward: displayWard || ward,
    cot,
    count: sameWard.length,
    has_approved: sameWard.some((item) => item.status === "APPROVED"),
    riders: sameWard.map((item) => ({
      rider_code: item.rider_code,
      full_name: ridersById.get(item.rider_id)?.full_name ?? null,
      status: item.status as "PENDING" | "APPROVED",
    })),
  };
}
