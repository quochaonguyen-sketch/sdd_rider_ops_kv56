import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getDriverPerformance, parsePerformanceFilters } from "@/lib/performance/driver-performance";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const filters = parsePerformanceFilters(new URL(request.url).searchParams);
    const result = await getDriverPerformance(filters);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Không thể tải dữ liệu performance",
      },
      { status: 500 },
    );
  }
}
