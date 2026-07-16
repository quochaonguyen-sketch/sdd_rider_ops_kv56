import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

export function gptJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export function authorizeGptAction(request: Request) {
  const expected = process.env.GPT_ACTION_API_KEY?.trim();
  if (!expected) {
    return {
      ok: false as const,
      response: gptJson(
        { success: false, error: "GPT Action API is not configured" },
        503,
      ),
    };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const provided = match?.[1]?.trim() ?? "";
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  const valid =
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer);

  if (!valid) {
    return {
      ok: false as const,
      response: gptJson({ success: false, error: "Unauthorized" }, 401),
    };
  }

  return { ok: true as const };
}

export async function auditGptRead(
  admin: SupabaseClient,
  endpoint: string,
  filters: Record<string, unknown>,
) {
  try {
    await admin.from("activity_logs").insert({
      entity_type: "gpt_action",
      entity_id: null,
      action: "read",
      message: `GPT Action read ${endpoint}`,
      raw_data: { endpoint, filters },
    });
  } catch {
    // Audit logging must not make a read-only GPT request fail.
  }
}

export function normalizeSearch(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .toLocaleLowerCase("vi")
    .trim();
}

export function isCot1(value: string | null | undefined) {
  return /\bcot\s*1\b/i.test(value ?? "") || value?.trim() === "1";
}
