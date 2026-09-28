"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

type PendingOffRequest = {
  id: string;
  rider_code: string;
  rider_name: string | null;
  off_date: string;
  request_type: string;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`));
}

export function OffRequestNotifications() {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<PendingOffRequest[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/off-requests/pending", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!cancelled && payload?.success) setRequests(payload.requests ?? []);
      } catch {
        if (!cancelled) setRequests([]);
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const count = requests.length;

  return (
    <div className="app-notify">
      <button
        type="button"
        className="app-theme-toggle"
        aria-expanded={open}
        aria-label="Thông báo yêu cầu OFF"
        title="Yêu cầu OFF chờ duyệt"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={17} aria-hidden="true" />
        {count > 0 ? <span className="app-notify-badge">{count > 9 ? "9+" : count}</span> : null}
      </button>
      {open ? (
        <div className="app-notify-panel" role="dialog" aria-label="Yêu cầu OFF chờ duyệt">
          <div className="app-notify-heading">
            <strong>Yêu cầu OFF mới</strong>
            <span>{count} chờ duyệt</span>
          </div>
          {count === 0 ? <p className="app-notify-empty">Chưa có yêu cầu OFF mới.</p> : (
            <ul>
              {requests.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <Link href="/off-schedule" onClick={() => setOpen(false)}>
                    <strong>{item.rider_name || item.rider_code}</strong>
                    <span>{item.rider_code} · {formatDate(item.off_date)} · {item.request_type}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/off-schedule" className="app-notify-footer" onClick={() => setOpen(false)}>
            Mở Off Schedule
          </Link>
        </div>
      ) : null}
    </div>
  );
}
