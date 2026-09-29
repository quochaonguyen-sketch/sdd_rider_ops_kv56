import { createAdminClient } from "@/lib/supabase/admin";

export const LMHUB_COOLDOWN_MS = Math.max(15, Number(process.env.LMHUB_COOLDOWN_SECONDS) || 60) * 1000;

export type LmhubJobKind = "delivery" | "pickup" | "all";

export type LmhubQueueStatus = {
  pending: number;
  running: number;
  lastStatus: string;
  lastMessage: string;
  lastFinished: string;
  lastJobId: string;
  lastKind: string;
};

type JobRow = {
  id: string;
  status: string;
  message: string | null;
  error_message: string | null;
  finished_at: string | null;
  requested_at: string | null;
  params?: { kind?: string } | null;
};

export function normalizeLmhubKind(raw?: string | null): LmhubJobKind {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "pickup" || value === "ton_pickup" || value === "assigned") return "pickup";
  if (value === "all" || value === "both" || value === "ton_all") return "all";
  return "delivery";
}

export async function readLmhubQueueStatus(): Promise<LmhubQueueStatus> {
  const admin = createAdminClient();
  const { data: openRows, error: openError } = await admin
    .from("lmhub_fetch_jobs")
    .select("id,status,params")
    .in("status", ["PENDING", "RUNNING"]);
  if (openError) throw new Error(openError.message);

  const { data: lastRows, error: lastError } = await admin
    .from("lmhub_fetch_jobs")
    .select("id,status,message,error_message,finished_at,requested_at,params")
    .order("requested_at", { ascending: false })
    .limit(1);
  if (lastError) throw new Error(lastError.message);

  const last = (lastRows?.[0] ?? null) as JobRow | null;
  const pending = (openRows ?? []).filter((row) => row.status === "PENDING").length;
  const running = (openRows ?? []).filter((row) => row.status === "RUNNING").length;

  if (!last) {
    return {
      pending: 0,
      running: 0,
      lastStatus: "EMPTY",
      lastMessage: "Hàng đợi Supabase đang trống. Worker đang chờ việc.",
      lastFinished: "",
      lastJobId: "",
      lastKind: "",
    };
  }

  return {
    pending,
    running,
    lastStatus: last.status,
    lastMessage: last.error_message || last.message || "",
    lastFinished: last.finished_at || "",
    lastJobId: last.id,
    lastKind: normalizeLmhubKind(last.params?.kind),
  };
}

export async function queueLmhubFetch(message: string, requestedBy?: string | null, kind: LmhubJobKind = "delivery") {
  const status = await readLmhubQueueStatus();
  const admin = createAdminClient();

  const { data: openSameKind, error: sameError } = await admin
    .from("lmhub_fetch_jobs")
    .select("id,status,params")
    .in("status", ["PENDING", "RUNNING"]);
  if (sameError) throw new Error(sameError.message);

  const already = (openSameKind ?? []).some((row) => {
    const rowKind = normalizeLmhubKind((row as JobRow).params?.kind);
    return rowKind === kind || rowKind === "all" || kind === "all";
  });
  if (already) {
    return {
      queued: false as const,
      reason: "busy" as const,
      status,
      message:
        status.running > 0
          ? `Worker đang chạy ${status.lastKind || "job"}. Job ${kind} đã nằm trong hàng chờ hoặc đang chạy.`
          : `Đã có job ${kind} PENDING. Đợi worker nhận.`,
    };
  }

  const { data, error } = await admin
    .from("lmhub_fetch_jobs")
    .insert({
      status: "PENDING",
      message,
      requested_by: requestedBy || null,
      params: {
        source: "sdd_rider_ops_web",
        requested_via: "supabase_queue",
        kind,
      },
    })
    .select("id,status,message,requested_at")
    .single();
  if (error) throw new Error(error.message);

  return {
    queued: true as const,
    jobId: data.id as string,
    status: await readLmhubQueueStatus(),
  };
}
