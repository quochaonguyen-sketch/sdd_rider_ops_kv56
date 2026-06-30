import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isCot1(value: string | null) {
  return /\bcot\s*1\b/i.test(value ?? "") || value?.trim() === "1";
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const workDate = new URL(request.url).searchParams.get("date") ?? "";
  if (!datePattern.test(workDate)) {
    return NextResponse.json({ success: false, error: "Ngày không hợp lệ" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [riderResult, assignmentResult, attendanceResult, absenceNoteResult] = await Promise.all([
    admin
      .from("riders")
      .select("id,rider_code,full_name,kv,cot,pickup_district,pickup_ward,status")
      .eq("status", "active")
      .order("rider_code"),
    admin.from("morning_delivery_assignments").select("rider_id").eq("work_date", workDate),
    admin.from("attendance_logs").select("rider_id,rider_code,status,note").eq("work_date", workDate),
    admin
      .from("morning_delivery_absence_notes")
      .select("rider_id,reason,is_excused")
      .eq("work_date", workDate),
  ]);

  const error = riderResult.error ?? assignmentResult.error ?? attendanceResult.error ?? absenceNoteResult.error;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  const assignedRiderIds = new Set((assignmentResult.data ?? []).map((item) => item.rider_id));
  const attendanceByRider = new Map<string, { status: string; note: string | null }>();
  for (const log of attendanceResult.data ?? []) {
    if (log.rider_id) attendanceByRider.set(log.rider_id, log);
    attendanceByRider.set(log.rider_code, log);
  }
  const absenceByRider = new Map((absenceNoteResult.data ?? []).map((item) => [item.rider_id, item]));
  const absentRiders = (riderResult.data ?? []).filter(
    (rider) =>
      isCot1(rider.cot) &&
      !rider.pickup_district?.trim() &&
      !rider.pickup_ward?.trim() &&
      !assignedRiderIds.has(rider.id),
  );

  const rows = absentRiders.map((rider, index) => {
    const attendance = attendanceByRider.get(rider.id) ?? attendanceByRider.get(rider.rider_code);
    const absence = absenceByRider.get(rider.id);
    return [
      index + 1,
      rider.rider_code,
      rider.full_name ?? "",
      rider.kv ?? "",
      rider.cot ?? "",
      attendance?.status ?? "Chưa điểm danh",
      attendance?.note ?? "",
      absence?.reason ?? "",
      absence?.is_excused ? "Có" : "Không",
    ];
  });

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["STT", "Rider ID", "Tên rider", "KV", "COT", "Trạng thái", "Ghi chú lịch OFF", "Lý do không lên lấy hàng", "Có phép"],
    ...rows,
  ]);
  sheet["!cols"] = [
    { wch: 7 },
    { wch: 16 },
    { wch: 28 },
    { wch: 12 },
    { wch: 12 },
    { wch: 20 },
    { wch: 32 },
    { wch: 40 },
    { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, "Chua diem danh");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rider-chua-diem-danh-${workDate}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
