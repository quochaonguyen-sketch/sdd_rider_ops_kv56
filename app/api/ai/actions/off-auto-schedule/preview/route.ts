import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageOperations } from "@/lib/auth/permissions";
import { parseOffAutoScheduleIntent } from "@/lib/ai/off-auto-schedule-intent";
import { buildOffAutoScheduleProposal, type AutoScheduleRider, type OffAutoScheduleProposal } from "@/lib/ai/off-auto-schedule";
import { todayInVietnam } from "@/lib/ai/work-date";
import { normalizeCot, normalizeDistrict, normalizeWard, offArea } from "@/lib/off-schedule/ward";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ message: z.string().trim().min(1).max(4000) });

const OFF_ATTENDANCE_STATUSES = ["OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED"];

type DistrictRider = {
  id: string;
  rider_code: string;
  full_name: string | null;
  cot: string | null;
  delivery_district: string | null;
  delivery_ward: string | null;
  pickup_district: string | null;
  pickup_ward: string | null;
};

export async function POST(request: Request) {
  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ success: false, error: "Yêu cầu không hợp lệ" }, { status: 400 });

  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!canManageOperations(profile?.role)) {
    return NextResponse.json({ success: false, matched: true, error: "Account không có quyền xếp lịch OFF." }, { status: 403 });
  }

  const initialIntent = parseOffAutoScheduleIntent(body.data.message);
  if (!initialIntent.matched) return NextResponse.json({ success: true, matched: false });
  if (initialIntent.error) {
    return NextResponse.json({ success: true, matched: true, error: initialIntent.error });
  }
  const intent = initialIntent;

  const { data: riders, error: riderError } = await admin
    .from("riders")
    .select("id,rider_code,full_name,cot,delivery_district,delivery_ward,pickup_district,pickup_ward,status")
    .eq("status", "active")
    .limit(2000);
  if (riderError) return NextResponse.json({ success: false, error: riderError.message }, { status: 500 });

  const districtNormalized = normalizeDistrict(intent.district);
  const districtRiders = ((riders ?? []) as DistrictRider[]).filter(
    (rider) => normalizeDistrict(offArea(rider).district) === districtNormalized,
  );
  if (!districtRiders.length) {
    return NextResponse.json({ success: true, matched: true, error: `Không tìm thấy rider active nào ở ${intent.district}.` });
  }

  // Resolve optional ward against real ward names of the district.
  const knownWards = Array.from(
    new Set(districtRiders.map((rider) => normalizeWard(offArea(rider).ward)).filter(Boolean)),
  );
  const resolvedIntent = parseOffAutoScheduleIntent(body.data.message, { knownWards });
  const wardScope = resolvedIntent.ward ?? null;
  const scopedRiders = wardScope
    ? districtRiders.filter((rider) => normalizeWard(offArea(rider).ward) === wardScope)
    : districtRiders;
  if (wardScope && !scopedRiders.length) {
    return NextResponse.json({ success: true, matched: true, error: `Không tìm thấy rider active ở phường ${wardScope}.` });
  }

  const riderIds = scopedRiders.map((rider) => rider.id);
  const [offRequestResult, attendanceResult] = await Promise.all([
    admin
      .from("rider_off_requests")
      .select("id,rider_id,off_date,status")
      .in("rider_id", riderIds)
      .gte("off_date", intent.weekStart)
      .lte("off_date", intent.weekEnd)
      .in("status", ["PENDING", "APPROVED"])
      .limit(2000),
    admin
      .from("attendance_logs")
      .select("rider_id,rider_code,work_date,status")
      .gte("work_date", intent.weekStart)
      .lte("work_date", intent.weekEnd)
      .in("status", OFF_ATTENDANCE_STATUSES)
      .limit(2000),
  ]);
  if (offRequestResult.error) return NextResponse.json({ success: false, error: offRequestResult.error.message }, { status: 500 });
  if (attendanceResult.error) return NextResponse.json({ success: false, error: attendanceResult.error.message }, { status: 500 });

  const riderById = new Map(scopedRiders.map((rider) => [rider.id, rider]));
  const riderTakenDates = new Map<string, Set<string>>();
  const wardTakenDates = new Map<string, Set<string>>();

  const addTaken = (riderId: string, date: string, confirmed: boolean) => {
    const taken = riderTakenDates.get(riderId) ?? new Set<string>();
    taken.add(date);
    riderTakenDates.set(riderId, taken);
    if (confirmed) {
      const rider = riderById.get(riderId);
      if (rider) {
        const ward = normalizeWard(offArea(rider).ward);
        if (ward) {
          const groupKey = `${ward}|${normalizeCot(rider.cot)}`;
          const wardTaken = wardTakenDates.get(groupKey) ?? new Set<string>();
          wardTaken.add(date);
          wardTakenDates.set(groupKey, wardTaken);
        }
      }
    }
  };

  for (const item of (offRequestResult.data ?? []) as Array<{ rider_id: string; off_date: string; status: string }>) {
    addTaken(item.rider_id, String(item.off_date).slice(0, 10), item.status === "APPROVED");
  }
  const riderByCode = new Map(scopedRiders.map((rider) => [rider.rider_code, rider]));
  for (const item of (attendanceResult.data ?? []) as Array<{ rider_id: string | null; rider_code: string; work_date: string }>) {
    const riderId = item.rider_id ?? riderByCode.get(item.rider_code)?.id ?? null;
    if (riderId) addTaken(riderId, String(item.work_date).slice(0, 10), true);
  }

  const scheduleRiders: AutoScheduleRider[] = scopedRiders.map((rider) => {
    const area = offArea(rider);
    return {
      id: rider.id,
      rider_code: rider.rider_code,
      full_name: rider.full_name,
      ward: normalizeWard(area.ward),
      cot: normalizeCot(rider.cot) || null,
      district: area.district,
    };
  });

  const proposal = buildOffAutoScheduleProposal({
    district: intent.district!,
    weekStart: intent.weekStart,
    weekEnd: intent.weekEnd,
    wardScope,
    riders: scheduleRiders,
    riderTakenDates,
    wardTakenDates,
    today: todayInVietnam(),
  });

  const payload = serializeProposal(proposal);
  let actionType = "OFF_AUTO_SCHEDULE";
  let insertResult = await admin
    .from("ai_pending_actions")
    .insert({ user_id: user.id, action_type: actionType, payload })
    .select("id,expires_at");
  if (insertResult.error && isActionTypeConstraintError(insertResult.error)) {
    // Fallback while the ai_pending_actions action_type check has not been widened yet.
    actionType = "OFF_RESCHEDULE";
    insertResult = await admin
      .from("ai_pending_actions")
      .insert({ user_id: user.id, action_type: actionType, payload })
      .select("id,expires_at");
  }
  if (insertResult.error) return NextResponse.json({ success: false, error: insertResult.error.message }, { status: 500 });

  const action = insertResult.data?.[0];
  if (!action) return NextResponse.json({ success: false, error: "Không tạo được action xếp lịch." }, { status: 500 });

  await admin.from("activity_logs").insert({
    entity_type: "ai_off_auto_schedule",
    entity_id: action.id,
    action: "previewed",
    message: `AI auto OFF schedule preview for ${intent.district} ${intent.weekStart}..${intent.weekEnd}`,
    raw_data: { actor_id: user.id, ward_scope: wardScope, assignments: proposal.total_assignments, skipped: proposal.total_skipped },
  });

  return NextResponse.json({
    success: true,
    matched: true,
    proposal: {
      actionId: action.id,
      expiresAt: action.expires_at,
      ...proposal,
    },
  });
}

function serializeProposal(proposal: OffAutoScheduleProposal) {
  return {
    district: proposal.district,
    week_start: proposal.week_start,
    week_end: proposal.week_end,
    ward_scope: proposal.ward_scope,
    wards: proposal.wards,
    total_assignments: proposal.total_assignments,
    total_skipped: proposal.total_skipped,
    already_have_off: proposal.already_have_off,
  };
}

function isActionTypeConstraintError(error: { message?: string; code?: string }) {
  return error.code === "23514" || /check constraint/i.test(error.message ?? "");
}
