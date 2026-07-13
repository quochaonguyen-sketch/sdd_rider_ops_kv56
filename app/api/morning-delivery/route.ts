import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations, canManageRiders } from "@/lib/auth/permissions";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const assignSchema = z.object({
  work_date: dateSchema,
  rider_id: z.string().uuid(),
  district: z.string().trim().min(1).max(100),
  wards: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
  preassigned: z.boolean().optional().default(false),
});
const removeSchema = z.object({
  work_date: dateSchema,
  rider_id: z.string().uuid(),
  district: z.string().trim().min(1).max(100),
});
const absenceNoteSchema = z.object({
  work_date: dateSchema,
  rider_id: z.string().uuid(),
  reason: z.string().trim().max(500),
  is_excused: z.boolean(),
});
const checkInSchema = z.object({
  work_date: dateSchema,
  rider_id: z.string().uuid(),
});

async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { admin, role: profile?.role ?? "viewer" };
}

function canEdit(role: string) {
  return canManageOperations(role);
}

function isCot1(value: string | null) {
  return /\bcot\s*1\b/i.test(value ?? "") || value?.trim() === "1";
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const workDate = new URL(request.url).searchParams.get("date");
  if (!dateSchema.safeParse(workDate).success) {
    return NextResponse.json({ success: false, error: "Ngày không hợp lệ" }, { status: 400 });
  }

  const [riderResult, assignmentResult, attendanceResult, absenceNoteResult, latestRealtimeDeliveryResult, realtime10amResult] = await Promise.all([
    session.admin
      .from("riders")
      .select("id,rider_code,full_name,kv,cot,pickup_district,pickup_ward,delivery_district,delivery_ward,status")
      .eq("status", "active")
      .order("rider_code"),
    session.admin
      .from("morning_delivery_assignments")
      .select("id,work_date,rider_id,rider_code,district,ward,assigned_at,checked_in_at,riders(full_name,cot)")
      .eq("work_date", workDate)
      .order("assigned_at", { ascending: false }),
    session.admin
      .from("attendance_logs")
      .select("id,rider_id,rider_code,work_date,status,note")
      .eq("work_date", workDate),
    session.admin
      .from("morning_delivery_absence_notes")
      .select("id,work_date,rider_id,rider_code,reason,is_excused,updated_at")
      .eq("work_date", workDate),
    session.admin
      .from("realtime_delivery_riders")
      .select("snapshot_id,snapshot_at")
      .eq("work_date", workDate)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    session.admin
      .from("realtime_delivery_riders_10am")
      .select("driver_id,total_assigned,delivered,delivering,failed,snapshot_at")
      .eq("work_date", workDate),
  ]);

  const error = riderResult.error ?? assignmentResult.error ?? attendanceResult.error ?? absenceNoteResult.error ?? latestRealtimeDeliveryResult.error ?? realtime10amResult.error;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  const cot1Riders = (riderResult.data ?? []).filter((rider) => isCot1(rider.cot));
  const latestSnapshotId = latestRealtimeDeliveryResult.data?.snapshot_id ?? null;
  let activeDeliveryRiderCount = 0;
  let realtimeDeliveryRiders: Array<{
    driver_id: string;
    total_assigned: number;
    delivered: number;
    delivering: number;
    failed: number;
  }> = [];
  if (latestSnapshotId) {
    const activeDeliveryResult = await session.admin
      .from("realtime_delivery_riders")
      .select("driver_id,total_assigned,delivered,delivering,failed", { count: "exact" })
      .eq("work_date", workDate)
      .eq("snapshot_id", latestSnapshotId);
    if (activeDeliveryResult.error) {
      return NextResponse.json({ success: false, error: activeDeliveryResult.error.message }, { status: 400 });
    }
    realtimeDeliveryRiders = activeDeliveryResult.data ?? [];
    activeDeliveryRiderCount = realtimeDeliveryRiders.filter((row) => row.total_assigned > 0).length;
  }
  return NextResponse.json({
    success: true,
    can_edit: canEdit(session.role),
    can_manage_riders: canManageRiders(session.role),
    riders: cot1Riders,
    assignments: assignmentResult.data ?? [],
    attendance: attendanceResult.data ?? [],
    absence_notes: absenceNoteResult.data ?? [],
    active_delivery_rider_count: activeDeliveryRiderCount,
    realtime_delivery_riders: realtimeDeliveryRiders,
    realtime_delivery_riders_10am: realtime10amResult.data ?? [],
    realtime_delivery_updated_at: latestRealtimeDeliveryResult.data?.snapshot_at ?? null,
  });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.role)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền cập nhật ghi chú" }, { status: 403 });
  }

  const parsed = absenceNoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Ghi chú vắng không hợp lệ" }, { status: 400 });
  }

  const { data: rider, error: riderError } = await session.admin
    .from("riders")
    .select("id,rider_code,cot")
    .eq("id", parsed.data.rider_id)
    .maybeSingle();

  if (riderError || !rider) {
    return NextResponse.json({ success: false, error: riderError?.message ?? "Không tìm thấy rider" }, { status: 404 });
  }
  if (!isCot1(rider.cot)) {
    return NextResponse.json({ success: false, error: "Chỉ ghi chú điểm danh sáng cho rider COT 1" }, { status: 400 });
  }

  if (!parsed.data.reason && !parsed.data.is_excused) {
    const { error } = await session.admin
      .from("morning_delivery_absence_notes")
      .delete()
      .eq("work_date", parsed.data.work_date)
      .eq("rider_id", rider.id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, absence_note: null });
  }

  const { data: absenceNote, error } = await session.admin
    .from("morning_delivery_absence_notes")
    .upsert(
      {
        work_date: parsed.data.work_date,
        rider_id: rider.id,
        rider_code: rider.rider_code,
        reason: parsed.data.reason,
        is_excused: parsed.data.is_excused,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "work_date,rider_id" },
    )
    .select("id,work_date,rider_id,rider_code,reason,is_excused,updated_at")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  await session.admin.from("activity_logs").insert({
    entity_type: "morning_delivery_absence_note",
    entity_id: rider.id,
    action: "updated",
    message: `Updated morning absence note for ${rider.rider_code}`,
    raw_data: { work_date: parsed.data.work_date, is_excused: parsed.data.is_excused },
  });

  return NextResponse.json({ success: true, absence_note: absenceNote });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.role)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền chia khu vực" }, { status: 403 });
  }

  const parsed = assignSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Dữ liệu chia khu vực không hợp lệ" }, { status: 400 });
  }

  const { data: rider, error: riderError } = await session.admin
    .from("riders")
    .select("id,rider_code,full_name,cot,pickup_district,pickup_ward")
    .eq("id", parsed.data.rider_id)
    .maybeSingle();

  if (riderError || !rider) {
    return NextResponse.json({ success: false, error: riderError?.message ?? "Không tìm thấy rider" }, { status: 404 });
  }
  if (!isCot1(rider.cot)) {
    return NextResponse.json({ success: false, error: "Chỉ được chia khu vực cho rider COT 1" }, { status: 400 });
  }
  const { data: existingAssignments, error: existingError } = await session.admin
    .from("morning_delivery_assignments")
    .select("district,ward")
    .eq("work_date", parsed.data.work_date)
    .eq("rider_id", rider.id);

  if (existingError) {
    return NextResponse.json({ success: false, error: existingError.message }, { status: 400 });
  }
  if ((existingAssignments ?? []).length > 0) {
    const areas = (existingAssignments ?? []).map((item) => `${item.district} ${item.ward}`).join(", ");
    return NextResponse.json(
      { success: false, error: `${rider.full_name?.trim() || rider.rider_code} đã điểm danh: ${areas}` },
      { status: 409 },
    );
  }
  const wards = Array.from(new Set(parsed.data.wards));
  const rows = wards.map((ward) => ({
    work_date: parsed.data.work_date,
    rider_id: rider.id,
    rider_code: rider.rider_code,
    district: parsed.data.district,
    ward,
    checked_in_at: parsed.data.preassigned ? null : new Date().toISOString(),
  }));
  const { error: insertError } = await session.admin.from("morning_delivery_assignments").insert(rows);
  if (insertError) return NextResponse.json({ success: false, error: insertError.message }, { status: 409 });

  await session.admin.from("activity_logs").insert({
    entity_type: "morning_delivery_assignment",
    entity_id: rider.id,
    action: "assigned",
    message: `${parsed.data.preassigned ? "Pre-assigned" : "Assigned"} ${rider.rider_code} to ${parsed.data.district}: ${wards.join(", ")}`,
    raw_data: { work_date: parsed.data.work_date, district: parsed.data.district, wards, preassigned: parsed.data.preassigned },
  });

  return NextResponse.json({ success: true });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.role)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền điểm danh rider" }, { status: 403 });
  }

  const parsed = checkInSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Dữ liệu điểm danh không hợp lệ" }, { status: 400 });
  }

  const checkedInAt = new Date().toISOString();
  const { data, error } = await session.admin
    .from("morning_delivery_assignments")
    .update({ checked_in_at: checkedInAt })
    .eq("work_date", parsed.data.work_date)
    .eq("rider_id", parsed.data.rider_id)
    .is("checked_in_at", null)
    .select("id");

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  if (!data?.length) {
    const { count } = await session.admin
      .from("morning_delivery_assignments")
      .select("id", { count: "exact", head: true })
      .eq("work_date", parsed.data.work_date)
      .eq("rider_id", parsed.data.rider_id);
    if (!count) return NextResponse.json({ success: false, error: "Rider chưa được chia phường" }, { status: 409 });
  }

  return NextResponse.json({ success: true, checked_in_at: checkedInAt });
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!canEdit(session.role)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền huỷ chia khu vực" }, { status: 403 });
  }

  const parsed = removeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Dữ liệu huỷ không hợp lệ" }, { status: 400 });
  }

  const { error } = await session.admin
    .from("morning_delivery_assignments")
    .delete()
    .eq("work_date", parsed.data.work_date)
    .eq("rider_id", parsed.data.rider_id)
    .eq("district", parsed.data.district);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
