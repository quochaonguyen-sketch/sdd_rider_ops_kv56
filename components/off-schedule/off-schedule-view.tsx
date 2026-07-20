"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, startOfWeek, subDays } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarClock, Check, ChevronLeft, ChevronRight, ExternalLink, RefreshCcw, ShieldAlert, X } from "lucide-react";
import type { RiderOffRequest } from "@/types";

type StatusFilter = "ALL" | RiderOffRequest["status"];
type ApiResponse = { success: boolean; can_edit?: boolean; requests?: RiderOffRequest[]; error?: string };

const typeLabel = { WEEKLY: "OFF tuần", PLANNED: "OFF phép", EMERGENCY: "OFF đột xuất" };
const shiftLabel = { FULL_DAY: "Cả ngày", MORNING: "Buổi sáng", AFTERNOON: "Buổi chiều" };
const statusLabel = { PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Từ chối" };

export function OffScheduleView() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [requests, setRequests] = useState<RiderOffRequest[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from: format(weekStart, "yyyy-MM-dd"), to: format(weekEnd, "yyyy-MM-dd"), status });
    const response = await fetch(`/api/off-requests?${params}`, { cache: "no-store" });
    const result = await response.json().catch(() => null) as ApiResponse | null;
    if (!response.ok || !result?.success) setError(result?.error ?? "Không thể tải yêu cầu OFF.");
    else { setRequests(result.requests ?? []); setCanEdit(Boolean(result.can_edit)); }
    setLoading(false);
  }, [status, weekEnd, weekStart]);

  useEffect(() => {
    // Data loading is intentionally tied to the selected operational week and status filter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function review(item: RiderOffRequest, action: "APPROVE" | "REJECT") {
    setBusyId(item.id);
    setError(null);
    const response = await fetch(`/api/off-requests/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) setError(result?.error ?? "Không thể cập nhật lịch OFF.");
    else await load();
    setBusyId(null);
  }

  const summary = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((item) => item.status === "PENDING").length,
    approved: requests.filter((item) => item.status === "APPROVED").length,
    emergency: requests.filter((item) => item.request_type === "EMERGENCY").length,
  }), [requests]);

  const byDate = useMemo(() => {
    const map = new Map<string, RiderOffRequest[]>();
    for (let day = 0; day < 7; day += 1) map.set(format(addDays(weekStart, day), "yyyy-MM-dd"), []);
    for (const item of requests) map.get(item.off_date)?.push(item);
    return map;
  }, [requests, weekStart]);

  return (
    <div className="off-schedule-page">
      <section className="off-schedule-command">
        <div><p><span aria-hidden="true" /> OFF CONTROL / KV5 + KV6</p><h1>Xếp lịch OFF rider</h1><span>Duyệt yêu cầu từ trang công khai và đồng bộ trực tiếp vào bảng Attendance.</span></div>
        <a href="/off-registration" target="_blank" rel="noreferrer">Mở trang đăng ký <ExternalLink size={15} aria-hidden="true" /></a>
      </section>

      <section className="off-schedule-toolbar" aria-label="Điều khiển tuần">
        <div className="off-schedule-week-nav">
          <button type="button" aria-label="Tuần trước" onClick={() => setWeekStart((date) => subDays(date, 7))}><ChevronLeft size={17} /></button>
          <div><span>Tuần vận hành</span><strong>{format(weekStart, "dd/MM")} — {format(weekEnd, "dd/MM/yyyy")}</strong></div>
          <button type="button" aria-label="Tuần sau" onClick={() => setWeekStart((date) => addDays(date, 7))}><ChevronRight size={17} /></button>
        </div>
        <div className="off-schedule-tools">
          <select aria-label="Lọc trạng thái" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="ALL">Tất cả trạng thái</option><option value="PENDING">Chờ duyệt</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Từ chối</option></select>
          <button type="button" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} aria-hidden="true" />Làm mới</button>
        </div>
      </section>

      {error ? <p className="off-schedule-error" role="alert">{error}</p> : null}

      <section className="off-schedule-metrics" aria-label="Tổng hợp tuần">
        <div><span>Tổng yêu cầu</span><strong>{summary.total}</strong><small>Trong tuần đang xem</small></div>
        <div><span>Chờ duyệt</span><strong>{summary.pending}</strong><small>Cần quyết định</small></div>
        <div><span>Đã xếp lịch</span><strong>{summary.approved}</strong><small>Đã ghi Attendance</small></div>
        <div><span>Đột xuất</span><strong>{summary.emergency}</strong><small>Cần ưu tiên kiểm tra</small></div>
      </section>

      <section className="off-schedule-board">
        <header><div><span>01 / DAILY LOAD</span><h2>Tải OFF theo ngày</h2><p>Không tự áp quota; số lượng là tín hiệu để điều phối viên cân đối.</p></div><CalendarClock size={22} aria-hidden="true" /></header>
        <div className="off-schedule-days">
          {Array.from(byDate.entries()).map(([date, items]) => {
            const approved = items.filter((item) => item.status === "APPROVED").length;
            return <div key={date} className={date === format(new Date(), "yyyy-MM-dd") ? "is-today" : ""}><span>{format(new Date(`${date}T00:00:00`), "EEE", { locale: vi })}</span><strong>{format(new Date(`${date}T00:00:00`), "dd")}</strong><p>{items.length} yêu cầu</p><small>{approved} đã duyệt</small></div>;
          })}
        </div>
      </section>

      <section className="off-schedule-queue">
        <header><div><span>02 / APPROVAL QUEUE</span><h2>Danh sách yêu cầu</h2></div><strong>{loading ? "Đang tải" : `${requests.length} mục`}</strong></header>
        {loading ? <div className="off-schedule-loading" aria-label="Đang tải"><span /><span /><span /></div> : requests.length === 0 ? <div className="off-schedule-empty"><CalendarClock size={24} aria-hidden="true" /><strong>Không có yêu cầu trong bộ lọc này</strong><span>Chuyển tuần hoặc đổi trạng thái để xem dữ liệu khác.</span></div> : <div className="off-schedule-list">
          {requests.map((item) => <article key={item.id} className="off-schedule-request">
            <div className="off-schedule-date"><strong>{format(new Date(`${item.off_date}T00:00:00`), "dd")}</strong><span>{format(new Date(`${item.off_date}T00:00:00`), "MMM", { locale: vi })}</span></div>
            <div className="off-schedule-rider"><span>{item.rider_code}</span><h3>{item.rider?.full_name || "Chưa có tên rider"}</h3><p>{[item.rider?.kv, item.rider?.cot, item.rider?.delivery_district].filter(Boolean).join(" · ") || "Chưa có thông tin tuyến"}</p></div>
            <div className="off-schedule-request-meta"><span className={`is-${item.request_type.toLowerCase()}`}>{typeLabel[item.request_type]}</span><strong>{shiftLabel[item.shift]}</strong><p>{item.reason || "Không có ghi chú"}</p></div>
            <div className="off-schedule-decision"><span className={`is-${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span>{canEdit ? <div><button type="button" className="is-reject" disabled={busyId === item.id} onClick={() => void review(item, "REJECT")}><X size={15} aria-hidden="true" />Từ chối</button><button type="button" className="is-approve" disabled={busyId === item.id} onClick={() => void review(item, "APPROVE")}><Check size={15} aria-hidden="true" />Duyệt</button></div> : <small><ShieldAlert size={14} aria-hidden="true" />Chỉ xem</small>}</div>
          </article>)}
        </div>}
      </section>
    </div>
  );
}
