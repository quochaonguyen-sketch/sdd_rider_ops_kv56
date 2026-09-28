import { createAdminClient } from "@/lib/supabase/admin";

export const LMHUB_COOLDOWN_MS = Math.max(15, Number(process.env.LMHUB_COOLDOWN_SECONDS) || 60) * 1000;

export type LmhubQueueStatus = {
  pending: number;
  running: number;
  lastStatus: string;
  lastMessage: string;
  lastFinished: string;
  lastJobId: string;
};

type JobRow = {
  id: string;
  status: string;
  message: string | null;
  error_message: string | null;
  finished_at: string | null;
  requested_at: string | null;
};

export async function readLmhubQueueStatus(): Promise<LmhubQueueStatus> {
  const admin = createAdminClient();
  const { data: openRows, error: openError } = await admin
    .from("lmhub_fetch_jobs")
    .select("id,status")
    .in("status", ["PENDING", "RUNNING"]);
  if (openError) throw new Error(openError.message);

  const { data: lastRows, error: lastError } = await admin
    .from("lmhub_fetch_jobs")
    .select("id,status,message,error_message,finished_at,requested_at")
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
    };
  }

  return {
    pending,
    running,
    lastStatus: last.status,
    lastMessage: last.error_message || last.message || "",
    lastFinished: last.finished_at || "",
    lastJobId: last.id,
  };
}

export async function queueLmhubFetch(message: string, requestedBy?: string | null) {
  const status = await readLmhubQueueStatus();
  if (status.pending > 0 || status.running > 0) {
    return { queued: false, reason: "busy" as const, status };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lmhub_fetch_jobs")
    .insert({
      status: "PENDING",
      message,
      requested_by: requestedBy || null,
      params: {
        source: "sdd_rider_ops_web",
        requested_via: "supabase_queue",
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
