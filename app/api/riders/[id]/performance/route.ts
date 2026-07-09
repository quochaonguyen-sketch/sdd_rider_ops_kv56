import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.string().uuid();

async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { admin: createAdminClient() };
}

function readDays(request: Request) {
  const raw = new URL(request.url).searchParams.get("days");
  const parsed = Number(raw ?? 45);
  if (!Number.isFinite(parsed)) return 45;
  return Math.min(180, Math.max(7, Math.trunc(parsed)));
}

function sinceDate(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ success: false, error: "Rider không hợp lệ" }, { status: 400 });
  }

  const { data: rider, error: riderError } = await session.admin
    .from("riders")
    .select("id,rider_code,full_name")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (riderError) {
    return NextResponse.json({ success: false, error: riderError.message }, { status: 400 });
  }
  if (!rider) {
    return NextResponse.json({ success: false, error: "Không tìm thấy rider" }, { status: 404 });
  }

  const days = readDays(request);
  const { data, error } = await session.admin
    .from("driver_performance_daily")
    .select("*")
    .eq("driver_id", rider.rider_code)
    .gte("report_date", sinceDate(days))
    .order("report_date", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    rider,
    days,
    performance: data ?? [],
  });
}
