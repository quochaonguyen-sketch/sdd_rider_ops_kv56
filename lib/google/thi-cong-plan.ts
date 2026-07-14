import { createPrivateKey, createSign } from "node:crypto";

export const THI_CONG_PLAN_SPREADSHEET_ID =
  process.env.THI_CONG_PLAN_SPREADSHEET_ID?.trim() || "1nc-jsQGOdUHIGjmIWQf01HUXJGS82XYglj46eXSzp8c";
export const THI_CONG_PLAN_SHEET_NAME = "Thi Công Plan";

export type ThiCongPlanRider = {
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
};

export type ThiCongPlanReadResult = {
  riders: ThiCongPlanRider[];
  sheet_rows: number;
  skipped_rows: number;
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
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
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

function cell(value: unknown) {
  return String(value ?? "").trim() || null;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function assertExpectedColumns(header: unknown[]) {
  const expected = new Map<number, string>([
    [0, "kv"],
    [1, "quan o"],
    [2, "cot"],
    [3, "id"],
    [4, "fullname"],
    [5, "quan lay"],
    [6, "phuong lay"],
    [7, "point name"],
    [8, "quan giao"],
    [11, "phuong giao"],
  ]);
  const mismatches = Array.from(expected).filter(([index, label]) => normalizeHeader(header[index]) !== label);
  if (mismatches.length > 0) {
    throw new Error("Cấu trúc cột tab Thi Công Plan đã thay đổi; đã dừng đồng bộ để tránh cập nhật nhầm dữ liệu trên web");
  }
}

export function thiCongPlanConfig() {
  const email = cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) || null;
  return {
    configured: Boolean(email && cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)),
    service_account_email: email,
    spreadsheet_id: THI_CONG_PLAN_SPREADSHEET_ID,
    sheet_name: THI_CONG_PLAN_SHEET_NAME,
    direction: "sheet_to_web" as const,
  };
}

export async function readRidersFromThiCongPlan(signal?: AbortSignal): Promise<ThiCongPlanReadResult> {
  const token = await googleAccessToken(signal);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${THI_CONG_PLAN_SPREADSHEET_ID}/values/${encodeURIComponent(a1Range("A1:L"))}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: requestSignal(signal) },
  );
  const result = await response.json().catch(() => null) as SheetValuesResponse | null;
  if (!response.ok) {
    throw new Error(result?.error?.message ?? "Google Sheets API từ chối đọc tab Thi Công Plan");
  }

  const [header = [], ...rows] = result?.values ?? [];
  assertExpectedColumns(header);

  const riders = new Map<string, ThiCongPlanRider>();
  let skippedRows = 0;
  for (const row of rows) {
    const riderCode = cell(row[3]);
    if (!riderCode) {
      if (row.some((value) => cell(value))) skippedRows += 1;
      continue;
    }
    if (riders.has(riderCode)) {
      throw new Error(`ID ${riderCode} bị trùng trên tab Thi Công Plan; hãy xử lý dòng trùng trước khi đồng bộ`);
    }

    riders.set(riderCode, {
      kv: cell(row[0]),
      home_district: cell(row[1]),
      cot: cell(row[2]),
      rider_code: riderCode,
      full_name: cell(row[4]),
      pickup_district: cell(row[5]),
      pickup_ward: cell(row[6]),
      point_name: cell(row[7]),
      delivery_district: cell(row[8]),
      delivery_ward: cell(row[11]),
    });
  }

  return { riders: [...riders.values()], sheet_rows: rows.length, skipped_rows: skippedRows };
}
