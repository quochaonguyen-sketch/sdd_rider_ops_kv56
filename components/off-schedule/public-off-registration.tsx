"use client";

import { useMemo, useState } from "react";
import { CalendarCheck2, Check, Clock3, LockKeyhole, ShieldCheck } from "lucide-react";

type FormState = {
  rider_code: string;
  rider_name: string;
  off_date: string;
  request_type: "WEEKLY" | "PLANNED" | "EMERGENCY";
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
  off_date: localDate(1),
  request_type: "WEEKLY",
  shift: "FULL_DAY",
  reason: "",
};

export function PublicOffRegistration() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; name: string | null; date: string } | null>(null);
  const maxDate = useMemo(() => localDate(90), []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const response = await fetch("/api/public/off-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể gửi yêu cầu. Vui lòng thử lại.");
      setSubmitting(false);
      return;
    }
    setReceipt({ id: result.request_id, name: result.rider_name, date: result.off_date });
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
            <div><dt>02</dt><dd><strong>Chọn lịch nghỉ</strong><span>Ngày, loại OFF và khung thời gian.</span></dd></div>
            <div><dt>03</dt><dd><strong>Chờ phê duyệt</strong><span>Điều phối viên ghi lịch vào bảng công.</span></dd></div>
          </dl>
          <div className="off-public-note"><ShieldCheck size={18} aria-hidden="true" /><span>Trang này không hiển thị dữ liệu hay lịch của rider khác.</span></div>
        </aside>

        <div className="off-public-workbench">
          {receipt ? (
            <section className="off-public-receipt" aria-live="polite">
              <span className="off-public-receipt-mark"><Check size={28} aria-hidden="true" /></span>
              <p>Đã ghi nhận yêu cầu</p>
              <h2>{receipt.name || form.rider_code}</h2>
              <div><span>Ngày OFF</span><strong>{new Intl.DateTimeFormat("vi-VN").format(new Date(`${receipt.date}T00:00:00`))}</strong></div>
              <div><span>Mã yêu cầu</span><strong>{receipt.id.slice(0, 8).toUpperCase()}</strong></div>
              <small>Trạng thái hiện tại: Chờ duyệt. Đây chưa phải xác nhận nghỉ chính thức.</small>
              <button type="button" onClick={() => { setReceipt(null); setForm({ ...initialForm, off_date: localDate(1) }); }}>Gửi yêu cầu khác</button>
            </section>
          ) : (
            <form className="off-public-form" onSubmit={submit}>
              <div className="off-public-form-head">
                <div><span>Biểu mẫu rider</span><h2>Thông tin đăng ký</h2></div>
                <Clock3 size={20} aria-hidden="true" />
              </div>
              <div className="off-public-fields is-two">
                <label><span>Mã rider</span><input required autoComplete="off" value={form.rider_code} onChange={(e) => update("rider_code", e.target.value.toUpperCase())} placeholder="VD: SPXVN..." /></label>
                <label><span>Họ tên đầy đủ</span><input required autoComplete="name" value={form.rider_name} onChange={(e) => update("rider_name", e.target.value)} placeholder="Nguyễn Văn A" /></label>
              </div>
              <div className="off-public-fields is-two">
                <label><span>Ngày OFF</span><input required type="date" min={localDate()} max={maxDate} value={form.off_date} onChange={(e) => update("off_date", e.target.value)} /></label>
                <label><span>Khung thời gian</span><select value={form.shift} onChange={(e) => update("shift", e.target.value as FormState["shift"])}><option value="FULL_DAY">Cả ngày</option><option value="MORNING">Buổi sáng</option><option value="AFTERNOON">Buổi chiều</option></select></label>
              </div>
              <fieldset className="off-public-types">
                <legend>Loại OFF</legend>
                {[
                  ["WEEKLY", "OFF tuần", "Ngày nghỉ định kỳ"],
                  ["PLANNED", "OFF phép", "Đã có kế hoạch"],
                  ["EMERGENCY", "OFF đột xuất", "Tình huống khẩn"],
                ].map(([value, label, hint]) => <label key={value} className={form.request_type === value ? "is-selected" : ""}><input type="radio" name="request_type" value={value} checked={form.request_type === value} onChange={() => update("request_type", value as FormState["request_type"])} /><strong>{label}</strong><span>{hint}</span></label>)}
              </fieldset>
              <label className="off-public-reason"><span>Lý do / ghi chú <small>không bắt buộc</small></span><textarea rows={4} maxLength={500} value={form.reason} onChange={(e) => update("reason", e.target.value)} placeholder="Thông tin giúp điều phối viên xét duyệt..." /></label>
              <p className="off-public-helper">Yêu cầu trùng ngày sẽ không được tạo thêm.</p>
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
