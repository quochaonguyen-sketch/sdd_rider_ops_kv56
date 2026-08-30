import { createPrivateKey, createSign } from "node:crypto";
import * as XLSX from "xlsx";

export type GoogleScheduleStatus =
  | ""
  | "ON"
  | "OFF_WEEKLY"
  | "OFF_APPROVED"
  | "OFF_UNEXPECTED"
  | "WORKING_REST_DAY"
  | "NO_PICKUP"
  | "NO_DELIVERY";

export type GoogleScheduleUpdate = {
  rider_code: string;
  rider_name: string;
  work_date: string;
  status: GoogleScheduleStatus;
};

export function buildOffRequestGoogleSheetSync({
  rider_code,
  rider_name,
  off_date,
  request_type,
  action,
}: {
  rider_code: string;
  rider_name: string | null;
  off_date: string;
  request_type: "WEEKLY" | "PLANNED" | "EMERGENCY";
  action: "APPROVE" | "REJECT";
}): GoogleScheduleUpdate[] {
  if (action === "REJECT") {
    return [{ rider_code, rider_name: rider_name ?? "", work_date: off_date, status: "ON" }];
  }

  const statusByType: Record<typeof request_type, Exclude<GoogleScheduleStatus, "" | "ON">> = {
    WEEKLY: "OFF_WEEKLY",
    PLANNED: "OFF_APPROVED",
    EMERGENCY: "OFF_UNEXPECTED",
  };

  return [{ rider_code, rider_name: rider_name ?? "", work_date: off_date, status: statusByType[request_type] }];
}

const STATUS_LABELS: Record<Exclude<GoogleScheduleStatus, "" | "ON">, string> = {
  OFF_WEEKLY: "OFF tuần",
  OFF_APPROVED: "OFF có xin phép",
  OFF_UNEXPECTED: "OFF đột xuất",
  WORKING_REST_DAY: "OFF nhưng không OFF",
  NO_PICKUP: "Không đi pick",
  NO_DELIVERY: "Không đi giao",
};

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function cleanGoogleCredential(value: string | undefined) {
  let clean = value?.trim() ?? "";
  if (clean.endsWith(",")) clean = clean.slice(0, -1).trim();
  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    clean = clean.slice(1, -1);
  }
  return clean.replace(/\\n/g, "\n").trim();
}

export function extractSpreadsheetId(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  return text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1]
    ?? (text.match(/^[a-zA-Z0-9-_]+$/)?.[0] ?? null);
}

export function resolveOffScheduleSpreadsheetId(sheetUrl?: string | null) {
  if (sheetUrl?.trim()) {
    const id = extractSpreadsheetId(sheetUrl);
    if (!id) throw new Error("Link Google Sheet lịch OFF không hợp lệ");
    return id;
  }

  const configuredId = extractSpreadsheetId(
    cleanGoogleCredential(
      process.env.OFF_SCHEDULE_SPREADSHEET_ID
      || process.env.THI_CONG_PLAN_SPREADSHEET_ID,
    )
      || "1nc-jsQGOdUHIGjmIWQf01HUXJGS82XYglj46eXSzp8c",
  );
  if (configuredId) return configuredId;

  return null;
}

