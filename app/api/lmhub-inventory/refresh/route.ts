import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth/permissions";
import { LMHUB_COOLDOWN_MS, normalizeLmhubKind, queueLmhubFetch, readLmhubQueueStatus } from "@/lib/lmhub/fetch-queue";

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

export async function POST(request: Request) {
  const session = await sessionUser();
  if (!session) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManageOperations(session.role)) {
    return NextResponse.json({ success: false, error: "Bạn không có quyền fetch tồn LMHub" }, { status: 403 });
  }

  let requestedKind = "delivery";
  try {
    const body = await request.json().catch(() => null) as { kind?: string } | null;
    if (body?.kind) requestedKind = body.kind;
  } catch {
    requestedKind = "delivery";
  }
  const kind = normalizeLmhubKind(requestedKind);

  const { data: lastLog } = await session.admin
    .from("activity_logs")
    .select("created_at")
    .eq("entity_type", "lmhub_inventory")
    .eq("action", "queued")
    .contains("raw_data", { kind })
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
      message: `Chống spam: 1 phút chỉ chạy 1 lần cùng loại. Đợi ${wait}s rồi bấm lại.`,
    });
  }

  try {
    const label = kind === "pickup" ? "WEB Tồn pickup fetch" : kind === "all" ? "WEB Tồn pickup+delivery fetch" : "WEB Tồn delivery fetch";
    const result = await queueLmhubFetch(label, session.user.id, kind);
    if (!result.queued) {
      return NextResponse.json({
        success: true,
        queued: false,
        kind,
        ...result.status,
        message: result.message ?? "Job cùng loại đã nằm trong hàng đợi. Worker sẽ chạy tuần tự.",
      });
    }

    await session.admin.from("activity_logs").insert({
      entity_type: "lmhub_inventory",
      action: "queued",
      message: `Queued ${kind} job ${result.jobId}`,
      raw_data: { jobId: result.jobId, queue: "supabase", kind },
    });

    return NextResponse.json({
      success: true,
      queued: true,
      kind,
      jobId: result.jobId,
      queue: "supabase",
      ...result.status,
      message:
        kind === "pickup"
          ? "Đã xếp tồn pickup vào hàng đợi chung. Nếu đang chạy tồn delivery thì job này đợi."
          : kind === "all"
            ? "Đã xếp tồn pickup + delivery vào hàng đợi chung."
            : "Đã xếp tồn delivery vào hàng đợi chung. Nếu đang chạy tồn pickup thì job này đợi.",
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Không đẩy được hàng đợi LMHub" }, { status: 400 });
  }
}
