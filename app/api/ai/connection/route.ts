import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const connectionSchema = z.object({
  baseUrl: z.string().trim().max(500).optional().default(""),
  model: z.string().trim().min(1).max(120).optional().default("qwen3:4b-instruct"),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Bạn cần đăng nhập." }, { status: 401 });

  const parsed = connectionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Cấu hình AI không hợp lệ." }, { status: 400 });

  const configuredUrl = parsed.data.baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const baseUrl = normalizeAiUrl(configuredUrl);
  if (!baseUrl) return NextResponse.json({ success: false, error: "URL phải bắt đầu bằng http:// hoặc https:// và không chứa tài khoản trong URL." }, { status: 400 });

  try {
    const response = await fetch(`${baseUrl}/api/tags`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) return NextResponse.json({ success: false, error: `Máy chủ AI phản hồi lỗi HTTP ${response.status}.` }, { status: 502 });
    const payload = await response.json().catch(() => null) as { models?: Array<{ name?: string; model?: string }> } | null;
    const models = payload?.models?.map((item) => item.model ?? item.name).filter(Boolean) ?? [];
    const hasModel = models.includes(parsed.data.model);
    return NextResponse.json({
      success: true,
      message: hasModel ? `Kết nối thành công, đã tìm thấy model ${parsed.data.model}.` : `Kết nối thành công nhưng chưa tìm thấy model ${parsed.data.model}.`,
      hasModel,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Không kết nối được máy chủ AI. Kiểm tra URL, mạng LAN/VPN và firewall." }, { status: 503 });
  }
}

function normalizeAiUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
