import { createPrivateKey, createSign, randomUUID } from "node:crypto";

export const LMHUB_QUEUE_SHEET = process.env.LMHUB_QUEUE_SHEET?.trim() || "LMHUB_Queue";
export const LMHUB_COOLDOWN_MS = Math.max(15, Number(process.env.LMHUB_COOLDOWN_SECONDS) || 60) * 1000;

type GoogleError = { error?: { message?: string } };
type AccessTokenResponse = { access_token?: string; expires_in?: number; error_description?: string };
type SheetValuesResponse = GoogleError & { values?: string[][] };

let cachedToken: { value: string; expiresAt: number } | null = null;

function cleanCredential(value: string | undefined) {
  let clean = value?.trim() ?? "";
  if (clean.endsWith(",")) clean = clean.slice(0, -1).trim();
  if ((clean.startsWith("\"") && clean.endsWith("\"")) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1);
  }
  return clean.replace(/\\n/g, "\n").trim();
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function lmhubSheetIds() {
  const raw = [
    process.env.LMHUB_SHEET_IDS,
    process.env.LMHUB_SHEET_ID,
    process.env.THI_CONG_PLAN_SPREADSHEET_ID,
  ].filter(Boolean).join(",");
  return [...new Set(raw.split(/[,;]/).map((id) => id.trim()).filter(Boolean))];
}

function workerPriorityPayload() {
  const ips = String(process.env.WORKER_IP_PRIORITY || "172.17.32.44")
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter((part) => /^\d{1,3}(\.\d{1,3}){3}$/.test(part));
  const grace = Number(process.env.WORKER_PRIORITY_GRACE_SECONDS);
  return {
    source: "sdd_rider_ops_web",
    worker_ip_priority: ips.length ? ips : ["172.17.32.44"],
    worker_priority_grace_seconds: grace > 0 ? grace : 8,
  };
}

async function googleAccessToken() {
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
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${base64Url(signer.sign(createPrivateKey(privateKey)))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
  });
  const result = await response.json().catch(() => null) as AccessTokenResponse | null;
  if (!response.ok || !result?.access_token) {
    throw new Error(result?.error_description ?? "Không thể xác thực Google Service Account");
  }
  cachedToken = {
    value: result.access_token,
    expiresAt: Date.now() + Math.max(300, result.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

function queueRange() {
  return encodeURIComponent(`${LMHUB_QUEUE_SHEET}!A:F`);
}

async function readQueueRows(token: string, spreadsheetId: string) {
  const source = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${queueRange()}?majorDimension=ROWS`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  const result = await source.json().catch(() => null) as SheetValuesResponse | null;
  if (source.ok) return result?.values ?? [];
  const message = result?.error?.message ?? `Không đọc được tab ${LMHUB_QUEUE_SHEET}`;
  if (/unable to parse range|unable to parse|not found/i.test(message)) return null;
  throw new Error(message);
}

async function appendValues(token: string, spreadsheetId: string, values: string[][]) {
  const source = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${queueRange()}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
      cache: "no-store",
    },
  );
  const result = await source.json().catch(() => null) as GoogleError | null;
  if (!source.ok) throw new Error(result?.error?.message ?? `Không ghi được tab ${LMHUB_QUEUE_SHEET}`);
}

async function ensureQueueSheet(token: string, spreadsheetId: string) {
  const existing = await readQueueRows(token, spreadsheetId);
  if (existing) {
    if (!existing.length) {
      await appendValues(token, spreadsheetId, [["request_id", "requested_at", "status", "finished_at", "message", "params_json"]]);
    }
    return existing;
  }
  const created = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: LMHUB_QUEUE_SHEET } } }] }),
    cache: "no-store",
  });
  const body = await created.json().catch(() => null) as GoogleError | null;
  if (!created.ok && !/already exists/i.test(body?.error?.message ?? "")) {
    throw new Error(body?.error?.message ?? `Không tạo được tab ${LMHUB_QUEUE_SHEET}`);
  }
  await appendValues(token, spreadsheetId, [["request_id", "requested_at", "status", "finished_at", "message", "params_json"]]);
  return [["request_id", "requested_at", "status", "finished_at", "message", "params_json"]];
}

export type LmhubQueueStatus = {
  pending: number;
  running: number;
  sheetCount: number;
  lastStatus: string;
  lastMessage: string;
  lastFinished: string;
};

export async function readLmhubQueueStatus(): Promise<LmhubQueueStatus> {
  const ids = lmhubSheetIds();
  if (!ids.length) {
    return { pending: 0, running: 0, sheetCount: 0, lastStatus: "UNCONFIGURED", lastMessage: "Chưa cấu hình LMHUB_SHEET_ID", lastFinished: "" };
  }
  const token = await googleAccessToken();
  let pending = 0;
  let running = 0;
  let lastStatus = "EMPTY";
  let lastMessage = "Hàng đợi đang trống. Worker LMHub đang chờ việc.";
  let lastFinished = "";
  let lastTime = -1;
  for (const id of ids) {
    const rows = await ensureQueueSheet(token, id);
    const body = rows.slice(1).slice(-50);
    for (const row of body) {
      const status = String(row[2] ?? "").trim().toUpperCase();
      if (status === "PENDING") pending += 1;
      if (status === "RUNNING") running += 1;
    }
    const last = body[body.length - 1];
    if (!last) continue;
    const stamp = Date.parse(String(last[3] || last[1] || "")) || -1;
    if (stamp >= lastTime) {
      lastTime = stamp;
      lastStatus = String(last[2] || "");
      lastMessage = String(last[4] || "");
      lastFinished = String(last[3] || "");
    }
  }
  return { pending, running, sheetCount: ids.length, lastStatus, lastMessage, lastFinished };
}

export async function queueLmhubFetch(message: string) {
  const ids = lmhubSheetIds();
  if (!ids.length) throw new Error("Chưa cấu hình LMHUB_SHEET_ID trên máy chủ");
  const token = await googleAccessToken();
  const queued: string[] = [];
  const skipped: string[] = [];
  for (const id of ids) {
    const rows = await ensureQueueSheet(token, id);
    const recent = rows.slice(1).slice(-50).map((row) => String(row[2] ?? "").trim().toUpperCase());
    if (recent.some((status) => status === "PENDING" || status === "RUNNING")) {
      skipped.push(id);
      continue;
    }
    await appendValues(token, id, [[
      randomUUID(),
      new Date().toISOString(),
      "PENDING",
      "",
      message,
      JSON.stringify(workerPriorityPayload()),
    ]]);
    queued.push(id);
  }
  return { queued, skipped, sheetCount: ids.length };
}
