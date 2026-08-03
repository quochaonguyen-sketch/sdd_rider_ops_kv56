import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const connectionSchema = z.object({
  baseUrl: z.string().trim().max(500).optional().default(""),
  model: z.string().trim().min(1).max(120).optional().default("gpt-4.1-mini"),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Bạn cần đăng nhập." }, { status: 401 });

  const parsed = connectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Cấu hình AI không hợp lệ." }, { status: 400 });

  const apiKey = process.env.SHOPAIKEY_API_KEY;
  if (!apiKey) return NextResponse.json({ success: false, error: "Chưa cấu hình SHOPAIKEY_API_KEY trên máy chủ." }, { status: 503 });
  const baseUrl = (process.env.SHOPAIKEY_BASE_URL ?? "https://api.shopaikey.com/v1").replace(/\/$/, "");
  const model = process.env.SHOPAIKEY_MODEL || parsed.data.model;
  if (!baseUrl) return NextResponse.json({ success: false, error: "URL phải bắt đầu bằng http:// hoặc https:// và không chứa tài khoản trong URL." }, { status: 400 });

  try {
    const response = await fetch(`${baseUrl}/models`, {
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return NextResponse.json({ success: false, error: `Máy chủ AI phản hồi lỗi HTTP ${response.status}.` }, { status: 502 });
    const payload = await response.json().catch(() => null) as { data?: Array<{ id?: string }> } | null;
    const models = payload?.data?.map((item) => item.id).filter(Boolean) ?? [];
    const hasModel = models.includes(model);
    return NextResponse.json({
      success: true,
      message: hasModel ? `Kết nối thành công, đã tìm thấy model ${parsed.data.model}.` : `Kết nối thành công nhưng chưa tìm thấy model ${parsed.data.model}.`,
      hasModel,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Không kết nối được máy chủ AI. Kiểm tra URL, mạng LAN/VPN và firewall." }, { status: 503 });
  }
}
