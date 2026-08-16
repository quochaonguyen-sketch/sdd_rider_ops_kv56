"use client";

import { useMemo, useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, startOfMonth, subMonths } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarDays, CalendarSearch, ChevronLeft, ChevronRight } from "lucide-react";

type AttendanceLog = { id: string; work_date: string; status: string };
type LookupResult = { rider_code: string; logs: AttendanceLog[] };
const weekdayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function statusLabel(status: string) {
  const normalized = status.trim().toUpperCase();
  if (normalized === "OFF_WEEKLY") return "OFF tuần";
  if (normalized === "OFF_APPROVED") return "OFF phép";
  if (normalized === "OFF_UNEXPECTED") return "Đột xuất";
  if (normalized === "WORKING_REST_DAY") return "Đi làm ngày OFF";
  if (normalized === "NO_PICKUP") return "Không đi pick";
  if (normalized === "NO_DELIVERY") return "Không đi giao";
  return normalized || "Lịch khác";
}

function statusTone(status: string) {
  const normalized = status.trim().toUpperCase();
  if (normalized === "OFF_APPROVED") return "approved";
  if (normalized === "OFF_UNEXPECTED") return "rejected";
  if (normalized === "OFF_WEEKLY") return "pending";
  return "neutral";
}

export function PublicOffLookup() {
  const [riderCode, setRiderCode] = useState("");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);
  const leadingBlanks = useMemo(() => (getDay(startOfMonth(month)) + 6) % 7, [month]);
  const requestByDate = useMemo(() => new Map(result?.logs.map((item) => [item.work_date, item]) ?? []), [result]);

  async function lookup(code = riderCode, targetMonth = month) {
    const rider = code.trim();
    if (!rider) return;
    setLoading(true); setError(null);
    const query = new URLSearchParams({ rider_code: rider, month: format(targetMonth, "yyyy-MM") });
    const response = await fetch(`/api/public/off-requests?${query}`, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    setLoading(false);
    if (!response.ok || !data?.success) { setResult(null); setError(data?.error ?? "Không thể tra cứu lịch OFF. Vui lòng thử lại."); return; }
    setResult(data);
  }

  function changeMonth(nextMonth: Date) { setMonth(nextMonth); if (result) void lookup(riderCode, nextMonth); }

  return <main className="off-public-page off-lookup-page">
    <header className="off-public-header"><a href="/off-lookup" className="off-public-brand" aria-label="Rider Operations"><span><CalendarDays size={20} aria-hidden="true" /></span><div><strong>Rider Operations</strong><small>KV5 + KV6 · SDD</small></div></a><a className="off-lookup-register-link" href="/off-registration">Đăng ký lịch OFF</a></header>
    <section className="off-lookup-shell">
      <div className="off-lookup-intro"><p>OFF LOOKUP</p><h1>Tra cứu lịch OFF</h1><span>Nhập mã rider để xem lịch nghỉ theo tháng.</span></div>
      <form className="off-lookup-form" onSubmit={(event) => { event.preventDefault(); void lookup(); }}><label><span>Mã rider</span><div className="off-lookup-input-row"><input required autoComplete="off" value={riderCode} onChange={(event) => setRiderCode(event.target.value.toUpperCase())} placeholder="VD: 196" /><button type="submit" disabled={loading}>{loading ? "Đang tra" : "Tra cứu"}</button></div></label>{error ? <p className="off-public-error" role="alert">{error}</p> : null}</form>
      {result ? <section className="off-lookup-calendar" aria-live="polite">
        <header><div><span>Rider</span><h2>{result.rider_code}</h2></div><div className="off-lookup-month-control"><button type="button" aria-label="Tháng trước" onClick={() => changeMonth(subMonths(month, 1))}><ChevronLeft size={16} /></button><strong>{format(month, "MMMM yyyy", { locale: vi })}</strong><button type="button" aria-label="Tháng sau" onClick={() => changeMonth(addMonths(month, 1))}><ChevronRight size={16} /></button></div></header>
        <div className="off-lookup-legend"><span className="is-pending">OFF tuần</span><span className="is-approved">OFF phép</span><span className="is-rejected">Đột xuất</span></div>
        <div className="off-lookup-weekdays">{weekdayLabels.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="off-lookup-calendar-grid">{Array.from({ length: leadingBlanks }).map((_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}{days.map((day) => { const date = format(day, "yyyy-MM-dd"); const item = requestByDate.get(date); const label = item ? statusLabel(item.status) : ""; return <div key={date} className={`off-lookup-day${item ? ` is-${statusTone(item.status)}` : ""}`}><time dateTime={date}>{format(day, "d")}</time>{item ? <span title={label}>{label}</span> : null}</div>; })}</div>
        <p className="off-lookup-calendar-note"><CalendarSearch size={15} aria-hidden="true" />Lịch vận hành thực tế từ Attendance, chỉ để xem.</p>
      </section> : null}
    </section>
    <footer className="off-public-footer"><span>SDD Rider Operations</span><span>Lịch OFF được cập nhật sau khi điều phối viên xử lý yêu cầu.</span></footer>
  </main>;
}
