import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ScheduleStatus =
  | ""
  | "ON"
  | "OFF_WEEKLY"
  | "OFF_APPROVED"
  | "OFF_UNEXPECTED"
  | "WORKING_REST_DAY"
  | "NO_PICKUP";

type DateColumn = {
  column: number;
  date: string;
  label: string;
};

type ImportUpdate = {
  row: number;
  rider_code: string;
  full_name: string | null;
  work_date: string;
  status: ScheduleStatus;
};

type ImportIssue = {
  row: number;
  rider_code?: string;
  date?: string;
  error: string;
};

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cellText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeStatus(value: unknown): ScheduleStatus | null {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (["on", "lam", "di lam", "work", "working"].includes(normalized)) return "ON";
  if (["off", "off tuan", "nghi", "nghi tuan"].includes(normalized)) return "OFF_WEEKLY";
  if (["off phep", "off co phep", "off co xin phep", "nghi phep", "nghi co phep", "phep", "approved"].includes(normalized)) {
    return "OFF_APPROVED";
  }
  if (["off dot xuat", "nghi dot xuat", "dot xuat", "unexpected"].includes(normalized)) {
    return "OFF_UNEXPECTED";
  }
  if (["off nhung khong off", "off nhung van di lam", "di lam ngay off"].includes(normalized)) {
    return "WORKING_REST_DAY";
  }
  if (["khong di pick", "khong pick", "no pickup", "no pick"].includes(normalized)) return "NO_PICKUP";
  if (["xoa", "clear", "chua xep", "chua co lich"].includes(normalized)) return "";
  return null;
}

function formatDate(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() + 1 !== month ||
    value.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateHeader(value: unknown, selectedMonth: string) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return formatDate(parsed.y, parsed.m, parsed.d);
  }

  const text = String(value ?? "").trim();
  const fullDate = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (fullDate) return formatDate(Number(fullDate[1]), Number(fullDate[2]), Number(fullDate[3]));

  const vietnameseDate = text.match(/(\d{1,2})[-/](\d{1,2})(?:[-/](\d{4}))?/);
  if (vietnameseDate) {
    const [selectedYear] = selectedMonth.split("-").map(Number);
    return formatDate(
      vietnameseDate[3] ? Number(vietnameseDate[3]) : selectedYear,
      Number(vietnameseDate[2]),
      Number(vietnameseDate[1]),
    );
  }

  return null;
}

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

