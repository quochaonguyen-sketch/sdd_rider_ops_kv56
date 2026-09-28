"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, X } from "lucide-react";

type PendingOffRequest = {
  id: string;
  rider_code: string;
  rider_name: string | null;
  off_date: string;
  request_type: string;
  shift?: string;
  created_at?: string;
  reason?: string | null;
};

const READ_KEY = "rider-ops-off-notifications-read";
const TYPE_LABEL: Record<string, string> = {
  WEEKLY: "OFF tuần",
  PLANNED: "OFF kế hoạch",
  EMERGENCY: "OFF khẩn",
};
const SHIFT_LABEL: Record<string, string> = {
  FULL_DAY: "Cả ngày",
  MORNING: "Buổi sáng",
  AFTERNOON: "Buổi chiều",
};

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(`${String(value).slice(0, 10)}T00:00:00+07:00`));
}

function formatTime(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function loadReadIds() {
  try {
    const raw = window.localStorage.getItem(READ_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function saveReadIds(ids: Set<string>) {
  window.localStorage.setItem(READ_KEY, JSON.stringify(Array.from(ids)));
}

export function OffRequestNotifications() {
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<PendingOffRequest[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setReadIds(loadReadIds());
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

  const unreadCount = useMemo(
    () => requests.filter((item) => !readIds.has(item.id)).length,
    [requests, readIds],
  );
  const active = requests.find((item) => item.id === activeId) ?? null;

  function markRead(id: string) {
    setReadIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      saveReadIds(next);
      return next;
    });
  }

  function markAllRead() {
    setReadIds((current) => {
      const next = new Set(current);
      for (const item of requests) next.add(item.id);
      saveReadIds(next);
      return next;
    });
  }

  function openItem(item: PendingOffRequest) {
    markRead(item.id);
    setActiveId((current) => (current === item.id ? null : item.id));
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="app-theme-toggle"
        aria-expanded={open}
        aria-label="Bảng thông báo"
        title="Thông báo"
        onClick={() => {
          setOpen((current) => !current);
          setActiveId(null);
        }}
      >
        <Bell size={17} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span style={{ position: "absolute", top: 2, right: 2, minWidth: 16, height: 16, padding: "0 3px", borderRadius: 999, background: "#b42318", color: "#fff", fontSize: 10, lineHeight: "16px", textAlign: "center", fontWeight: 700 }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div role="dialog" aria-label="Bảng thông báo" style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", width: 380, maxWidth: "calc(100vw - 24px)", background: "var(--color-paper)", border: "1px solid var(--color-rule-strong)", borderRadius: 14, boxShadow: "0 18px 40px rgba(15,23,42,.18)", zIndex: 50, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 14px", borderBottom: "1px solid var(--color-rule-strong)" }}>
            <div>
              <strong style={{ display: "block", fontSize: 14 }}>Thông báo</strong>
              <span style={{ color: "var(--color-ink-2)", fontSize: 12 }}>{unreadCount} chưa đọc · {requests.length} yêu cầu OFF</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={markAllRead} title="Đánh dấu đã đọc tất cả" style={{ border: 0, background: "transparent", color: "var(--color-ink-2)", cursor: "pointer", display: "grid", placeItems: "center", width: 28, height: 28 }}>
                <CheckCheck size={16} />
              </button>
              <button type="button" onClick={() => { setOpen(false); setActiveId(null); }} title="Đóng" style={{ border: 0, background: "transparent", color: "var(--color-ink-2)", cursor: "pointer", display: "grid", placeItems: "center", width: 28, height: 28 }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {requests.length === 0 ? (
            <p style={{ margin: 0, padding: "18px 14px", color: "var(--color-ink-2)", fontSize: 13 }}>Chưa có thông báo mới.</p>
          ) : (
            <div style={{ maxHeight: 420, overflow: "auto" }}>
              {requests.map((item) => {
                const unread = !readIds.has(item.id);
                const selected = activeId === item.id;
                return (
                  <div key={item.id} style={{ borderBottom: "1px solid var(--color-rule-strong)", background: selected ? "var(--color-accent-soft)" : unread ? "color-mix(in oklch, var(--color-accent-soft) 55%, var(--color-paper))" : "var(--color-paper)" }}>
                    <button type="button" onClick={() => openItem(item)} style={{ width: "100%", border: 0, background: "transparent", textAlign: "left", padding: "11px 14px", cursor: "pointer", display: "grid", gridTemplateColumns: "8px 1fr auto", gap: 10, alignItems: "start" }}>
                      <span style={{ width: 8, height: 8, marginTop: 6, borderRadius: 999, background: unread ? "#b42318" : "var(--color-rule-strong)" }} />
                      <span>
                        <strong style={{ display: "block", fontSize: 13 }}>{item.rider_name || item.rider_code} yêu cầu OFF</strong>
                        <span style={{ display: "block", color: "var(--color-ink-2)", fontSize: 12, marginTop: 2 }}>{item.rider_code} · {formatDate(item.off_date)} · {TYPE_LABEL[item.request_type] || item.request_type}</span>
                      </span>
                      <span style={{ color: "var(--color-muted)", fontSize: 11, whiteSpace: "nowrap" }}>{unread ? "Chưa đọc" : "Đã đọc"}</span>
                    </button>
                    {selected ? (
                      <div style={{ margin: "0 14px 12px 32px", padding: 12, border: "1px solid var(--color-rule-strong)", borderRadius: 10, background: "var(--color-paper)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                          <strong style={{ fontSize: 13 }}>Chi tiết yêu cầu</strong>
                          <button type="button" onClick={() => setActiveId(null)} style={{ border: 0, background: "transparent", cursor: "pointer", color: "var(--color-ink-2)" }} aria-label="Đóng chi tiết">
                            <X size={14} />
                          </button>
                        </div>
                        <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--color-ink-2)" }}>Ngày OFF: {formatDate(item.off_date)}</p>
                        <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--color-ink-2)" }}>Loại: {TYPE_LABEL[item.request_type] || item.request_type} · {SHIFT_LABEL[item.shift || ""] || item.shift || "Cả ngày"}</p>
                        <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--color-ink-2)" }}>Gửi lúc: {formatTime(item.created_at) || "-"}</p>
                        <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--color-ink-2)" }}>Lý do: {item.reason?.trim() || "Không có"}</p>
                        <Link href={`/off-schedule?request=${item.id}`} onClick={() => setOpen(false)} style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: "var(--color-accent)", textDecoration: "none" }}>
                          Mở đúng yêu cầu trên Off Schedule
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
