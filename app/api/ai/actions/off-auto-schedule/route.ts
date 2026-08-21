import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageOperations } from "@/lib/auth/permissions";
import { invalidateAttendanceCache } from "@/lib/cache/operations-cache";
import { normalizeCot, normalizeWard, offArea } from "@/lib/off-schedule/ward";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const actionSchema = z.object({ actionId: z.string().uuid() });

const OFF_ATTENDANCE_STATUSES = ["OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED"];

type Assignment = {
  rider_id: string;
  rider_code: string;
  full_name: string | null;
  ward: string;
  off_date: string;
};

type WardPlan = {
  ward: string;
  total_riders: number;
  assignments: Assignment[];
  skipped: Array<{ rider_id: string; rider_code: string; full_name: string | null; ward: string; reason: string }>;
};

type AutoSchedulePayload = {
  district: string;
  week_start: string;
  week_end: string;
  ward_scope: string | null;
  wards: WardPlan[];
  total_assignments: number;
  total_skipped: number;
  already_have_off: number;
};

async function session() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { user, admin, canManage: canManageOperations(profile?.role) };
}

export async function POST(request: Request) {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!auth.canManage) return NextResponse.json({ success: false, error: "Account không có quyền xếp lịch OFF." }, { status: 403 });

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Action không hợp lệ" }, { status: 400 });

  const { data: pending, error: pendingError } = await auth.admin
    .from("ai_pending_actions")
    .select("payload,status,expires_at")
    .eq("id", parsed.data.actionId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (pendingError) return NextResponse.json({ success: false, error: pendingError.message }, { status: 500 });
  if (!pending || pending.status !== "PENDING") {
    return NextResponse.json({ success: false, error: "Action không còn chờ xác nhận." }, { status: 409 });
  }
  if (pending.expires_at && new Date(pending.expires_at) <= new Date()) {
    await auth.admin.from("ai_pending_actions").update({ status: "EXPIRED" }).eq("id", parsed.data.actionId);
    return NextResponse.json({ success: false, error: "Action đã hết hạn; hãy tạo bản xem trước mới." }, { status: 409 });
  }

  const payload = pending.payload as AutoSchedulePayload;
  const assignments = payload.wards.flatMap((ward) => ward.assignments);
  if (!assignments.length) {
    return NextResponse.json({ success: false, error: "Bản xem trước không có lịch nào để tạo." }, { status: 409 });
  }

  // Re-validate against the current database state before writing anything.
  const conflict = await findConflicts(auth.admin, assignments);
  if (conflict) {
    return NextResponse.json({ success: false, error: conflict }, { status: 409 });
  }

  const batchIds = new Map<string, string>();
  const rows = assignments.map((assignment) => {
    const batchId = batchIds.get(assignment.rider_id) ?? crypto.randomUUID();
    batchIds.set(assignment.rider_id, batchId);
    return {
      batch_id: batchId,
      rider_id: assignment.rider_id,
      rider_code: assignment.rider_code,
      off_date: assignment.off_date,
      request_type: "WEEKLY",
      shift: "FULL_DAY",
      reason: `AI tự xếp lịch OFF ${payload.district} (phường ${assignment.ward})`,
      status: "PENDING",
      email_notification_status: "PENDING",
      email_notification_error: null,
      email_notified_at: null,
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
    };
  });

  const { data: created, error: insertError } = await auth.admin
    .from("rider_off_requests")
    .insert(rows)
    .select("id,rider_code,off_date,status");
  if (insertError) {
    return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
  }

  const { error: executeError } = await auth.admin
    .from("ai_pending_actions")
    .update({ status: "EXECUTED", executed_at: new Date().toISOString() })
    .eq("id", parsed.data.actionId)
    .eq("status", "PENDING");
  if (executeError) return NextResponse.json({ success: false, error: executeError.message }, { status: 500 });

  invalidateAttendanceCache(payload.week_start.slice(0, 7));
  if (payload.week_start.slice(0, 7) !== payload.week_end.slice(0, 7)) {
    invalidateAttendanceCache(payload.week_end.slice(0, 7));
  }

  await auth.admin.from("activity_logs").insert({
    entity_type: "ai_off_auto_schedule",
    entity_id: parsed.data.actionId,
    action: "executed",
    message: `AI auto OFF schedule created ${created?.length ?? 0} requests for ${payload.district} ${payload.week_start}..${payload.week_end}`,
    raw_data: { actor_id: auth.user.id, district: payload.district, week_start: payload.week_start, week_end: payload.week_end, ward_scope: payload.ward_scope, assignments: assignments.length },
  });

  return NextResponse.json({
    success: true,
    result: {
      action_id: parsed.data.actionId,
      created: created?.length ?? 0,
      requests: created ?? [],
      note: "Các yêu cầu được tạo ở trạng thái Chờ duyệt trên trang Xếp lịch OFF.",
    },
  });
}

