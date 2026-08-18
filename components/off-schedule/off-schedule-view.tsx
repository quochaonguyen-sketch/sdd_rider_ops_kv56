"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { addDays, format, startOfWeek, subDays } from "date-fns";
import { vi } from "date-fns/locale";
import { Archive, CalendarClock, Check, ChevronLeft, ChevronRight, ExternalLink, Image as ImageIcon, MailCheck, MailWarning, RefreshCcw, Send, ShieldAlert, Undo2, X } from "lucide-react";
import type { RiderOffRequest } from "@/types";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";

type ApiResponse = { success: boolean; can_edit?: boolean; requests?: RiderOffRequest[]; error?: string };

const typeLabel = { WEEKLY: "OFF tuần", PLANNED: "OFF phép", EMERGENCY: "OFF đột xuất" };
const shiftLabel = { FULL_DAY: "Cả ngày", MORNING: "Buổi sáng", AFTERNOON: "Buổi chiều" };
const statusLabel = { PENDING: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Từ chối" };

export function OffScheduleView() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [requests, setRequests] = useState<RiderOffRequest[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  useReportInitialDataLoading("off-schedule", loading);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from: format(weekStart, "yyyy-MM-dd"), to: format(weekEnd, "yyyy-MM-dd"), status: "ALL" });
    const response = await fetch(`/api/off-requests?${params}`, { cache: "no-store" });
    const result = await response.json().catch(() => null) as ApiResponse | null;
    if (!response.ok || !result?.success) setError(result?.error ?? "Không thể tải yêu cầu OFF.");
    else { setRequests(result.requests ?? []); setCanEdit(Boolean(result.can_edit)); }
    setLoading(false);
  }, [weekEnd, weekStart]);

  useEffect(() => {
    // Data loading is intentionally tied to the selected operational week and status filter.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const review = useCallback(async (item: RiderOffRequest, action: "APPROVE" | "REJECT" | "RESEND_EMAIL") => {
    setBusyId(item.id);
    setError(null);
    const response = await fetch(`/api/off-requests/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        sheet_url: window.localStorage.getItem("rider-ops-off-sheet-url") || null,
      }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể cập nhật lịch OFF.");
      setBusyId(null);
      return;
    }

    if (action === "APPROVE" || action === "REJECT") {
      const nextStatus = action === "APPROVE" ? "APPROVED" : "REJECTED";
      setRequests((current) => current.map((request) => request.id === item.id ? {
        ...request,
        status: nextStatus,
        reviewed_at: new Date().toISOString(),
        email_notification_status: result?.request?.email_notification_status ?? request.email_notification_status,
      } : request));
    }

    if (action === "RESEND_EMAIL" && result?.request) {
      setRequests((current) => current.map((request) => request.id === item.id ? {
        ...request,
        email_notification_status: result.request.email_notification_status,
        email_notification_error: result.request.email_notification_error,
        email_notified_at: result.request.email_notified_at,
      } : request));
    }

    setBusyId(null);
  }, []);

  // Combine all filtering into single pass for better performance
  const { summary, pendingRequests, approvedRequests, rejectedRequests } = useMemo(() => {
    let pendingCount = 0, approvedCount = 0, rejectedCount = 0;
    const pending: RiderOffRequest[] = [];
    const approved: RiderOffRequest[] = [];
    const rejected: RiderOffRequest[] = [];
    let evidenceSet = new Set<string>();

    for (const item of requests) {
      if (item.status === "PENDING") {
        pending.push(item);
        pendingCount++;
      } else if (item.status === "APPROVED") {
        approved.push(item);
        approvedCount++;
      } else if (item.status === "REJECTED") {
        rejected.push(item);
        rejectedCount++;
      }
      if (item.evidence_path) evidenceSet.add(item.evidence_path);
    }

    return {
      summary: {
        total: requests.length,
        pending: pendingCount,
        approved: approvedCount,
        evidence: evidenceSet.size,
      },
      pendingRequests: pending,
      approvedRequests: approved,
      rejectedRequests: rejected,
    };
  }, [requests]);

  const byDate = useMemo(() => {
    const dateMap = new Map<string, RiderOffRequest[]>();
    const baseDate = weekStart;
    // Pre-allocate all dates
    for (let day = 0; day < 7; day++) {
      const date = addDays(baseDate, day);
      const dateStr = format(date, "yyyy-MM-dd");
      dateMap.set(dateStr, []);
    }
    // Single pass to populate
    for (const item of requests) {
      const arr = dateMap.get(item.off_date);
      if (arr) arr.push(item);
    }
    return dateMap;
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
          <button type="button" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} aria-hidden="true" />Làm mới</button>
        </div>
      </section>

      {error ? <p className="off-schedule-error" role="alert">{error}</p> : null}

      <section className="off-schedule-metrics" aria-label="Tổng hợp tuần">
        <div><span>Tổng yêu cầu</span><strong>{summary.total}</strong><small>Trong tuần đang xem</small></div>
        <div><span>Chờ duyệt</span><strong>{summary.pending}</strong><small>Cần quyết định</small></div>
        <div><span>Đã xếp lịch</span><strong>{summary.approved}</strong><small>Đã ghi Attendance</small></div>
        <div><span>Có bằng chứng</span><strong>{summary.evidence}</strong><small>Ảnh đính kèm để kiểm tra</small></div>
      </section>

      <section className="off-schedule-board">
        <header><div><span>01 / DAILY LOAD</span><h2>Tải OFF theo ngày</h2><p>Không tự áp quota; số lượng là tín hiệu để điều phối viên cân đối.</p></div><CalendarClock size={22} aria-hidden="true" /></header>
        <div className="off-schedule-days">
          {Array.from(byDate.entries()).map(([date, items]) => (
            <DayCard key={date} date={date} items={items} />
          ))}
        </div>
      </section>

      <section className="off-schedule-queue">
        <header><div><span>02 / APPROVAL QUEUE</span><h2>Chờ duyệt</h2><p>Chỉ hiển thị những yêu cầu đang cần quyết định.</p></div><strong>{loading ? "Đang tải" : `${pendingRequests.length} mục`}</strong></header>
        {loading ? <LoadingRows /> : pendingRequests.length === 0 ? <EmptyState title="Không còn yêu cầu chờ duyệt" detail="Các yêu cầu đã xử lý được chuyển sang khu vực riêng bên dưới." /> : <RequestRows items={pendingRequests} canEdit={canEdit} busyId={busyId} mode="pending" onReview={review} />}
      </section>

      <section className="off-schedule-queue is-approved-zone">
        <header><div><span>03 / SCHEDULED OFF</span><h2>Đã xếp lịch</h2><p>Các ngày đã duyệt và đã ghi vào Attendance.</p></div><strong>{loading ? "Đang tải" : `${approvedRequests.length} mục`}</strong></header>
        {loading ? <LoadingRows /> : approvedRequests.length === 0 ? <EmptyState title="Chưa có lịch OFF được duyệt" detail="Yêu cầu sẽ xuất hiện tại đây ngay sau khi duyệt." /> : <RequestRows items={approvedRequests} canEdit={canEdit} busyId={busyId} mode="approved" onReview={review} />}
      </section>

      {rejectedRequests.length > 0 ? <details className="off-schedule-archive">
        <summary><span><Archive size={16} aria-hidden="true" />Yêu cầu đã từ chối</span><strong>{rejectedRequests.length}</strong></summary>
        <RequestRows items={rejectedRequests} canEdit={canEdit} busyId={busyId} mode="rejected" onReview={review} />
      </details> : null}
    </div>
  );
}

const RequestRow = memo(({ item, canEdit, busyId, mode, onReview, batchCount }: { item: RiderOffRequest; canEdit: boolean; busyId: string | null; mode: "pending" | "approved" | "rejected"; onReview: (item: RiderOffRequest, action: "APPROVE" | "REJECT" | "RESEND_EMAIL") => Promise<void>; batchCount: number }) => {
  const dateObj = useMemo(() => new Date(`${item.off_date}T00:00:00`), [item.off_date]);
  const dayStr = useMemo(() => format(dateObj, "dd"), [dateObj]);
  const monthStr = useMemo(() => format(dateObj, "MMM", { locale: vi }), [dateObj]);
  
  return <article className="off-schedule-request">
    <div className="off-schedule-date"><strong>{dayStr}</strong><span>{monthStr}</span></div>
    <div className="off-schedule-rider"><span>{item.rider_code}</span><h3>{item.rider?.full_name || "Chưa có tên rider"}</h3><p>{[item.rider?.kv, item.rider?.cot, item.rider?.delivery_district].filter(Boolean).join(" · ") || "Chưa có thông tin tuyến"}</p>{batchCount > 1 ? <small>Cùng đơn · {batchCount} ngày trong tuần</small> : null}</div>
    <div className="off-schedule-request-meta"><span className={`is-${item.request_type.toLowerCase()}`}>{typeLabel[item.request_type]}</span><strong>{shiftLabel[item.shift]}</strong><p>{item.reason || "Không có ghi chú"}</p>{item.evidence_url ? <a href={item.evidence_url} target="_blank" rel="noreferrer"><ImageIcon size={14} aria-hidden="true" />Xem bằng chứng</a> : <small>Không có ảnh bằng chứng</small>}{item.requester_email ? <small className="off-schedule-email-address">{item.requester_email}</small> : null}</div>
    <div className="off-schedule-decision"><span className={`is-${item.status.toLowerCase()}`}>{statusLabel[item.status]}</span>{mode !== "pending" ? <EmailState item={item} /> : null}{canEdit && mode === "pending" ? <div><button type="button" className="is-reject" disabled={busyId === item.id} onClick={() => void onReview(item, "REJECT")}><X size={15} aria-hidden="true" />Từ chối</button><button type="button" className="is-approve" disabled={busyId === item.id} onClick={() => void onReview(item, "APPROVE")}><Check size={15} aria-hidden="true" />Duyệt</button></div> : canEdit && mode === "approved" ? <div><button type="button" className="is-reject" disabled={busyId === item.id} onClick={() => void onReview(item, "REJECT")}><Undo2 size={15} aria-hidden="true" />Thu hồi lịch</button>{item.requester_email && item.email_notification_status !== "SENT" ? <button type="button" disabled={busyId === item.id} onClick={() => void onReview(item, "RESEND_EMAIL")}><Send size={15} aria-hidden="true" />Gửi lại email</button> : null}</div> : canEdit && mode === "rejected" && item.requester_email && item.email_notification_status !== "SENT" ? <div><button type="button" disabled={busyId === item.id} onClick={() => void onReview(item, "RESEND_EMAIL")}><Send size={15} aria-hidden="true" />Gửi lại email</button></div> : mode === "rejected" ? null : <small><ShieldAlert size={14} aria-hidden="true" />Chỉ xem</small>}</div>
  </article>;
});
RequestRow.displayName = "RequestRow";

const MemoRequestRow = memo(RequestRow);

function RequestRows({ items, canEdit, busyId, mode, onReview }: { items: RiderOffRequest[]; canEdit: boolean; busyId: string | null; mode: "pending" | "approved" | "rejected"; onReview: (item: RiderOffRequest, action: "APPROVE" | "REJECT" | "RESEND_EMAIL") => Promise<void> }) {
  const batchCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.batch_id, (counts.get(item.batch_id) ?? 0) + 1);
    return counts;
  }, [items]);

  return <div className="off-schedule-list">{items.map((item) => <MemoRequestRow key={item.id} item={item} canEdit={canEdit} busyId={busyId} mode={mode} onReview={onReview} batchCount={batchCounts.get(item.batch_id) ?? 0} />)}</div>;
}

const EmailState = memo(({ item }: { item: RiderOffRequest }) => {
  if (!item.requester_email) return <small className="off-schedule-email-state is-unsent"><MailWarning size={14} aria-hidden="true" />Không có email</small>;
  const sent = item.email_notification_status === "SENT";
  return <small className={`off-schedule-email-state ${sent ? "is-sent" : "is-unsent"}`} title={item.email_notification_error || undefined}>{sent ? <MailCheck size={14} aria-hidden="true" /> : <MailWarning size={14} aria-hidden="true" />}{sent ? "Email đã gửi" : item.email_notification_status === "NOT_CONFIGURED" ? "Email chưa cấu hình" : "Email chưa gửi"}</small>;
});
EmailState.displayName = "EmailState";

const DayCard = memo(({ date, items }: { date: string; items: RiderOffRequest[] }) => {
  const dateObj = useMemo(() => new Date(`${date}T00:00:00`), [date]);
  const dayName = useMemo(() => format(dateObj, "EEE", { locale: vi }), [dateObj]);
  const dayNum = useMemo(() => format(dateObj, "dd"), [dateObj]);
  const isToday = useMemo(() => date === format(new Date(), "yyyy-MM-dd"), [date]);
  const approved = useMemo(() => items.filter((item) => item.status === "APPROVED").length, [items]);
  
  return <div className={isToday ? "is-today" : ""}>
    <span>{dayName}</span>
    <strong>{dayNum}</strong>
    <p>{items.length} yêu cầu</p>
    <small>{approved} đã duyệt</small>
  </div>;
});
DayCard.displayName = "DayCard";

function LoadingRows() {
  return <div className="off-schedule-loading" aria-label="Đang tải"><span /><span /><span /></div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="off-schedule-empty"><CalendarClock size={24} aria-hidden="true" /><strong>{title}</strong><span>{detail}</span></div>;
}
