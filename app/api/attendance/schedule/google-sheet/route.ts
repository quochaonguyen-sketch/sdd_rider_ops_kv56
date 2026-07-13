import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { z } from "zod";
import { createPrivateKey, createSign } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth/permissions";

const bodySchema = z.object({
  sheet_url: z.url().max(1000),
  range_mode: z.enum(["week", "month"]),
  anchor_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
type Status = "OFF_WEEKLY" | "OFF_APPROVED" | "OFF_UNEXPECTED" | "NO_PICKUP" | "NO_DELIVERY";

async function adminSession() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return { admin, role: profile?.role ?? "viewer", user };
}

function sheetId(url: string) { return url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] ?? null; }
function syncRange(mode: "week" | "month", anchor: string) {
  const date = new Date(`${anchor}T00:00:00Z`);
  if (mode === "month") {
    const start = `${anchor.slice(0, 7)}-01`;
    const endDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    return { start, end: endDate.toISOString().slice(0, 10) };
  }
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { start, end: date.toISOString().slice(0, 10) };
}
function normalize(value: unknown) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").trim().toLowerCase(); }
function statusValue(value: unknown): Status | null {
  const text = normalize(value);
  if (text === "off tuan" || text === "off") return "OFF_WEEKLY";
  if (["off co xin phep", "off co phep", "off phep"].includes(text)) return "OFF_APPROVED";
  if (text === "off dot xuat") return "OFF_UNEXPECTED";
  if (text === "khong di pick") return "NO_PICKUP";
  if (text === "khong di giao") return "NO_DELIVERY";
  return null;
}
function dateValue(value: unknown) {
  if (typeof value === "number") { const parsed = XLSX.SSF.parse_date_code(value); if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`; }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})[-/]([01]?\d)[-/]([0-3]?\d)$/); if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const vi = text.match(/^([0-3]?\d)[-/]([01]?\d)[-/](\d{4})$/); if (vi) return `${vi[3]}-${vi[2].padStart(2, "0")}-${vi[1].padStart(2, "0")}`;
  return null;
}

function base64Url(value: string | Buffer) { return Buffer.from(value).toString("base64url"); }
function cleanCredential(value: string | undefined) {
  let clean = value?.trim() ?? "";
  if (clean.endsWith(",")) clean = clean.slice(0, -1).trim();
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) clean = clean.slice(1, -1);
  return clean.replace(/\\n/g, "\n").trim();
}
async function googleAccessToken() {
  const email = cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const privateKey = cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
  if (!email || !privateKey) throw new Error("Chưa cấu hình Google Service Account trên máy chủ");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claims}`;
  let key;
  try { key = createPrivateKey(privateKey); }
  catch { throw new Error("Private key của Google Service Account không đúng định dạng"); }
  const signer = createSign("RSA-SHA256"); signer.update(unsigned); signer.end();
  const assertion = `${unsigned}.${base64Url(signer.sign(key))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }), cache: "no-store" });
  const result = await response.json().catch(() => null) as { access_token?: string; error_description?: string } | null;
  if (!response.ok || !result?.access_token) throw new Error(result?.error_description ?? "Không thể xác thực Google Service Account");
  return result.access_token;
}

export async function GET() {
  const session = await adminSession();
  if (!session) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManageOperations(session.role)) return NextResponse.json({ success: false, error: "Bạn không có quyền đồng bộ lịch" }, { status: 403 });
  const email = cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) || null;
  return NextResponse.json({ success: true, configured: Boolean(email && cleanCredential(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)), service_account_email: email });
}

export async function POST(request: Request) {
  const session = await adminSession();
  if (!session) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });
  if (!canManageOperations(session.role)) return NextResponse.json({ success: false, error: "Bạn không có quyền đồng bộ lịch" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "Link Google Sheet không hợp lệ" }, { status: 400 });
  const id = sheetId(parsed.data.sheet_url);
  if (!id) return NextResponse.json({ success: false, error: "Không đọc được ID từ link Google Sheet" }, { status: 400 });
  const range = syncRange(parsed.data.range_mode, parsed.data.anchor_date);

  let rows: unknown[][];
  try {
    const token = await googleAccessToken();
    const range = encodeURIComponent("OFF!A:D");
    const source = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(20_000)]) });
    const result = await source.json().catch(() => null) as { values?: unknown[][]; error?: { message?: string } } | null;
    if (!source.ok) throw new Error(result?.error?.message ?? "Google Sheets API từ chối truy cập");
    rows = result?.values ?? [];
  } catch (error) { return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Không đọc được sheet OFF" }, { status: 400 }); }

  const issues: Array<{ row: number; error: string }> = [];
  const records = new Map<string, { rider_code: string; work_date: string; status: Status; source_row: number }>();
  rows.forEach((row, index) => {
    const code = String(row[0] ?? "").trim();
    if (!code || ["id", "rider id"].includes(normalize(code))) return;
    const workDate = dateValue(row[2]); const status = statusValue(row[3]);
    if (!workDate || !status) { if (row.slice(0, 4).some((cell) => String(cell ?? "").trim())) issues.push({ row: index + 1, error: !workDate ? "Ngày không hợp lệ" : "Trạng thái không hợp lệ" }); return; }
    if (workDate >= range.start && workDate <= range.end) records.set(`${code}|${workDate}`, { rider_code: code, work_date: workDate, status, source_row: index + 1 });
  });

  const codes = Array.from(new Set(Array.from(records.values(), (item) => item.rider_code)));
  const { data: riders, error: riderError } = codes.length ? await session.admin.from("riders").select("id,rider_code").in("rider_code", codes) : { data: [], error: null };
  if (riderError) return NextResponse.json({ success: false, error: riderError.message }, { status: 400 });
  const riderMap = new Map((riders ?? []).map((rider) => [rider.rider_code, rider.id]));
  const missing = codes.filter((code) => !riderMap.has(code));
  const missingSet = new Set(missing);
  for (const item of records.values()) {
    if (missingSet.has(item.rider_code)) issues.push({ row: item.source_row, error: `ID ${item.rider_code} chưa tồn tại trên web` });
  }

  const syncedAt = new Date().toISOString();
  const sheetKeys = new Set(records.keys());
  const payload = Array.from(records.values())
    .filter((item) => riderMap.has(item.rider_code))
    .map((item) => ({ rider_code: item.rider_code, work_date: item.work_date, status: item.status, rider_id: riderMap.get(item.rider_code), raw_data: { source: "google_sheet_off", spreadsheet_id: id, synced_at: syncedAt } }));
  for (let index = 0; index < payload.length; index += 500) { if (request.signal.aborted) return new NextResponse(null, { status: 499 }); const { error } = await session.admin.from("attendance_logs").upsert(payload.slice(index, index + 500), { onConflict: "rider_code,work_date" }); if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 }); }

  const { data: previous } = await session.admin.from("attendance_logs").select("id,rider_code,work_date").contains("raw_data", { source: "google_sheet_off", spreadsheet_id: id }).gte("work_date", range.start).lte("work_date", range.end);
  const staleIds = (previous ?? []).filter((item) => !sheetKeys.has(`${item.rider_code}|${String(item.work_date).slice(0, 10)}`)).map((item) => item.id);
  for (let index = 0; index < staleIds.length; index += 500) { const { error } = await session.admin.from("attendance_logs").delete().in("id", staleIds.slice(index, index + 500)); if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 }); }

  await session.admin.from("activity_logs").insert({ entity_type: "attendance_schedule", action: "synced", message: `Synced OFF sheet: ${payload.length} rows`, raw_data: { spreadsheet_id: id, imported: payload.length, removed: staleIds.length, skipped: issues.length } });
  return NextResponse.json({ success: true, imported: payload.length, removed: staleIds.length, skipped: issues.length, errors: issues, range });
}
