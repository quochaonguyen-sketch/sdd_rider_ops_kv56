import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReturnOrders, parseReturnOrderFilters } from "@/lib/return-orders/return-orders";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  try {
    const result = await getReturnOrders(parseReturnOrderFilters(new URL(request.url).searchParams));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Không thể tải đơn hàng trả" },
      { status: 500 },
    );
  }
}
