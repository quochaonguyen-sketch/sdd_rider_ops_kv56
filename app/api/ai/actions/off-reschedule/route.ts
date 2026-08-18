import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageOperations } from "@/lib/auth/permissions";
import { invalidateAttendanceCache } from "@/lib/cache/operations-cache";
import { processAttendanceSheetSync } from "@/lib/google/attendance-sheet-sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const actionSchema = z.object({ actionId: z.string().uuid() });

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
  if (!auth.canManage) return NextResponse.json({ success: false, error: "Account không có quyền chỉnh lịch OFF." }, { status: 403 });
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Action không hợp lệ" }, { status: 400 });

  const { data: pending, error: pendingError } = await auth.admin
    .from("ai_pending_actions")
    .select("payload,status")
    .eq("id", parsed.data.actionId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (pendingError) return NextResponse.json({ success: false, error: pendingError.message }, { status: 500 });
  if (!pending || pending.status !== "PENDING") return NextResponse.json({ success: false, error: "Action không còn chờ xác nhận." }, { status: 409 });

  const { data, error } = await auth.admin.rpc("execute_ai_off_reschedule", {
    p_action_id: parsed.data.actionId,
    p_actor_id: auth.user.id,
  });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 409 });

  const payload = pending.payload as {
    rider_code: string;
    rider_name: string | null;
    from_date: string;
    to_date: string;
    off_status: string;
  };
  const sheetSync = await processAttendanceSheetSync();
  invalidateAttendanceCache(payload.from_date.slice(0, 7));
  invalidateAttendanceCache(payload.to_date.slice(0, 7));
  await auth.admin.from("activity_logs").insert({
    entity_type: "ai_off_reschedule",
    entity_id: parsed.data.actionId,
    action: sheetSync.success ? "sheet_synced" : "sheet_sync_failed",
    message: sheetSync.success ? "AI OFF reschedule synced to Google Sheet" : "AI OFF reschedule needs Google Sheet retry",
    raw_data: { actor_id: auth.user.id, sheet_sync: sheetSync },
  });
  return NextResponse.json({ success: true, result: data, sheet_sync: sheetSync });
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
