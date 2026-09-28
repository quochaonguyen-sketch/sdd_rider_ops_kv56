import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth/permissions";
import { LMHUB_COOLDOWN_MS, queueLmhubFetch, readLmhubQueueStatus } from "@/lib/lmhub/fetch-queue";

async function sessionUser() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { admin, role: profile?.role ?? "viewer", user };
}

export async function GET() {
  const session = await sessionUser();
  if (!session) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  try {
    const status = await readLmhubQueueStatus();
    return NextResponse.json({ success: true, queue: "supabase", ...status });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Không đọc được hàng đợi LMHub" }, { status: 400 });
  }
}

export async function POST() {
  const session = await sessionUser();
  if (!session) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManageOperations(session.role)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền fetch tồn LMHub" }, { status: 403 });
  }

  const { data: lastLog } = await session.admin
    .from("activity_logs")
    .select("created_at")
    .eq("entity_type", "lmhub_inventory")
    .eq("action", "queued")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastLog?.created_at && Date.now() - new Date(lastLog.created_at).getTime() < LMHUB_COOLDOWN_MS) {
    const wait = Math.ceil((LMHUB_COOLDOWN_MS - (Date.now() - new Date(lastLog.created_at).getTime())) / 1000);
    return NextResponse.json({
      success: true,
      queued: false,
      cooldown: true,
      retryAfterSec: wait,
      message: `Chống spam: 1 phút chỉ chạy 1 lần. Đợi ${wait}s rồi bấm lại.`,
    });
  }

  try {
    const result = await queueLmhubFetch("WEB Tồn khu vực fetch", session.user.id);
    if (!result.queued) {
      return NextResponse.json({
        success: true,
        queued: false,
        ...result.status,
        message: "Worker đang bận (PENDING/RUNNING trên Supabase). Đợi xong rồi bấm lại.",
      });
    }

    await session.admin.from("activity_logs").insert({
      entity_type: "lmhub_inventory",
      action: "queued",
      message: `Queued LMHub fetch job ${result.jobId}`,
      raw_data: { jobId: result.jobId, queue: "supabase" },
    });

    return NextResponse.json({
      success: true,
      queued: true,
      jobId: result.jobId,
      queue: "supabase",
      ...result.status,
      message: "Đã đẩy việc vào hàng đợi Supabase. Worker sẽ nhận job và ghi snapshot mới.",
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Không đẩy được hàng đợi LMHub" }, { status: 400 });
  }
}