function parseSheet(sheet: XLSX.WorkSheet, selectedMonth: string) {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  const headerIndex = grid.findIndex((row) =>
    row.some((cell) => ["id", "rider id", "rider code"].includes(normalizeText(cell))),
  );
  const issues: ImportIssue[] = [];

  if (headerIndex === -1) {
    return {
      updates: [] as ImportUpdate[],
      issues: [{ row: 1, error: "Không tìm thấy cột ID" }],
    };
  }

  const headers = grid[headerIndex];
  const idColumn = headers.findIndex((cell) =>
    ["id", "rider id", "rider code"].includes(normalizeText(cell)),
  );
  const nameColumn = headers.findIndex((cell) =>
    ["ten", "ho ten", "ho va ten", "fullname", "full name"].includes(normalizeText(cell)),
  );
  const dateColumns: DateColumn[] = [];
  const seenDates = new Set<string>();

  headers.forEach((header, column) => {
    if (column === idColumn || column === nameColumn || !cellText(header)) return;
    const date = parseDateHeader(header, selectedMonth);
    if (!date) return;
    if (!date.startsWith(`${selectedMonth}-`)) {
      issues.push({
        row: headerIndex + 1,
        date,
        error: `Cột ngày ${date} không thuộc tháng ${selectedMonth}`,
      });
      return;
    }
    if (seenDates.has(date)) {
      issues.push({ row: headerIndex + 1, date, error: `Ngày ${date} bị trùng cột` });
      return;
    }
    seenDates.add(date);
    dateColumns.push({ column, date, label: String(header) });
  });

  if (dateColumns.length === 0) {
    issues.push({
      row: headerIndex + 1,
      error: "Không tìm thấy cột ngày. Dùng định dạng YYYY-MM-DD hoặc DD/MM/YYYY",
    });
  }

  const updates: ImportUpdate[] = [];
  const codeRows = new Map<string, number[]>();

  for (let index = headerIndex + 1; index < grid.length; index += 1) {
    const source = grid[index];
    if (!source.some((cell) => cellText(cell))) continue;

    const row = index + 1;
    const riderCode = cellText(source[idColumn]) ?? "";
    const fullName = nameColumn >= 0 ? cellText(source[nameColumn]) : null;

    if (!riderCode) {
      issues.push({ row, error: "Thiếu ID rider" });
      continue;
    }

    codeRows.set(riderCode, [...(codeRows.get(riderCode) ?? []), row]);

    for (const dateColumn of dateColumns) {
      const rawValue = source[dateColumn.column];
      if (!cellText(rawValue)) continue;
      const status = normalizeStatus(rawValue);
      if (status === null) {
        issues.push({
          row,
          rider_code: riderCode,
          date: dateColumn.date,
          error: `Trạng thái "${cellText(rawValue)}" không hợp lệ`,
        });
        continue;
      }
      updates.push({
        row,
        rider_code: riderCode,
        full_name: fullName,
        work_date: dateColumn.date,
        status,
      });
    }
  }

  for (const [riderCode, rows] of codeRows) {
    if (rows.length > 1) {
      rows.forEach((row) =>
        issues.push({
          row,
          rider_code: riderCode,
          error: `ID trùng trong file tại các dòng ${rows.join(", ")}`,
        }),
      );
    }
  }

  return { updates, issues };
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "leader") {
    return NextResponse.json({ success: false, error: "Bạn không có quyền tải file lịch" }, { status: 403 });
  }

  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!monthPattern.test(month)) {
    return NextResponse.json({ success: false, error: "Tháng không hợp lệ" }, { status: 400 });
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const dateHeaders = Array.from(
    { length: dayCount },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  );
  const { data: riders, error } = await session.admin
    .from("riders")
    .select("rider_code,full_name")
    .eq("status", "active")
    .order("kv")
    .order("cot")
    .order("full_name");

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }

  const workbook = XLSX.utils.book_new();
  const scheduleSheet = XLSX.utils.aoa_to_sheet([
    ["ID", "Tên", ...dateHeaders],
    ...(riders ?? []).map((rider) => [rider.rider_code, rider.full_name ?? "", ...dateHeaders.map(() => "")]),
  ]);
  scheduleSheet["!cols"] = [
    { wch: 14 },
    { wch: 28 },
    ...dateHeaders.map(() => ({ wch: 14 })),
  ];
  XLSX.utils.book_append_sheet(workbook, scheduleSheet, "Lich rider");

  const guideSheet = XLSX.utils.aoa_to_sheet([
    ["Giá trị", "Ý nghĩa"],
    ["ON", "Đi làm"],
    ["OFF hoặc OFF tuần", "Nghỉ tuần"],
    ["OFF phép", "Nghỉ có phép"],
    ["OFF đột xuất", "Nghỉ đột xuất"],
    ["OFF nhưng không OFF", "Vẫn đi làm trong ngày OFF"],
    ["Không đi pick", "Đi làm nhưng không chạy pickup"],
    ["XÓA hoặc CHƯA XẾP", "Xóa lịch của ngày đó"],
    ["Ô trống", "Giữ nguyên dữ liệu hiện tại"],
  ]);
  guideSheet["!cols"] = [{ wch: 22 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(workbook, guideSheet, "Huong dan");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="lich-rider-${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin" && session.role !== "leader") {
    return NextResponse.json({ success: false, error: "Bạn không có quyền import lịch rider" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const month = String(formData.get("month") ?? "");

  if (!monthPattern.test(month)) {
    return NextResponse.json({ success: false, error: "Tháng không hợp lệ" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "Vui lòng chọn file Excel" }, { status: 400 });
  }
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    return NextResponse.json({ success: false, error: "Chỉ hỗ trợ file .xlsx hoặc .xls" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ success: false, error: "File Excel tối đa 10 MB" }, { status: 400 });
  }

  let workbook: XLSX.WorkBook;
  try {
    // Keep Excel dates as serial numbers. Converting them to JS Date here can
    // shift a displayed date to the previous day because of server timezone
    // and floating-point time fractions (for example 01/07 -> 30/06 23:59:30).
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  } catch {
    return NextResponse.json({ success: false, error: "Không đọc được file Excel" }, { status: 400 });
  }

  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) {
    return NextResponse.json({ success: false, error: "File Excel không có sheet dữ liệu" }, { status: 400 });
  }

  const parsed = parseSheet(firstSheet, month);
  const issues = [...parsed.issues];
  const uniqueCodes = Array.from(new Set(parsed.updates.map((item) => item.rider_code)));
  const ridersByCode = new Map<string, { id: string; rider_code: string }>();

  for (let index = 0; index < uniqueCodes.length; index += 500) {
    const { data, error } = await session.admin
      .from("riders")
      .select("id,rider_code")
      .in("rider_code", uniqueCodes.slice(index, index + 500));
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    data?.forEach((rider) => ridersByCode.set(rider.rider_code, rider));
  }

  const missingCodes = uniqueCodes.filter((riderCode) => !ridersByCode.has(riderCode));
  for (const riderCode of missingCodes) {
    const rows = Array.from(
      new Set(parsed.updates.filter((item) => item.rider_code === riderCode).map((item) => item.row)),
    );
    rows.forEach((row) =>
      issues.push({ row, rider_code: riderCode, error: "ID không tồn tại trong hệ thống" }),
    );
  }

  const sortedIssues = issues.sort((a, b) => a.row - b.row || (a.date ?? "").localeCompare(b.date ?? ""));
  const blockedRows = new Set(
    sortedIssues
      .filter((issue) => !issue.date && issue.rider_code)
      .map((issue) => `${issue.row}:${issue.rider_code}`),
  );
  const validUpdates = parsed.updates.filter(
    (item) => ridersByCode.has(item.rider_code) && !blockedRows.has(`${item.row}:${item.rider_code}`),
  );

  if (validUpdates.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: sortedIssues.length > 0 ? `File có ${sortedIssues.length} lỗi, không có dữ liệu hợp lệ để import` : "Không có ô lịch nào để import",
        errors: sortedIssues,
      },
      { status: sortedIssues.length > 0 ? 409 : 400 },
    );
  }

  const clearItems = validUpdates.filter((item) => !item.status || item.status === "ON");
  const upsertItems = validUpdates
    .filter((item) => item.status && item.status !== "ON")
    .map((item) => {
      const rider = ridersByCode.get(item.rider_code)!;
      return {
        rider_id: rider.id,
        rider_code: rider.rider_code,
        work_date: item.work_date,
        status: item.status,
        raw_data: {
          source: "schedule_excel",
          source_file: file.name,
          excel_row: item.row,
          imported_name: item.full_name,
        },
      };
    });

  for (let index = 0; index < upsertItems.length; index += 500) {
    const { error } = await session.admin
      .from("attendance_logs")
      .upsert(upsertItems.slice(index, index + 500), { onConflict: "rider_code,work_date" });
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
  }

  const clearCodesByDate = new Map<string, Set<string>>();
  for (const item of clearItems) {
    const codes = clearCodesByDate.get(item.work_date) ?? new Set<string>();
    codes.add(item.rider_code);
    clearCodesByDate.set(item.work_date, codes);
  }

  const deleteJobs = Array.from(clearCodesByDate, ([workDate, codes]) => {
    const riderCodes = Array.from(codes);
    return Array.from({ length: Math.ceil(riderCodes.length / 500) }, (_, index) => ({
      workDate,
      riderCodes: riderCodes.slice(index * 500, (index + 1) * 500),
    }));
  }).flat();

  for (let index = 0; index < deleteJobs.length; index += 6) {
    const results = await Promise.all(
      deleteJobs.slice(index, index + 6).map((job) =>
        session.admin
          .from("attendance_logs")
          .delete()
          .eq("work_date", job.workDate)
          .in("rider_code", job.riderCodes),
      ),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      return NextResponse.json({ success: false, error: failed.error.message }, { status: 400 });
    }
  }

  await session.admin.from("activity_logs").insert({
    entity_type: "attendance_schedule",
    action: "imported",
    message: `Imported ${validUpdates.length} schedule cells from ${file.name}`,
    raw_data: {
      source_file: file.name,
      month,
      cells: validUpdates.length,
      riders: uniqueCodes.length,
      skipped_errors: sortedIssues.length,
    },
  });

  return NextResponse.json({
    success: true,
    imported: upsertItems.length,
    cleared: clearItems.length,
    riders: new Set(validUpdates.map((item) => item.rider_code)).size,
    errors: sortedIssues,
    skipped: sortedIssues.length,
  });
}
