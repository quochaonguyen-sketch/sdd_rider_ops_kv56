import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth/permissions";
import { computeWardOffConflicts, type ConflictRequest, type ConflictRiderInfo, type WardConflict } from "@/lib/off-schedule/conflicts";

export const dynamic = "force-dynamic";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  status: z.enum(["ALL", "PENDING", "APPROVED", "REJECTED"]).default("ALL"),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    status: url.searchParams.get("status") ?? "ALL",
  });
  if (!parsed.success || parsed.data.from > parsed.data.to) {
    return NextResponse.json({ success: false, error: "Khoảng ngày không hợp lệ." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  let query = admin
    .from("rider_off_requests")
    .select("*")
    .gte("off_date", parsed.data.from)
    .lte("off_date", parsed.data.to)
    .order("off_date")
    .order("created_at");
  if (parsed.data.status !== "ALL") query = query.eq("status", parsed.data.status);

  const { data: requests, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const riderIds = Array.from(new Set((requests ?? []).map((item) => item.rider_id)));
  const { data: riders, error: riderError } = riderIds.length
    ? await admin.from("riders").select("id,full_name,kv,cot,delivery_district,delivery_ward,pickup_district,pickup_ward,current_shift").in("id", riderIds)
    : { data: [], error: null };
  if (riderError) return NextResponse.json({ success: false, error: riderError.message }, { status: 500 });

  const riderById = new Map((riders ?? []).map((rider) => [rider.id, rider]));
  const evidencePaths = Array.from(new Set((requests ?? []).map((item) => item.evidence_path).filter((path): path is string => Boolean(path))));
  const signedEvidence = new Map<string, string>();
  await Promise.all(evidencePaths.map(async (path) => {
    const { data } = await admin.storage.from("off-request-evidence").createSignedUrl(path, 60 * 60);
    if (data?.signedUrl) signedEvidence.set(path, data.signedUrl);
  }));

  let wardConflicts = new Map<string, WardConflict>();
  try {
    ({ wardConflicts } = await computeWardConflicts(admin, parsed.data.from, parsed.data.to, requests ?? [], riderById));
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Không tính được xung đột lịch OFF.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    can_edit: canManageOperations(profile?.role),
    requests: (requests ?? []).map((item) => ({
      ...item,
      evidence_url: item.evidence_path ? signedEvidence.get(item.evidence_path) ?? null : null,
      ward_conflict: wardConflicts.get(item.id) ?? null,
      rider: riderById.get(item.rider_id) ?? null,
    })),
  });
}


async function computeWardConflicts(
  admin: ReturnType<typeof createAdminClient>,
  from: string,
  to: string,
  requests: Array<Record<string, unknown>>,
  requestRidersById: Map<string, ConflictRiderInfo>,
) {
  const OFF_ATTENDANCE_STATUSES = ["OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED"];
  const { data: attendance, error: attendanceError } = await admin
    .from("attendance_logs")
    .select("rider_id,rider_code,work_date")
    .gte("work_date", from)
    .lte("work_date", to)
    .in("status", OFF_ATTENDANCE_STATUSES)
    .limit(3000);
  if (attendanceError) throw new Error(attendanceError.message);

  const missingCodes = Array.from(
    new Set(
      (attendance ?? [])
        .map((row) => (row.rider_id ? null : row.rider_code))
        .filter((code): code is string => Boolean(code)),
    ),
  );
  const extraRiders = missingCodes.length
    ? await admin
        .from("riders")
        .select("id,rider_code,full_name,kv,cot,delivery_district,delivery_ward,pickup_district,pickup_ward,current_shift")
        .in("rider_code", missingCodes)
        .limit(500)
    : { data: [], error: null };
  if (extraRiders.error) throw new Error(extraRiders.error.message);

  const conflictRiderById = new Map<string, ConflictRiderInfo>([...requestRidersById]);
  for (const rider of extraRiders.data ?? []) conflictRiderById.set(rider.id, rider);
  const riderByCode = new Map((extraRiders.data ?? []).map((rider) => [rider.rider_code, rider.id]));

  // Merge requests + attendance OFF rows into one entry set (dedupe by rider+date),
  // so a rider that is off through Google Sheet/attendance still triggers a warning.
  const entries = new Map<string, ConflictRequest>();
  for (const item of requests) {
    if (item.status === "REJECTED") continue;
    entries.set(`${item.rider_id}|${item.off_date}`, {
      id: item.id as string,
      rider_id: item.rider_id as string,
      rider_code: item.rider_code as string,
      off_date: item.off_date as string,
      status: item.status as ConflictRequest["status"],
    });
  }
  for (const row of attendance ?? []) {
    const riderId = (row.rider_id as string | null) ?? riderByCode.get(row.rider_code as string) ?? null;
    if (!riderId || !conflictRiderById.has(riderId)) continue;
    const offDate = String(row.work_date).slice(0, 10);
    const key = `${riderId}|${offDate}`;
    if (entries.has(key)) continue;
    entries.set(key, {
      id: `attendance:${key}`,
      rider_id: riderId,
      rider_code: row.rider_code as string,
      off_date: offDate,
      status: "APPROVED",
    });
  }

  const wardConflicts = computeWardOffConflicts(Array.from(entries.values()), conflictRiderById);
  return { conflictRiderById, wardConflicts };
}
