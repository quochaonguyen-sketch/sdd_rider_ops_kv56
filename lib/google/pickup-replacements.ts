import { googleSheetsAccessToken } from "@/lib/google/off-schedule";

const OFF_RANGE = "'OFF'!A:H";

type GoogleValuesResponse = {
  values?: unknown[][];
  error?: { message?: string };
};

export type GooglePickupReplacement = {
  rider_code: string;
  work_date: string;
  replacement_rider_name: string | null;
  replacement_rider_code: string | null;
  row_numbers: number[];
};

export async function readPickupReplacementsFromGoogleSheet(
  spreadsheetId: string,
  start: string,
  end: string,
  signal?: AbortSignal,
) {
  const token = await googleSheetsAccessToken();
  const rows = await readOffRows(spreadsheetId, token, signal);
  const byKey = new Map<string, GooglePickupReplacement>();

  rows.forEach((row, index) => {
    if (index === 0) return;
    const riderCode = String(row[0] ?? "").trim();
    const workDate = googleDateValue(row[2]);
    if (!riderCode || !workDate || workDate < start || workDate > end) return;

    const key = `${riderCode}|${workDate}`;
    const replacementName = String(row[6] ?? "").trim() || null;
    const replacementCode = String(row[7] ?? "").trim() || null;
    const current = byKey.get(key);
    if (current) {
      current.row_numbers.push(index + 1);
      if (replacementCode) {
        current.replacement_rider_name = replacementName;
        current.replacement_rider_code = replacementCode;
      }
      return;
    }

    byKey.set(key, {
      rider_code: riderCode,
      work_date: workDate,
      replacement_rider_name: replacementName,
      replacement_rider_code: replacementCode,
      row_numbers: [index + 1],
    });
  });

  return Array.from(byKey.values());
}

export async function syncPickupReplacementToGoogleSheet({
  spreadsheetId,
  riderCode,
  workDate,
  replacementRiderName,
  replacementRiderCode,
  signal,
}: {
  spreadsheetId: string;
  riderCode: string;
  workDate: string;
  replacementRiderName: string | null;
  replacementRiderCode: string | null;
  signal?: AbortSignal;
}) {
  const token = await googleSheetsAccessToken();
  const keys = await readOffKeys(spreadsheetId, token, signal);
  const targetKey = `${riderCode}|${workDate.replaceAll("-", "")}`;
  const rowNumbers = keys.flatMap((row, index) => {
    if (index === 0) return [];
    return String(row[0] ?? "").trim() === targetKey ? [index + 1] : [];
  });

  if (!rowNumbers.length) {
    throw new Error(
      `Không tìm thấy dòng ${riderCode}|${workDate} trong tab OFF. Hãy đồng bộ lịch OFF trước khi gán pick thay.`,
    );
  }

  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`;
  await googleJson(
    await fetch(`${baseUrl}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: rowNumbers.map((rowNumber) => ({
          range: `'OFF'!G${rowNumber}`,
          majorDimension: "ROWS",
          values: [[replacementRiderName ?? ""]],
        })),
      }),
      cache: "no-store",
      signal,
    }),
    "Google Sheets API từ chối cập nhật pick thay",
  );

  const verifyRanges = rowNumbers
    .map((rowNumber) => `ranges=${encodeURIComponent(`'OFF'!G${rowNumber}:H${rowNumber}`)}`)
    .join("&");
  const verify = await googleJson<GoogleValuesResponse>(
    await fetch(
      `${baseUrl}:batchGet?${verifyRanges}&majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal },
    ),
    "Không thể kiểm tra kết quả đồng bộ pick thay",
  ) as GoogleValuesResponse & { valueRanges?: Array<{ values?: unknown[][] }> };
  const actualCodes = (verify.valueRanges ?? []).map((range) => String(range.values?.[0]?.[1] ?? "").trim());
  const verified = replacementRiderCode
    ? actualCodes.every((code) => code === replacementRiderCode)
    : actualCodes.every((code) => !code);

  if (!verified) {
    throw new Error(
      replacementRiderCode
        ? `Sheet đã nhận tên rider thay nhưng cột ID pick thay chưa trả về ${replacementRiderCode}. Kiểm tra tên rider trong Lịch Rider.`
        : "Sheet đã xóa tên rider thay nhưng cột ID pick thay vẫn còn dữ liệu.",
    );
  }

  return { spreadsheet_id: spreadsheetId, row_numbers: rowNumbers, verified: true };
}

async function readOffRows(spreadsheetId: string, token: string, signal?: AbortSignal) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(OFF_RANGE)}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal },
  );
  const result = await googleJson<GoogleValuesResponse>(response, "Google Sheets API từ chối đọc tab OFF");
  return result?.values ?? [];
}

async function readOffKeys(spreadsheetId: string, token: string, signal?: AbortSignal) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("'OFF'!F:F")}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal },
  );
  const result = await googleJson<GoogleValuesResponse>(response, "Google Sheets API từ chối đọc khóa tab OFF");
  return result?.values ?? [];
}

async function googleJson<T>(response: Response, fallback: string) {
  const result = await response.json().catch(() => null) as (T & { error?: { message?: string } }) | null;
  if (!response.ok) {
    const message = result?.error?.message ?? fallback;
    if (response.status === 403) {
      throw new Error(`${message}. Hãy chia sẻ quyền Editor cho Google Service Account của hệ thống.`);
    }
    throw new Error(message);
  }
  return result;
}

function googleDateValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const displayed = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (displayed) return `${displayed[3]}-${displayed[1].padStart(2, "0")}-${displayed[2].padStart(2, "0")}`;
  return null;
}
