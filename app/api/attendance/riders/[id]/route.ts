import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth/permissions";

const idSchema = z.string().uuid();
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

async function getSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { role: profile?.role ?? "viewer", admin };
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const month = new URL(request.url).searchParams.get("month");
  const parsedId = idSchema.safeParse(id);
  const parsedMonth = monthSchema.safeParse(month);

  if (!parsedId.success || !parsedMonth.success) {
    return NextResponse.json({ success: false, error: "Rider hoặc tháng không hợp lệ" }, { status: 400 });
  }

  const { start, end } = monthRange(parsedMonth.data);
  const { data: rider, error: riderError } = await session.admin
    .from("riders")
    .select("*")
    .eq("id", parsedId.data)
    .maybeSingle();

  if (riderError) {
    return NextResponse.json({ success: false, error: riderError.message }, { status: 400 });
  }
  if (!rider) {
    return NextResponse.json({ success: false, error: "Không tìm thấy rider" }, { status: 404 });
  }

  const { data: logs, error: logsError } = await session.admin
    .from("attendance_logs")
    .select("*")
    .eq("rider_code", rider.rider_code)
    .gte("work_date", start)
    .lte("work_date", end)
    .neq("status", "ON")
    .order("work_date");

  if (logsError) {
    return NextResponse.json({ success: false, error: logsError.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    can_edit: canManageOperations(session.role),
    rider,
    logs: logs ?? [],
  });
}
