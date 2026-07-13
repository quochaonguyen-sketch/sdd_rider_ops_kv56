import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileDailyViolations } from "@/lib/violations/reconcile";
import { canManageOperations } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export async function GET(request: Request) { const secret = process.env.CRON_SECRET; if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }); return run(todayInVietnam()); }
export async function POST(request: Request) { const client = await createClient(); const { data: { user } } = await client.auth.getUser(); if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }); const admin = createAdminClient(); const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle(); if (!canManageOperations(profile?.role)) return NextResponse.json({ success: false, error: "Không có quyền chạy đối soát" }, { status: 403 }); const body = await request.json().catch(() => null) as { work_date?: string } | null; return run(/^\d{4}-\d{2}-\d{2}$/.test(body?.work_date ?? "") ? body!.work_date! : todayInVietnam()); }
async function run(date: string) { try { return NextResponse.json({ success: true, result: await reconcileDailyViolations(date) }); } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Đối soát thất bại" }, { status: 400 }); } }
function todayInVietnam() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
