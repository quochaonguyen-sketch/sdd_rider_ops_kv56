import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { defaultPermissionsForRole, normalizePermissions, type MemberPermissions } from "@/lib/auth/permissions";

const roleSchema = z.enum(["admin", "leader", "viewer", "member"]);
const permissionsSchema = z.record(z.string(), z.boolean());
const createMemberSchema = z.object({
  email: z.email("Email không hợp lệ").trim().toLowerCase(),
  full_name: z.string().trim().min(2, "Họ tên cần ít nhất 2 ký tự").max(100),
  role: roleSchema,
  permissions: permissionsSchema.optional(),
});
const updateMemberSchema = z.object({
  id: z.string().uuid(),
  role: roleSchema.optional(),
  permissions: permissionsSchema.optional(),
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

function permissionsFor(role: string, overrides?: Partial<MemberPermissions> | null, stored?: unknown) {
  return normalizePermissions({ ...defaultPermissionsForRole(role), ...(typeof stored === "object" && stored ? stored : {}), ...(overrides ?? {}) }, role);
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
  const members = (profiles ?? []).map((profile) => {
    const authUser = authById.get(profile.id);
    return {
      ...profile,
      email: profile.email ?? authUser?.email ?? "",
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
      is_current_user: profile.id === session.user.id,
      permissions: permissionsFor(profile.role, null, authUser?.app_metadata?.permissions),
    };
  });
  return NextResponse.json({ success: true, members });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if ("error" in session) return session.error;
  const parsed = createMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  const { email, full_name, role } = parsed.data;
  if (!email.endsWith("@spxexpress.com")) {
    return NextResponse.json({ success: false, error: "Chỉ thêm email @spxexpress.com" }, { status: 400 });
  }

  const permissions = permissionsFor(role, parsed.data.permissions);
  const { data: existingProfile } = await session.admin.from("profiles").select("id,email").eq("email", email).maybeSingle();
  if (existingProfile) {
    return NextResponse.json({ success: false, error: "Email này đã nằm trong danh sách thành viên" }, { status: 400 });
  }

  const { data: created, error: createError } = await session.admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name },
    app_metadata: { permissions },
  });

  let userId = created.user?.id;
  if (createError || !userId) {
    const listed = await session.admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existingAuth = listed.data.users.find((user) => user.email?.toLowerCase() === email);
    if (!existingAuth) {
      return NextResponse.json({ success: false, error: createError?.message ?? "Không thể thêm thành viên" }, { status: 400 });
    }
    userId = existingAuth.id;
    await session.admin.auth.admin.updateUserById(userId, {
      user_metadata: { full_name },
      app_metadata: { ...existingAuth.app_metadata, permissions },
    });
  }

  const { error: profileError } = await session.admin.from("profiles").upsert({
    id: userId,
    email,
    full_name,
    role,
  });
  if (profileError) {
    return NextResponse.json({ success: false, error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, message: `Đã cho phép ${email} đăng nhập Google` }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if ("error" in session) return session.error;
  const parsed = updateMemberSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Dữ liệu không hợp lệ" }, { status: 400 });
  if (parsed.data.id === session.user.id && parsed.data.role && parsed.data.role !== "admin") {
    return NextResponse.json({ success: false, error: "Bạn không thể tự hạ quyền admin của mình" }, { status: 400 });
  }

  const { data: current } = await session.admin.from("profiles").select("id,role").eq("id", parsed.data.id).maybeSingle();
  if (!current) return NextResponse.json({ success: false, error: "Không tìm thấy thành viên" }, { status: 400 });

  const nextRole = parsed.data.role ?? current.role;
  const { data: authUser } = await session.admin.auth.admin.getUserById(parsed.data.id);
  const permissions = permissionsFor(nextRole, parsed.data.permissions, authUser.user?.app_metadata?.permissions);

  const { data, error } = await session.admin
    .from("profiles")
    .update({ role: nextRole, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ success: false, error: error?.message ?? "Không tìm thấy thành viên" }, { status: 400 });

  if (authUser.user) {
    await session.admin.auth.admin.updateUserById(parsed.data.id, {
      app_metadata: { ...authUser.user.app_metadata, permissions },
    });
  }

  return NextResponse.json({ success: true, permissions });
}
