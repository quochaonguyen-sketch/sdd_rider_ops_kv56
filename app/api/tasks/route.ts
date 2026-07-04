import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
  assignee_id: z.string().uuid(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  due_at: z.iso.datetime().optional().nullable(),
});
const updateSchema = z.object({ id: z.string().uuid(), status: z.enum(["TODO", "IN_PROGRESS", "DONE"]) });

async function session() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("id,role").eq("id", user.id).maybeSingle();
  if (!profile) return null;
  return { admin, user, role: profile.role as string };
}

const taskSelect = "id,title,description,priority,status,due_at,completed_at,created_at,updated_at,assignee_id,created_by,assignee:profiles!member_tasks_assignee_id_fkey(id,full_name,email,role),creator:profiles!member_tasks_created_by_fkey(id,full_name,email)";

export async function GET() {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  const canCreate = auth.role === "admin" || auth.role === "leader";
  let query = auth.admin.from("member_tasks").select(taskSelect).order("status").order("due_at", { ascending: true, nullsFirst: false }).limit(300);
  if (auth.role === "leader") query = query.eq("created_by", auth.user.id);
  else if (auth.role !== "admin") query = query.eq("assignee_id", auth.user.id);

  const [taskResult, memberResult] = await Promise.all([
    query,
    canCreate ? auth.admin.from("profiles").select("id,full_name,email,role").eq("role", "member").order("full_name") : Promise.resolve({ data: [], error: null }),
  ]);
  const error = taskResult.error ?? memberResult.error;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, tasks: taskResult.data ?? [], members: memberResult.data ?? [], can_create: canCreate, current_user_id: auth.user.id });
}

export async function POST(request: Request) {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (auth.role !== "admin" && auth.role !== "leader") return NextResponse.json({ success: false, error: "Chỉ Leader hoặc Admin được giao task" }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Thông tin task không hợp lệ" }, { status: 400 });
  const { data: member } = await auth.admin.from("profiles").select("id,role").eq("id", parsed.data.assignee_id).maybeSingle();
  if (member?.role !== "member") return NextResponse.json({ success: false, error: "Task chỉ được giao cho tài khoản Member" }, { status: 400 });
  const { data, error } = await auth.admin.from("member_tasks").insert({ ...parsed.data, description: parsed.data.description || null, created_by: auth.user.id }).select(taskSelect).single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, task: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Trạng thái không hợp lệ" }, { status: 400 });
  const { data: task } = await auth.admin.from("member_tasks").select("id,assignee_id,created_by").eq("id", parsed.data.id).maybeSingle();
  const allowed = task && (auth.role === "admin" || task.created_by === auth.user.id || task.assignee_id === auth.user.id);
  if (!allowed) return NextResponse.json({ success: false, error: "Bạn không có quyền cập nhật task này" }, { status: 403 });
  const { data, error } = await auth.admin.from("member_tasks").update({ status: parsed.data.status, completed_at: parsed.data.status === "DONE" ? new Date().toISOString() : null }).eq("id", parsed.data.id).select(taskSelect).single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, task: data });
}