export async function DELETE(request: Request) {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Action không hợp lệ" }, { status: 400 });

  const { data, error } = await auth.admin
    .from("ai_pending_actions")
    .update({ status: "CANCELLED" })
    .eq("id", parsed.data.actionId)
    .eq("user_id", auth.user.id)
    .eq("status", "PENDING")
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ success: false, error: "Action không còn chờ xác nhận." }, { status: 409 });
  return NextResponse.json({ success: true });
}

async function findConflicts(
  admin: ReturnType<typeof createAdminClient>,
  assignments: Assignment[],
): Promise<string | null> {
  const riderIds = Array.from(new Set(assignments.map((assignment) => assignment.rider_id)));
  const { data: riders, error: ridersError } = await admin
    .from("riders")
    .select("id,rider_code,full_name,cot,delivery_district,delivery_ward,pickup_district,pickup_ward,status")
    .in("id", riderIds);
  if (ridersError) return ridersError.message;
  const ridersById = new Map((riders ?? []).map((rider) => [rider.id, rider]));

  for (const assignment of assignments) {
    const rider = ridersById.get(assignment.rider_id);
    if (!rider || String(rider.status ?? "active").toLowerCase() === "inactive") {
      return `Rider ${assignment.rider_code} không còn active; hãy tạo bản xem trước mới.`;
    }
  }

  const dates = Array.from(new Set(assignments.map((assignment) => assignment.off_date)));
  const [offRequestResult, attendanceResult] = await Promise.all([
    admin
      .from("rider_off_requests")
      .select("id,rider_id,rider_code,off_date,status")
      .in("rider_id", riderIds)
      .in("off_date", dates)
      .in("status", ["PENDING", "APPROVED"])
      .limit(1000),
    admin
      .from("attendance_logs")
      .select("rider_id,rider_code,work_date")
      .in("rider_id", riderIds)
      .in("work_date", dates)
      .in("status", OFF_ATTENDANCE_STATUSES)
      .limit(1000),
  ]);
  if (offRequestResult.error) return offRequestResult.error.message;
  if (attendanceResult.error) return attendanceResult.error.message;

  const assignmentByKey = new Map(assignments.map((assignment) => [`${assignment.rider_id}|${assignment.off_date}`, assignment]));
  for (const item of (offRequestResult.data ?? []) as Array<{ rider_id: string; off_date: string }>) {
    const assignment = assignmentByKey.get(`${item.rider_id}|${String(item.off_date).slice(0, 10)}`);
    if (assignment) {
      return `Rider ${assignment.rider_code} đã có yêu cầu OFF ngày ${assignment.off_date}; hãy tạo bản xem trước mới.`;
    }
  }
  for (const item of (attendanceResult.data ?? []) as Array<{ rider_id: string | null; rider_code: string; work_date: string }>) {
    const riderId = item.rider_id ?? Array.from(ridersById.values()).find((rider) => rider.rider_code === item.rider_code)?.id;
    const assignment = riderId ? assignmentByKey.get(`${riderId}|${String(item.work_date).slice(0, 10)}`) : undefined;
    if (assignment) {
      return `Rider ${assignment.rider_code} đã có lịch OFF ngày ${assignment.off_date}; hãy tạo bản xem trước mới.`;
    }
  }

  // Same ward, same COT, same day, already-approved OFF blocks a new one.
  // COT1 and COT2 are separate groups, so they may share a day.
  const approvedByGroupDate = new Map<string, string>();
  for (const item of (offRequestResult.data ?? []) as Array<{ rider_id: string; rider_code: string; off_date: string; status: string }>) {
    if (item.status !== "APPROVED") continue;
    const rider = ridersById.get(item.rider_id);
    if (!rider) continue;
    const ward = normalizeWard(offArea(rider).ward);
    if (!ward) continue;
    const key = `${ward}|${normalizeCot(rider.cot)}|${String(item.off_date).slice(0, 10)}`;
    approvedByGroupDate.set(key, item.rider_code);
  }
  for (const assignment of assignments) {
    const rider = ridersById.get(assignment.rider_id);
    if (!rider) continue;
    const ward = normalizeWard(offArea(rider).ward);
    if (!ward) continue;
    const cot = normalizeCot(rider.cot) || null;
    const existing = approvedByGroupDate.get(`${ward}|${normalizeCot(rider.cot)}|${assignment.off_date}`);
    if (existing) {
      return `Phường ${assignment.ward}${cot ? ` (${cot})` : ""} ngày ${assignment.off_date} đã có ${existing} OFF được duyệt cùng COT; không xếp thêm người thứ hai.`;
    }
  }

  return null;
}
