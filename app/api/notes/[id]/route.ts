import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  content: z.string().trim().max(10000).optional(),
  is_pinned: z.boolean().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
}).refine((value) => Object.keys(value).length > 0);

async function session() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  return user ? { client, user } : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ success: false, error: "ID note không hợp lệ" }, { status: 400 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Nội dung note không hợp lệ" }, { status: 400 });
  const { data, error } = await auth.client
    .from("personal_notes")
    .update(parsed.data)
    .eq("id", id)
    .select("id,title,content,is_pinned,status,created_at,updated_at")
    .maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ success: false, error: "Không tìm thấy note" }, { status: 404 });
  return NextResponse.json({ success: true, note: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await session();
  if (!auth) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ success: false, error: "ID note không hợp lệ" }, { status: 400 });
  const { data, error } = await auth.client.from("personal_notes").delete().eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ success: false, error: "Không tìm thấy note" }, { status: 404 });
  return NextResponse.json({ success: true, id });
}
