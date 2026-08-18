import { NextResponse } from "next/server";
import { processAttendanceSheetSync } from "@/lib/google/attendance-sheet-sync";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await processAttendanceSheetSync());
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Không thể chạy đồng bộ lịch" }, { status: 500 });
  }
}
