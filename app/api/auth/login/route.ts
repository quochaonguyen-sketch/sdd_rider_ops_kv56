import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    success: false,
    error: "Hệ thống chỉ đăng nhập bằng Google. Không dùng email/mật khẩu.",
  }, { status: 403 });
}
