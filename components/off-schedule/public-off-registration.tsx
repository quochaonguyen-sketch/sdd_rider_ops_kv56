"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import { addMonths, eachDayOfInterval, endOfMonth, format, getDay, startOfMonth, subMonths } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarCheck2, Check, ChevronLeft, ChevronRight, Clock3, ImagePlus, LockKeyhole, Mail, ShieldCheck, Trash2 } from "lucide-react";

type FormState = {
  rider_code: string;
  rider_name: string;
  requester_email: string;
  shift: "FULL_DAY" | "MORNING" | "AFTERNOON";
  reason: string;
};

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const initialForm: FormState = {
  rider_code: "",
  rider_name: "",
  requester_email: "",
  shift: "FULL_DAY",
  reason: "",
};

export function PublicOffRegistration() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [selectedDates, setSelectedDates] = useState<string[]>([localDate(1)]);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [evidence, setEvidence] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ batchId: string; name: string | null; dates: string[]; email: string } | null>(null);
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const maxDate = useMemo(() => localDate(90), []);
  const calendarDays = useMemo(() => eachDayOfInterval({ start: startOfMonth(calendarMonth), end: endOfMonth(calendarMonth) }), [calendarMonth]);
  const leadingSlots = (getDay(startOfMonth(calendarMonth)) + 6) % 7;

  useEffect(() => {
    return () => { if (evidencePreview) URL.revokeObjectURL(evidencePreview); };
  }, [evidencePreview]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleDate(date: string) {
    setSelectedDates((current) => current.includes(date) ? current.filter((item) => item !== date) : [...current, date].sort());
  }

  function selectEvidence(file: File | null) {
    if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Bằng chứng phải là ảnh JPG, PNG hoặc WebP.");
      return;
    }
    if (file && file.size > 5 * 1024 * 1024) {
      setError("Ảnh bằng chứng tối đa 5 MB.");
      return;
    }
    setError(null);
    setEvidence(file);
    setEvidencePreview(file ? URL.createObjectURL(file) : null);
    if (!file && evidenceInputRef.current) evidenceInputRef.current.value = "";
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    if (selectedDates.length === 0) {
      setError("Vui lòng chọn ít nhất một ngày OFF.");
      setSubmitting(false);
      return;
    }
    const body = new FormData();
    body.set("rider_code", form.rider_code);
    body.set("rider_name", form.rider_name);
    body.set("requester_email", form.requester_email);
    body.set("off_dates", JSON.stringify(selectedDates));
    body.set("shift", form.shift);
    body.set("reason", form.reason);
    if (evidence) body.set("evidence", evidence);
    const response = await fetch("/api/public/off-requests", { method: "POST", body });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể gửi yêu cầu. Vui lòng thử lại.");
      setSubmitting(false);
      return;
    }
    setReceipt({ batchId: result.batch_id, name: result.rider_name, dates: result.off_dates, email: form.requester_email });
    setSubmitting(false);
  }

  return (
    <main className="off-public-page">
      <header className="off-public-header">
        <a href="/off-registration" className="off-public-brand" aria-label="Rider Operations">
          <span><CalendarCheck2 size={20} aria-hidden="true" /></span>
          <div><strong>Rider Operations</strong><small>KV5 + KV6 · SDD</small></div>
        </a>
        <div className="off-public-secure"><LockKeyhole size={14} aria-hidden="true" />Không cần đăng nhập</div>
      </header>

      <section className="off-public-layout">
        <aside className="off-public-brief">
          <p className="off-public-index">OFF REQUEST / 01</p>
          <h1>Đăng ký lịch OFF</h1>
          <p>Gửi ngày nghỉ để điều phối viên kiểm tra và xếp lịch. Yêu cầu chỉ có hiệu lực sau khi được duyệt.</p>
          <dl>
            <div><dt>01</dt><dd><strong>Xác minh rider</strong><span>Mã rider và họ tên đầy đủ.</span></dd></div>
            <div><dt>02</dt><dd><strong>Chọn nhiều ngày</strong><span>Một đơn OFF phép có thể gồm nhiều ngày.</span></dd></div>
            <div><dt>03</dt><dd><strong>Nhận kết quả</strong><span>Email báo ngay khi yêu cầu được duyệt hoặc từ chối.</span></dd></div>
          </dl>
          <div className="off-public-note"><ShieldCheck size={18} aria-hidden="true" /><span>Trang này không hiển thị dữ liệu hay lịch của rider khác.</span></div>
        </aside>

        <div className="off-public-workbench">
          {receipt ? (
            <section className="off-public-receipt" aria-live="polite">
              <span className="off-public-receipt-mark"><Check size={28} aria-hidden="true" /></span>
              <p>Đã ghi nhận yêu cầu</p>
              <h2>{receipt.name || form.rider_code}</h2>
              <div><span>Số ngày OFF</span><strong>{receipt.dates.length} ngày</strong></div>
              <div><span>Các ngày đã gửi</span><strong>{receipt.dates.map((date) => format(new Date(`${date}T00:00:00`), "dd/MM")).join(", ")}</strong></div>
              <div><span>Email nhận kết quả</span><strong>{receipt.email}</strong></div>
              <div><span>Mã đơn</span><strong>{receipt.batchId.slice(0, 8).toUpperCase()}</strong></div>
              <small>Trạng thái hiện tại: Chờ duyệt. Đây chưa phải xác nhận nghỉ chính thức.</small>
              <button type="button" onClick={() => { setReceipt(null); setForm(initialForm); setSelectedDates([localDate(1)]); selectEvidence(null); }}>Gửi yêu cầu khác</button>
            </section>
          ) : (
            <form className="off-public-form" onSubmit={submit}>
              <div className="off-public-form-head">
                <div><span>Biểu mẫu rider</span><h2>Thông tin đăng ký</h2></div>
                <Clock3 size={20} aria-hidden="true" />
              </div>
              <div className="off-public-fields is-two">
                <label><span>Mã rider</span><input required autoComplete="off" value={form.rider_code} onChange={(e) => update("rider_code", e.target.value.toUpperCase())} placeholder="VD: 196" /></label>
                <label><span>Họ tên đầy đủ</span><input required autoComplete="name" value={form.rider_name} onChange={(e) => update("rider_name", e.target.value)} placeholder="Nguyễn Văn A" /></label>
              </div>
              <div className="off-public-fields is-email"><label><span>Email nhận kết quả</span><div className="off-public-email-input"><Mail size={16} aria-hidden="true" /><input required type="email" autoComplete="email" value={form.requester_email} onChange={(e) => update("requester_email", e.target.value)} placeholder="rider@example.com" /></div><small>Hệ thống sẽ gửi mail khi yêu cầu được duyệt hoặc từ chối.</small></label></div>
              <section className="off-public-calendar" aria-label="Chọn nhiều ngày OFF">
                <header>
                  <div><span>Ngày OFF phép</span><strong>{selectedDates.length} ngày đã chọn</strong></div>
                  <div><button type="button" disabled={format(calendarMonth, "yyyy-MM") <= format(new Date(), "yyyy-MM")} aria-label="Tháng trước" onClick={() => setCalendarMonth((date) => subMonths(date, 1))}><ChevronLeft size={16} /></button><strong>{format(calendarMonth, "MMMM yyyy", { locale: vi })}</strong><button type="button" disabled={format(calendarMonth, "yyyy-MM") >= maxDate.slice(0, 7)} aria-label="Tháng sau" onClick={() => setCalendarMonth((date) => addMonths(date, 1))}><ChevronRight size={16} /></button></div>
                </header>
                <div className="off-public-calendar-weekdays">{["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => <span key={day}>{day}</span>)}</div>
                <div className="off-public-calendar-grid">
                  {Array.from({ length: leadingSlots }).map((_, index) => <span key={`empty-${index}`} aria-hidden="true" />)}
                  {calendarDays.map((day) => {
                    const date = format(day, "yyyy-MM-dd");
                    const selected = selectedDates.includes(date);
                    const disabled = date < localDate() || date > maxDate;
                    return <button key={date} type="button" disabled={disabled} aria-pressed={selected} className={selected ? "is-selected" : ""} onClick={() => toggleDate(date)}><span>{format(day, "d")}</span>{selected ? <Check size={12} aria-hidden="true" /> : null}</button>;
                  })}
                </div>
              </section>
              <div className="off-public-leave-line">
                <div><span>Loại OFF</span><strong>OFF phép</strong><small>Áp dụng cho toàn bộ ngày đã chọn</small></div>
                <label><span>Khung thời gian</span><select value={form.shift} onChange={(e) => update("shift", e.target.value as FormState["shift"])}><option value="FULL_DAY">Cả ngày</option><option value="MORNING">Buổi sáng</option><option value="AFTERNOON">Buổi chiều</option></select></label>
              </div>
              <label className="off-public-reason"><span>Lý do / ghi chú <small>không bắt buộc</small></span><textarea rows={4} maxLength={500} value={form.reason} onChange={(e) => update("reason", e.target.value)} placeholder="Thông tin giúp điều phối viên xét duyệt..." /></label>
              <section className="off-public-evidence">
                <input ref={evidenceInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectEvidence(event.target.files?.[0] ?? null)} />
                {evidencePreview ? <div className="off-public-evidence-preview"><NextImage unoptimized width={64} height={64} src={evidencePreview} alt="Ảnh bằng chứng đã chọn" /><div><strong>{evidence?.name}</strong><span>{evidence ? `${(evidence.size / 1024 / 1024).toFixed(1)} MB` : ""}</span></div><button type="button" aria-label="Xóa ảnh bằng chứng" onClick={() => selectEvidence(null)}><Trash2 size={16} /></button></div> : <button className="off-public-evidence-picker" type="button" onClick={() => evidenceInputRef.current?.click()}><ImagePlus size={19} aria-hidden="true" /><span><strong>Thêm ảnh bằng chứng</strong><small>JPG, PNG hoặc WebP · tối đa 5 MB</small></span></button>}
              </section>
              <p className="off-public-helper">Yêu cầu trùng ngày sẽ không được tạo thêm. Ảnh bằng chứng là tùy chọn.</p>
              {error ? <p className="off-public-error" role="alert">{error}</p> : null}
              <button className="off-public-submit" type="submit" disabled={submitting}>{submitting ? "Đang gửi..." : "Gửi yêu cầu OFF"}</button>
            </form>
          )}
        </div>
      </section>
      <footer className="off-public-footer"><span>SDD Rider Operations</span><span>Yêu cầu được lưu để phục vụ xếp lịch nội bộ.</span></footer>
    </main>
  );
}
