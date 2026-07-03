import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const roleSchema = z.enum(["admin", "leader", "viewer", "member"]);
const createMemberSchema = z.object({
  email: z.email("Email không hợp lệ").trim().toLowerCase(),
  full_name: z.string().trim().min(2, "Họ tên cần ít nhất 2 ký tự").max(100),
  password: z.string().min(8, "Mật khẩu tạm cần ít nhất 8 ký tự").max(72),
  role: roleSchema,
});
const updateMemberSchema = z.object({
  id: z.string().uuid(),
  role: roleSchema,
});

async function getAdminSession() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { error: NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 }) };

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ success: false, error: "Chỉ admin được quản lý thành viên" }, { status: 403 }) };
  }
  return { admin, user };
}

export async function GET() {
  const session = await getAdminSession();
  if ("error" in session) return session.error;

  const [{ data: profiles, error: profileError }, authResult] = await Promise.all([
    session.admin.from("profiles").select("id,email,full_name,role,created_at,updated_at").order("created_at"),
    session.admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const error = profileError ?? authResult.error;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  const authById = new Map(authResult.data.users.map((user) => [user.id, user]));
  const members = (profiles ?? []).map((profile) => ({
    ...profile,
    email: profile.email ?? authById.get(profile.id)?.email ?? "",
    last_sign_in_at: authById.get(profile.id)?.last_sign_in_at ?? null,
    is_current_user: profile.id === session.user.id,
  }));
  return NextResponse.json({ success: true, members });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if ("error" in session) return session.error;
  const parsed = createMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { email, full_name, password, role } = parsed.data;
  const { data: created, error: createError } = await session.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (createError || !created.user) {
    return NextResponse.json({ success: false, error: createError?.message ?? "Không thể tạo tài khoản" }, { status: 400 });
  }

  const { error: profileError } = await session.admin.from("profiles").upsert({
    id: created.user.id,
    email,
    full_name,
    role,
  });
  if (profileError) {
    await session.admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ success: false, error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, message: `Đã tạo tài khoản ${email}` }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if ("error" in session) return session.error;
  const parsed = updateMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  if (parsed.data.id === session.user.id && parsed.data.role !== "admin") {
    return NextResponse.json({ success: false, error: "Bạn không thể tự hạ quyền admin của mình" }, { status: 400 });
  }

  const { data, error } = await session.admin
    .from("profiles")
    .update({ role: parsed.data.role, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, error: error?.message ?? "Không tìm thấy thành viên" }, { status: 400 });
  return NextResponse.json({ success: true });
}
