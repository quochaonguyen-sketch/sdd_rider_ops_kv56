import { NextResponse } from "next/server";
import { z } from "zod";
import { getCachedPersonalNotes, invalidateNotesCache } from "@/lib/cache/operations-cache";
import { createClient } from "@/lib/supabase/server";

const noteSchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().max(10000).optional().default(""),
  is_pinned: z.boolean().optional().default(false),
});

async function session() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  return user ? { client, user } : null;
}

export async function GET() {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });

  const { data, error, cache } = await getCachedPersonalNotes(auth.user.id, async () =>
    await auth.client
      .from("personal_notes")
      .select("id,title,content,is_pinned,status,created_at,updated_at")
      .order("is_pinned", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(300),
  );

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  return NextResponse.json({ success: true, notes: data ?? [], cache });
}

export async function POST(request: Request) {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });

  const parsed = noteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Nội dung note không hợp lệ" }, { status: 400 });

  const { data, error } = await auth.client
    .from("personal_notes")
    .insert({ ...parsed.data, user_id: auth.user.id })
    .select("id,title,content,is_pinned,status,created_at,updated_at")
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  invalidateNotesCache(auth.user.id);
  return NextResponse.json({ success: true, note: data }, { status: 201 });
}
