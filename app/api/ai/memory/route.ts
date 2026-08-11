import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const preferenceSchema = z.object({
  memoryEnabled: z.boolean(),
});

async function session() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  return user ? { client, user } : null;
}

export async function GET() {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });

  const [preferenceResult, conversationResult] = await Promise.all([
    auth.client
      .from("ai_user_preferences")
      .select("memory_enabled")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    auth.client
      .from("ai_conversations")
      .select("id,title,updated_at")
      .eq("user_id", auth.user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const firstError = preferenceResult.error ?? conversationResult.error;
  if (firstError) return NextResponse.json({ success: false, error: firstError.message }, { status: 500 });

  const conversation = conversationResult.data;
  if (!conversation) {
    return NextResponse.json({
      success: true,
      memoryEnabled: preferenceResult.data?.memory_enabled ?? true,
      conversation: null,
      messages: [],
    });
  }

  const { data: messages, error: messageError } = await auth.client
    .from("ai_messages")
    .select("id,role,content,metadata,created_at")
    .eq("conversation_id", conversation.id)
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (messageError) return NextResponse.json({ success: false, error: messageError.message }, { status: 500 });
  return NextResponse.json({
    success: true,
    memoryEnabled: preferenceResult.data?.memory_enabled ?? true,
    conversation,
    messages: (messages ?? []).reverse(),
  });
}

export async function PATCH(request: Request) {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  const parsed = preferenceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Tùy chọn memory không hợp lệ" }, { status: 400 });

  const { error } = await auth.client.from("ai_user_preferences").upsert({
    user_id: auth.user.id,
    memory_enabled: parsed.data.memoryEnabled,
  });
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, memoryEnabled: parsed.data.memoryEnabled });
}

export async function DELETE() {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });

  const { error } = await auth.client.from("ai_conversations").delete().eq("user_id", auth.user.id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
