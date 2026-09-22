import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Email hoặc mật khẩu không hợp lệ" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 401 });
  }

  if (!data.user?.email?.toLowerCase().endsWith("@spxexpress.com")) {
    await supabase.auth.signOut();
    return NextResponse.json({ success: false, error: "Chỉ tài khoản @spxexpress.com mới được phép truy cập" }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
