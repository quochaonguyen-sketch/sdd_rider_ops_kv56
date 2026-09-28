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
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="app-theme-toggle"
        aria-expanded={open}
        aria-label="Thông báo yêu cầu OFF"
        title="Yêu cầu OFF chờ duyệt"
        onClick={() => setOpen((current) => !current)}
      >
        <Bell size={17} aria-hidden="true" />
        {count > 0 ? (
          <span style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 999, background: "#b42318", color: "#fff", fontSize: 10, lineHeight: "16px", textAlign: "center", fontWeight: 700 }}>
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div role="dialog" aria-label="Yêu cầu OFF chờ duyệt" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 320, maxWidth: "calc(100vw - 24px)", background: "var(--color-paper)", border: "1px solid var(--color-rule-strong)", borderRadius: 12, boxShadow: "0 12px 32px rgba(15,23,42,.16)", zIndex: 40, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--color-rule-strong)", fontSize: 13 }}>
            <strong>Yêu cầu OFF mới</strong>
            <span style={{ color: "var(--color-ink-2)" }}>{count} chờ duyệt</span>
          </div>
          {count === 0 ? <p style={{ padding: "12px 14px", color: "var(--color-ink-2)" }}>Chưa có yêu cầu OFF mới.</p> : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: 320, overflow: "auto" }}>
              {requests.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <Link href="/off-schedule" onClick={() => setOpen(false)} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "10px 14px", textDecoration: "none", color: "inherit", borderBottom: "1px solid var(--color-rule-strong)" }}>
                    <strong>{item.rider_name || item.rider_code}</strong>
                    <span style={{ color: "var(--color-ink-2)" }}>{item.rider_code} · {formatDate(item.off_date)} · {item.request_type}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/off-schedule" onClick={() => setOpen(false)} style={{ display: "block", padding: "12px 14px", textAlign: "center", fontWeight: 600, textDecoration: "none", color: "var(--color-accent)" }}>
            Mở Off Schedule
          </Link>
        </div>
      ) : null}
    </div>
  );
}