export async function googleSheetsAccessToken() {
  const email = cleanGoogleCredential(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = cleanGoogleCredential(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  if (!email || !privateKey) {
    throw new Error("Chưa cấu hình Google Service Account trên máy chủ");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;

  let key;
  try {
    key = createPrivateKey(privateKey);
  } catch {
    throw new Error("Private key của Google Service Account không đúng định dạng");
  }

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64Url(signer.sign(key))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null) as {
    access_token?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !result?.access_token) {
    throw new Error(result?.error_description ?? "Không thể xác thực Google Service Account");
  }
  return result.access_token;
}

function dateValue(value: unknown, fallbackYear?: number) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const vi = text.match(/^([0-3]?\d)[-/]([01]?\d)[-/](\d{4})$/);
  if (vi) return `${vi[3]}-${vi[2].padStart(2, "0")}-${vi[1].padStart(2, "0")}`;
  const viShort = text.match(/^([0-3]?\d)[-/]([01]?\d)$/);
  if (viShort) {
    const year = fallbackYear ?? new Date().getFullYear();
    return `${year}-${viShort[2].padStart(2, "0")}-${viShort[1].padStart(2, "0")}`;
  }
  return null;
}

async function googleJson<T>(response: Response, fallback: string) {
  const result = await response.json().catch(() => null) as (T & { error?: { message?: string } }) | null;
  if (!response.ok) {
    const message = result?.error?.message ?? fallback;
    if (response.status === 403) {
      throw new Error(
        `${message}. Hãy chia sẻ quyền Editor cho Google Service Account của hệ thống.`,
      );
    }
    throw new Error(message);
  }
  return result;
}

export async function syncScheduleUpdatesToGoogleSheet(
  spreadsheetId: string,
  updates: GoogleScheduleUpdate[],
  signal?: AbortSignal,
) {
  const token = await googleSheetsAccessToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`;
  const readResponse = await fetch(
    `${baseUrl}/${encodeURIComponent("'OFF'!A:D")}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal },
  );
  const source = await googleJson<{ values?: unknown[][] }>(
    readResponse,
    "Google Sheets API từ chối đọc tab OFF",
  );
  const rows = source?.values ?? [];
  const rowNumbersByKey = new Map<string, number[]>();
  const blankRowNumbers: number[] = [];

  // Fallback year for short dates like "1/9" without year
  const fallbackYear = updates[0] ? Number(String(updates[0].work_date).slice(0, 4)) : new Date().getFullYear();
  rows.forEach((row, index) => {
    if (index > 0 && !row.slice(0, 4).some((cell) => String(cell ?? "").trim())) {
      blankRowNumbers.push(index + 1);
      return;
    }
    const riderCode = String(row[0] ?? "").trim();
    const workDate = dateValue(row[2], fallbackYear);
    if (!riderCode || !workDate) return;
    const key = `${riderCode}|${workDate}`;
    const rowNumbers = rowNumbersByKey.get(key) ?? [];
    rowNumbers.push(index + 1);
    rowNumbersByKey.set(key, rowNumbers);
  });

  const latestByKey = new Map(
    updates.map((item) => [`${item.rider_code}|${item.work_date}`, item]),
  );
  const data: Array<{ range: string; majorDimension: "ROWS"; values: string[][] }> = [];
  const clearRanges: string[] = [];
  let addedRows = 0;

  for (const [key, item] of latestByKey) {
    const rowNumbers = rowNumbersByKey.get(key) ?? [];
    if (!item.status || item.status === "ON") {
      clearRanges.push(...rowNumbers.map((rowNumber) => `'OFF'!A${rowNumber}:D${rowNumber}`));
      continue;
    }

    const values = [
      item.rider_code,
      item.rider_name,
      item.work_date,
      STATUS_LABELS[item.status],
    ];
    const [firstRow, ...duplicateRows] = rowNumbers;
    if (firstRow) {
      data.push({
        range: `'OFF'!A${firstRow}:D${firstRow}`,
        majorDimension: "ROWS",
        values: [values],
      });
      clearRanges.push(...duplicateRows.map((rowNumber) => `'OFF'!A${rowNumber}:D${rowNumber}`));
    } else {
      const blankRow = blankRowNumbers.pop();
      if (!blankRow) {
        throw new Error(
          "Tab OFF đã hết hàng trống A:D. Cần tạo thêm hàng không khóa trước khi đồng bộ.",
        );
      }
      data.push({
        range: `'OFF'!A${blankRow}:D${blankRow}`,
        majorDimension: "ROWS",
        values: [values],
      });
      addedRows += 1;
    }
  }

  if (data.length) {
    await googleJson(
      await fetch(`${baseUrl}:batchUpdate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ valueInputOption: "RAW", data }),
        cache: "no-store",
        signal,
      }),
      "Google Sheets API từ chối cập nhật lịch",
    );
  }

  if (clearRanges.length) {
    await googleJson(
      await fetch(`${baseUrl}:batchClear`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ranges: clearRanges }),
        cache: "no-store",
        signal,
      }),
      "Google Sheets API từ chối xóa lịch ON",
    );
  }

  return {
    spreadsheet_id: spreadsheetId,
    updated: data.length - addedRows,
    appended: addedRows,
    cleared: clearRanges.length,
  };
}
