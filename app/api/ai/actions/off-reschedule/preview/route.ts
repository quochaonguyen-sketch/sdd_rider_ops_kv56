import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageOperations } from "@/lib/auth/permissions";
import { parseOffRescheduleIntent } from "@/lib/ai/off-reschedule-intent";
import { normalizeSearch } from "@/lib/gpt-actions/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({ message: z.string().trim().min(1).max(4000) });
const offStatuses = ["OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED"];
const requestTypeStatus = { WEEKLY: "OFF_WEEKLY", PLANNED: "OFF_APPROVED", EMERGENCY: "OFF_UNEXPECTED" } as const;

export async function POST(request: Request) {
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ success: false, error: "Yêu cầu không hợp lệ" }, { status: 400 });

  const intent = parseOffRescheduleIntent(body.data.message);
  if (!intent.matched) return NextResponse.json({ success: true, matched: false });
  if (intent.error || !intent.riderName || !intent.fromDate || !intent.toDate) {
    return NextResponse.json({ success: true, matched: true, error: intent.error ?? "Chưa hiểu yêu cầu đổi lịch OFF." });
  }

  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!canManageOperations(profile?.role)) {
    return NextResponse.json({ success: false, matched: true, error: "Account không có quyền chỉnh lịch OFF." }, { status: 403 });
  }

  const { data: riders, error: riderError } = await admin
    .from("riders")
    .select("id,rider_code,full_name,status")
    .eq("status", "active")
    .limit(2000);
  if (riderError) return NextResponse.json({ success: false, error: riderError.message }, { status: 500 });

  const name = normalizeSearch(intent.riderName);
  const exact = (riders ?? []).filter((rider) => normalizeSearch(rider.full_name) === name || normalizeSearch(rider.rider_code) === name);
  const candidates = exact.length ? exact : (riders ?? []).filter((rider) => normalizeSearch(rider.full_name).includes(name));
  if (candidates.length !== 1) {
    return NextResponse.json({
      success: true,
      matched: true,
      error: candidates.length ? `Tìm thấy ${candidates.length} rider gần giống. Hãy ghi thêm mã rider.` : `Không tìm thấy rider active “${intent.riderName}”.`,
      candidates: candidates.slice(0, 5).map((rider) => ({ rider_code: rider.rider_code, full_name: rider.full_name })),
    });
  }
  const rider = candidates[0];

  const [attendanceResult, offRequestResult, targetAttendanceResult, targetRequestResult] = await Promise.all([
    admin.from("attendance_logs").select("id,status").eq("rider_code", rider.rider_code).eq("work_date", intent.fromDate).in("status", offStatuses).maybeSingle(),
    admin.from("rider_off_requests").select("id,request_type,status").eq("rider_id", rider.id).eq("off_date", intent.fromDate).eq("status", "APPROVED").maybeSingle(),
    admin.from("attendance_logs").select("id,status").eq("rider_code", rider.rider_code).eq("work_date", intent.toDate).maybeSingle(),
    admin.from("rider_off_requests").select("id,status").eq("rider_id", rider.id).eq("off_date", intent.toDate).in("status", ["PENDING", "APPROVED"]).maybeSingle(),
  ]);
  const firstError = attendanceResult.error ?? offRequestResult.error ?? targetAttendanceResult.error ?? targetRequestResult.error;
  if (firstError) return NextResponse.json({ success: false, error: firstError.message }, { status: 500 });
  if (!attendanceResult.data && !offRequestResult.data) {
    return NextResponse.json({ success: true, matched: true, error: `${rider.full_name} không có lịch OFF ngày ${intent.fromDate}.` });
  }
  if (targetAttendanceResult.data || targetRequestResult.data) {
    return NextResponse.json({ success: true, matched: true, error: `${rider.full_name} đã có lịch hoặc yêu cầu OFF ngày ${intent.toDate}; hệ thống không ghi đè.` });
  }

  const requestStatus = offRequestResult.data
    ? requestTypeStatus[offRequestResult.data.request_type as keyof typeof requestTypeStatus]
    : null;
  const offStatus = attendanceResult.data?.status ?? requestStatus;
  if (!offStatus || !offStatuses.includes(offStatus)) {
    return NextResponse.json({ success: true, matched: true, error: "Không xác định được loại OFF cần chuyển." });
  }

  const payload = {
    rider_id: rider.id,
    rider_code: rider.rider_code,
    rider_name: rider.full_name,
    from_date: intent.fromDate,
    to_date: intent.toDate,
    off_status: offStatus,
    attendance_id: attendanceResult.data?.id ?? null,
    off_request_id: offRequestResult.data?.id ?? null,
  };
  const { data: action, error: actionError } = await admin
    .from("ai_pending_actions")
    .insert({ user_id: user.id, action_type: "OFF_RESCHEDULE", payload })
    .select("id,expires_at")
    .single();
  if (actionError) return NextResponse.json({ success: false, error: actionError.message }, { status: 500 });

  await admin.from("activity_logs").insert({
    entity_type: "ai_off_reschedule",
    entity_id: action.id,
    action: "previewed",
    message: `AI preview OFF move for ${rider.rider_code}: ${intent.fromDate} -> ${intent.toDate}`,
    raw_data: { actor_id: user.id, ...payload },
  });

  return NextResponse.json({
    success: true,
    matched: true,
    proposal: {
      actionId: action.id,
      riderCode: rider.rider_code,
      riderName: rider.full_name,
      fromDate: intent.fromDate,
      toDate: intent.toDate,
      offStatus,
      expiresAt: action.expires_at,
    },
  });
}
