# -*- coding: utf-8 -*-
"""Worker hang doi Ton khu vuc tren Supabase.

Thay cho viec doc tab Google Sheet LMHUB_Queue.
Dat file nay canh jobs/order_tracking_lmhub_received.py trong SPX_Launcher.

Yeu cau:
  pip install supabase
  Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  SQL: bang public.lmhub_fetch_jobs + ham claim_lmhub_fetch_job da chay.

Cach gan vao job cu:
  from lmhub_fetch_queue_worker import claim_job, finish_job
  job = claim_job()
  if not job:
      return
  try:
      output_rows, snapshot_at = run_lmhub_fetch()  # ham san co cua ban
      snapshot_id, count = upsert_lmhub_inventory(output_rows[1:], snapshot_at)
      finish_job(job["id"], ok=True, snapshot_id=snapshot_id, row_count=count)
  except Exception as exc:
      finish_job(job["id"], ok=False, error=str(exc))
"""
import os
import socket
from datetime import datetime, timezone

try:
    from supabase import create_client
except ImportError:
    create_client = None

WORKER_ID = os.getenv("LMHUB_WORKER_ID") or socket.gethostname()


def _client():
    if create_client is None:
        raise RuntimeError("pip install supabase")
    url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or ""
    if not url or not key:
        raise RuntimeError("Thieu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def claim_job():
    """Lay 1 job PENDING, chuyen RUNNING. Tra ve dict hoac None."""
    sb = _client()
    result = sb.rpc("claim_lmhub_fetch_job", {"p_worker_id": WORKER_ID}).execute()
    data = result.data
    if not data:
        return None
    if isinstance(data, list):
        return data[0] if data else None
    return data


def finish_job(job_id, ok=True, snapshot_id=None, row_count=None, error=None, message=""):
    payload = {
        "status": "DONE" if ok else "ERROR",
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "snapshot_id": snapshot_id,
        "row_count": row_count,
        "error_message": None if ok else (error or "Worker loi khong ro"),
    }
    if message:
        payload["message"] = message
    elif ok and snapshot_id:
        payload["message"] = f"Snapshot {snapshot_id} · {row_count or 0} dong"
    sb = _client()
    sb.table("lmhub_fetch_jobs").update(payload).eq("id", job_id).execute()


if __name__ == "__main__":
    job = claim_job()
    print("no pending job" if not job else f"claimed {job.get('id')} status={job.get('status')}")
