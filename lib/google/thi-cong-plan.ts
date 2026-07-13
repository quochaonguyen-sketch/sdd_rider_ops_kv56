import { createPrivateKey, createSign } from "node:crypto";

export const THI_CONG_PLAN_SPREADSHEET_ID =
  process.env.THI_CONG_PLAN_SPREADSHEET_ID?.trim() || "1nc-jsQGOdUHIGjmIWQf01HUXJGS82XYglj46eXSzp8c";
export const THI_CONG_PLAN_SHEET_NAME = "Thi Công Plan";

export type ThiCongPlanRider = {
  id: string;
  rider_code: string;
  kv: string | null;
  home_district: string | null;
  cot: string | null;
  pickup_district: string | null;
  pickup_ward: string | null;
  delivery_district: string | null;
  delivery_ward: string | null;
};

export type ThiCongPlanSyncResult = {
  success: true;
  updated_riders: number;
  updated_rows: number;
  missing_rider_codes: string[];
};

type GoogleError = { error?: { message?: string } };
type AccessTokenResponse = { access_token?: string; expires_in?: number; error_description?: string };
type SheetValuesResponse = GoogleError & { values?: unknown[][] };

let cachedToken: { value: string; expiresAt: number } | null = null;

function cleanCredential(value: string | undefined) {
  let clean = value?.trim() ?? "";
  if (clean.endsWith(",")) clean = clean.slice(0, -1).trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1);
  }
  return clean.replace(/\\n/g, "\n").trim();
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function requestSignal(signal?: AbortSignal) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
}

async function googleAccessToken(signal?: AbortSignal) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const email = cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  if (!email || !privateKey) throw new Error("Chưa cấu hình Google Service Account trên máy chủ");

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
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
    signal: requestSignal(signal),
  });
  const result = await response.json().catch(() => null) as AccessTokenResponse | null;
  if (!response.ok || !result?.access_token) {
    throw new Error(result?.error_description ?? "Không thể xác thực Google Service Account");
  }

  cachedToken = {
    value: result.access_token,
    expiresAt: Date.now() + Math.max(300, result.expires_in ?? 3600) * 1000,
  };
  return result.access_token;
}

function a1Range(range: string) {
  return `'${THI_CONG_PLAN_SHEET_NAME.replaceAll("'", "''")}'!${range}`;
}

function cell(value: string | null) {
  return value?.trim() ?? "";
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .trim()
    .toLowerCase();
}

async function assertExpectedColumns(token: string, signal?: AbortSignal) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${THI_CONG_PLAN_SPREADSHEET_ID}/values/${encodeURIComponent(a1Range("A1:L1"))}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: requestSignal(signal) },
  );
  const result = await response.json().catch(() => null) as SheetValuesResponse | null;
  if (!response.ok) throw new Error(result?.error?.message ?? "Không thể kiểm tra tiêu đề tab Thi Công Plan");

  const header = result?.values?.[0] ?? [];
  const expected = new Map<number, string>([
    [0, "kv"],
    [1, "quan o"],
    [2, "cot"],
    [3, "id"],
    [5, "quan lay"],
    [6, "phuong lay"],
    [8, "quan giao"],
    [11, "phuong giao"],
  ]);
  const mismatches = Array.from(expected).filter(([index, label]) => normalizeHeader(header[index]) !== label);
  if (mismatches.length > 0) {
    throw new Error("Cấu trúc cột tab Thi Công Plan đã thay đổi; đã dừng đồng bộ để tránh ghi nhầm dữ liệu");
  }
}

function valuesForRider(rider: ThiCongPlanRider, row: number) {
  return [
    { range: a1Range(`A${row}:C${row}`), values: [[cell(rider.kv), cell(rider.home_district), cell(rider.cot)]] },
    { range: a1Range(`F${row}:G${row}`), values: [[cell(rider.pickup_district), cell(rider.pickup_ward)]] },
    { range: a1Range(`I${row}`), values: [[cell(rider.delivery_district)]] },
    { range: a1Range(`L${row}`), values: [[cell(rider.delivery_ward)]] },
  ];
}

export function thiCongPlanConfig() {
  const email = cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) || null;
  return {
    configured: Boolean(email && cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)),
    service_account_email: email,
    spreadsheet_id: THI_CONG_PLAN_SPREADSHEET_ID,
    sheet_name: THI_CONG_PLAN_SHEET_NAME,
  };
}

export async function syncRidersToThiCongPlan(riders: ThiCongPlanRider[], signal?: AbortSignal): Promise<ThiCongPlanSyncResult> {
  if (riders.length === 0) return { success: true, updated_riders: 0, updated_rows: 0, missing_rider_codes: [] };

  const token = await googleAccessToken(signal);
  await assertExpectedColumns(token, signal);
  const idColumnResponse = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${THI_CONG_PLAN_SPREADSHEET_ID}/values/${encodeURIComponent(a1Range("D2:D"))}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: requestSignal(signal) },
  );
  const idColumn = await idColumnResponse.json().catch(() => null) as SheetValuesResponse | null;
  if (!idColumnResponse.ok) {
    throw new Error(idColumn?.error?.message ?? "Google Sheets API từ chối đọc tab Thi Công Plan");
  }

  const rowsByCode = new Map<string, number[]>();
  for (const [index, row] of (idColumn?.values ?? []).entries()) {
    const code = String(row[0] ?? "").trim();
    if (!code) continue;
    const rows = rowsByCode.get(code) ?? [];
    rows.push(index + 2);
    rowsByCode.set(code, rows);
  }

  const missing: string[] = [];
  const updates: Array<{ range: string; values: string[][] }> = [];
  let updatedRiders = 0;
  let updatedRows = 0;
  for (const rider of riders) {
    const code = rider.rider_code.trim();
    const matchingRows = rowsByCode.get(code) ?? [];
    if (matchingRows.length === 0) {
      missing.push(code);
      continue;
    }
    updatedRiders += 1;
    updatedRows += matchingRows.length;
    for (const row of matchingRows) updates.push(...valuesForRider(rider, row));
  }

  for (let index = 0; index < updates.length; index += 400) {
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${THI_CONG_PLAN_SPREADSHEET_ID}/values:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ valueInputOption: "RAW", data: updates.slice(index, index + 400) }),
        cache: "no-store",
        signal: requestSignal(signal),
      },
    );
    const result = await response.json().catch(() => null) as GoogleError | null;
    if (!response.ok) {
      throw new Error(result?.error?.message ?? "Google Sheets API từ chối cập nhật tab Thi Công Plan");
    }
  }

  return { success: true, updated_riders: updatedRiders, updated_rows: updatedRows, missing_rider_codes: missing };
}
