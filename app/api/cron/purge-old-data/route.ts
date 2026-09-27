import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DEFAULT_RETENTION = "1 month";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

// Keeps only the last retention window (default 1 month) of the high-volume
// operational tables and deletes everything older. Runs as a single set-based
// Postgres pass via the purge_operational_data() RPC.
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const retention = new URL(request.url).searchParams.get("retention") ?? DEFAULT_RETENTION;
  if (!/^\d+\s+(day|week|month|year)s?$/.test(retention)) {
    return NextResponse.json({ success: false, error: "Retention must look like '1 month'" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("purge_operational_data", { p_retention_interval: retention });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, deleted: data ?? {} });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Không thể dọn dữ liệu cũ" },
      { status: 500 },
    );
  }
}
