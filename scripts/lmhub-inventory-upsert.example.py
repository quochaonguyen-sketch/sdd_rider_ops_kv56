# -*- coding: utf-8 -*-
"""Mau upsert ton LMHub len Supabase (REPLACE snapshot).
Dat file nay canh jobs/order_tracking_lmhub_received.py trong SPX_Launcher,
import va goi sau khi co `output_rows` (da bo header) + `snapshot_at`.

Yeu cau:
  pip install supabase
  Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  SQL: chay prisma/lmhub-inventory.sql trong Supabase SQL editor truoc.

output_rows: list[tuple] dung thu tu build_output_legacy():
  (shipment_id, create_time, delivering_time, received_time, report_date,
   ward, district, area, zone, status, driver_id, driver_name, order_type, cot_group)
  Cac ham ts_to_str() cua job tra ve dang 'dd/mm/yyyy hh:mm:ss' -> parse lai o duoi.
"""
import os
from datetime import datetime, timezone

try:
    from supabase import create_client
except ImportError:
    create_client = None

TABLE = "lmhub_inventory_rows"
BATCH = 500


def _parse_ts(value):
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:19], fmt).replace(tzinfo=timezone.utc).isoformat()
        except Exception:
            pass
    try:
        return datetime.fromisoformat(text).isoformat()
    except Exception:
        return None


def _parse_date(value):
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text[:10], fmt).date().isoformat()
        except Exception:
            pass
    return None


def upsert_lmhub_inventory(output_rows, snapshot_at=None):
    """Ghi REPLACE: insert snapshot moi, xoa snapshot cu. Tra ve (snapshot_id, count)."""
    if create_client is None:
        raise RuntimeError("pip install supabase")
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("Thieu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    sb = create_client(url, key)

    snapshot_id = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    snap_at = snapshot_at or datetime.now(timezone.utc).isoformat()

    payload = []
    for r in (output_rows or []):
        if not r or len(r) < 14:
            continue
        sid = str(r[0] or "").strip()
        if not sid:
            continue
        payload.append({
            "snapshot_id": snapshot_id,
            "snapshot_at": snap_at,
            "shipment_id": sid,
            "create_time": _parse_ts(r[1]),
            "delivering_time": _parse_ts(r[2]),
            "received_time": _parse_ts(r[3]),
            "report_date": _parse_date(r[4]),
            "ward": str(r[5] or "").strip(),
            "district": str(r[6] or "").strip(),
            "area": str(r[7] or "").strip(),
            "zone_id": str(r[8] or "").strip(),
            "status": str(r[9] or "").strip(),
            "driver_id": str(r[10] or "").strip(),
            "driver_name": str(r[11] or "").strip(),
            "order_type": str(r[12] or "").strip(),
            "cot_group": str(r[13] or "").strip(),
        })
    for i in range(0, len(payload), BATCH):
        sb.table(TABLE).upsert(
            payload[i:i + BATCH], on_conflict="snapshot_id,shipment_id").execute()
    # REPLACE: xoa cac snapshot cu, chi giu snapshot vua ghi.
    sb.table(TABLE).delete().neq("snapshot_id", snapshot_id).execute()
    return snapshot_id, len(payload)


# Vi du goi trong order_tracking_lmhub_received.py (sau build_output_legacy):
#   from lmhub_inventory_upsert import upsert_lmhub_inventory
#   data_rows = output_rows[1:]  # bo header
#   upsert_lmhub_inventory(data_rows)
