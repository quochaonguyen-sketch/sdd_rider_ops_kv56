import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ImportRow = {
  row: number;
  kv: string | null;
  home_district: string | null;
  cot: string | null;
  rider_code: string;
  full_name: string | null;
  pickup_district: string | null;
  pickup_ward: string | null;
  point_name: string | null;
  delivery_district: string | null;
  delivery_ward: string | null;
  status: "active" | "inactive";
};

type ImportError = {
  row: number;
  rider_code?: string;
  error: string;
};

const headerAliases: Record<string, keyof Omit<ImportRow, "row">> = {
  kv: "kv",
  "quan o": "home_district",
  cot: "cot",
  id: "rider_code",
  "rider id": "rider_code",
  "rider code": "rider_code",
  fullname: "full_name",
  "full name": "full_name",
  "quan lay": "pickup_district",
  "phuong lay": "pickup_ward",
  "point name": "point_name",
  pointname: "point_name",
  "quan giao": "delivery_district",
  "phuong giao": "delivery_ward",
  status: "status",
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cellText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function parseRows(sheet: XLSX.WorkSheet) {
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  const headerIndex = grid.findIndex((row) => row.some((cell) => normalizeHeader(cell) === "id"));

  if (headerIndex === -1) {
    return { rows: [] as ImportRow[], errors: [{ row: 1, error: "Không tìm thấy cột ID" }] as ImportError[] };
  }

  const headers = grid[headerIndex].map((header) => headerAliases[normalizeHeader(header)]);
  const rows: ImportRow[] = [];
  const errors: ImportError[] = [];

  for (let index = headerIndex + 1; index < grid.length; index += 1) {
    const source = grid[index];
    if (!source.some((cell) => cellText(cell))) continue;

    const values: Record<string, string | null> = {};
    headers.forEach((field, column) => {
      if (field) values[field] = cellText(source[column]);
    });

    const rowNumber = index + 1;
    const riderCode = values.rider_code ?? "";
    const rawStatus = (values.status ?? "active").toLowerCase();

    if (!riderCode) {
      errors.push({ row: rowNumber, error: "Thiếu ID rider" });
      continue;
    }
    if (rawStatus !== "active" && rawStatus !== "inactive") {
      errors.push({
        row: rowNumber,
        rider_code: riderCode,
        error: "Status chỉ được là active hoặc inactive",
      });
      continue;
    }

    rows.push({
      row: rowNumber,
      kv: values.kv ?? null,
      home_district: values.home_district ?? null,
      cot: values.cot ?? null,
      rider_code: riderCode,
      full_name: values.full_name ?? null,
      pickup_district: values.pickup_district ?? null,
      pickup_ward: values.pickup_ward ?? null,
      point_name: values.point_name ?? null,
      delivery_district: values.delivery_district ?? null,
      delivery_ward: values.delivery_ward ?? null,
      status: rawStatus,
    });
  }

  return { rows, errors };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

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
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } catch {
    return NextResponse.json({ success: false, error: "Không đọc được file Excel" }, { status: 400 });
  }

  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) {
    return NextResponse.json({ success: false, error: "File Excel không có sheet dữ liệu" }, { status: 400 });
  }

  const { rows, errors } = parseRows(firstSheet);
  const codeRows = new Map<string, number[]>();
  rows.forEach((row) => {
    codeRows.set(row.rider_code, [...(codeRows.get(row.rider_code) ?? []), row.row]);
  });

  for (const [riderCode, rowNumbers] of codeRows) {
    if (rowNumbers.length > 1) {
      rowNumbers.forEach((row) => {
        errors.push({ row, rider_code: riderCode, error: `ID trùng trong file tại các dòng ${rowNumbers.join(", ")}` });
      });
    }
  }

  const admin = createAdminClient();
  const uniqueCodes = [...codeRows.keys()];
  const existingCodes = new Set<string>();

  for (let index = 0; index < uniqueCodes.length; index += 500) {
    const { data, error } = await admin
      .from("riders")
      .select("rider_code")
      .in("rider_code", uniqueCodes.slice(index, index + 500));
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    data?.forEach((rider) => existingCodes.add(rider.rider_code));
  }

  rows.forEach((row) => {
    if (existingCodes.has(row.rider_code)) {
      errors.push({ row: row.row, rider_code: row.rider_code, error: "ID đã tồn tại trong hệ thống" });
    }
  });

  if (errors.length > 0) {
    return NextResponse.json(
      { success: false, error: "File có dữ liệu không hợp lệ", errors: errors.sort((a, b) => a.row - b.row) },
      { status: 409 },
    );
  }
  if (rows.length === 0) {
    return NextResponse.json({ success: false, error: "Không có rider hợp lệ để import" }, { status: 400 });
  }

  const payload = rows.map(({ row, ...rider }) => ({
    ...rider,
    name: rider.full_name,
    raw_data: { ...rider, excel_row: row, source_file: file.name },
  }));
  const { data: inserted, error: insertError } = await admin.from("riders").insert(payload).select("id,rider_code");

  if (insertError) {
    return NextResponse.json({ success: false, error: insertError.message }, { status: 400 });
  }

  if (inserted?.length) {
    await admin.from("activity_logs").insert(
      inserted.map((rider) => ({
        entity_type: "rider",
        entity_id: rider.id,
        action: "inserted",
        message: `Imported rider ${rider.rider_code} from ${file.name}`,
      })),
    );
  }

  return NextResponse.json({ success: true, imported: inserted?.length ?? 0 });
}
