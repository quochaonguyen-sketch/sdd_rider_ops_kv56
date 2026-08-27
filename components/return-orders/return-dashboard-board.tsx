/* Hallmark · component: return-dashboard-board · genre: modern-minimal · theme: Cobalt adapted
 * pre-emit critique: P5 H5 E5 S5 R5 V5 · contrast: pass (40-41) · tokens: pass (48)
 * mobile: pass (34, 49–57)
 */
import { Activity, Clock3, Layers3, MapPinned, PackageCheck, PackageSearch, TrendingUp, Truck } from "lucide-react";
import type { ReturnDashboardData } from "@/lib/return-orders/return-orders";

function fmtSnapshot(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function ReturnDashboardBoard({ data }: { data: ReturnDashboardData }) {
  const maxDistrict = Math.max(1, ...data.districts.map((d) => d.total));
  const maxZone = Math.max(1, ...data.zones.map((z) => z.total));
  const maxWard = Math.max(1, ...data.wards.map((w) => w.total));

  const total = data.total || 1;

  return (
    <section className="return-dashboard-board" aria-labelledby="return-dashboard-title">
      {/* Hero - graphite like pivot page */}
      <div className="return-dashboard-hero">
        <div className="return-dashboard-hero-main">
          <p className="return-dashboard-kicker">RETURN INTELLIGENCE · KHU VỰC 5 — 6</p>
          <h2 id="return-dashboard-title">Tổng quan hàng trả</h2>
          <p className="return-dashboard-desc">
            Snapshot trực quan toàn bộ đơn tồn & đang trả — phân bổ theo quận, zone trả, COT và tuổi đơn. Dùng để cân tải trước khi vào bảng gán.
          </p>
          <div className="return-dashboard-hero-meta">
            <span>
              <Clock3 size={12} aria-hidden="true" /> Snapshot {fmtSnapshot(data.snapshotAt)}
            </span>
            <span>
              <PackageSearch size={12} aria-hidden="true" /> {data.total.toLocaleString("vi-VN")} đơn
            </span>
            <span>
              <Truck size={12} aria-hidden="true" /> {data.topRiders.length} rider có hàng
            </span>
          </div>
        </div>
        <div className="return-dashboard-hero-stats">
          <div className="is-primary">
            <small>Tỷ lệ đã gán</small>
            <strong>{data.total ? Math.round((data.assigned / data.total) * 100) : 0}%</strong>
            <span className="return-dashboard-hero-bar" aria-hidden="true">
              <i style={{ width: `${data.total ? (data.assigned / data.total) * 100 : 0}%` }} />
            </span>
            <small>
              {data.assigned.toLocaleString("vi-VN")} đã gán · {data.unassigned.toLocaleString("vi-VN")} chưa phân
            </small>
          </div>
          <div>
            <small>COT đã gán</small>
            <strong>
              {data.assigned ? `${Math.round((data.cot.cot1 / data.assigned) * 100)}% COT1` : "—"}
            </strong>
            <small>
              COT1 {data.cot.cot1} · COT2 {data.cot.cot2} · Chưa rõ {data.cot.unassigned}
            </small>
          </div>
        </div>
      </div>

      {/* KPI 4 */}
      <div className="return-dashboard-kpis" role="list" aria-label="Chỉ số chính">
        <article className="return-dashboard-kpi is-accent" role="listitem">
          <span className="return-dashboard-kpi-icon">
            <Layers3 size={16} aria-hidden="true" />
          </span>
          <div>
            <small>Tổng đơn</small>
            <strong>{data.total.toLocaleString("vi-VN")}</strong>
            <span>Tồn {data.backlog} · Đang trả {data.returning}</span>
          </div>
        </article>
        <article className="return-dashboard-kpi is-warning" role="listitem">
          <span className="return-dashboard-kpi-icon">
            <PackageCheck size={16} aria-hidden="true" />
          </span>
          <div>
            <small>Chưa phân</small>
            <strong>{data.unassigned.toLocaleString("vi-VN")}</strong>
            <span>{data.total ? Math.round((data.unassigned / data.total) * 100) : 0}% tổng</span>
          </div>
        </article>
        <article className="return-dashboard-kpi" role="listitem">
          <span className="return-dashboard-kpi-icon">
            <Activity size={16} aria-hidden="true" />
          </span>
          <div>
            <small>Đã gán</small>
            <strong>{data.assigned.toLocaleString("vi-VN")}</strong>
            <span>COT1 {data.cot.cot1} · COT2 {data.cot.cot2}</span>
          </div>
        </article>
        <article className="return-dashboard-kpi" role="listitem">
          <span className="return-dashboard-kpi-icon">
            <MapPinned size={16} aria-hidden="true" />
          </span>
          <div>
            <small>Khu vực</small>
            <strong>
              {data.kv.kv5 + data.kv.kv6 > 0 ? `KV5 ${data.kv.kv5} · KV6 ${data.kv.kv6}` : `${data.districts.length} quận`}
            </strong>
            <span>{data.zones.length} zone trả · {data.wards.length} phường top</span>
          </div>
        </article>
      </div>

      {/* Row 2: Donuts + District bar */}
      <div className="return-dashboard-grid is-three">
        <article className="return-dashboard-card">
          <header>
            <div>
              <p>01 — PHÂN BỔ</p>
              <h3>Theo COT</h3>
            </div>
            <span className="return-dashboard-card-count">{data.assigned} đơn</span>
          </header>
          <Donut
            total={Math.max(1, data.cot.cot1 + data.cot.cot2 + data.cot.unassigned)}
            segments={[
              { label: "COT1", value: data.cot.cot1, color: "var(--color-chart-1)" },
              { label: "COT2", value: data.cot.cot2, color: "var(--color-chart-2)" },
              { label: "Chưa rõ", value: data.cot.unassigned, color: "var(--color-paper-3)" },
            ]}
            centerLabel="đã gán"
          />
          <ul className="return-dashboard-legend">
            <li>
              <i style={{ background: "var(--color-chart-1)" }} /> COT1 <strong>{data.cot.cot1}</strong>
            </li>
            <li>
              <i style={{ background: "var(--color-chart-2)" }} /> COT2 <strong>{data.cot.cot2}</strong>
            </li>
            <li>
              <i style={{ background: "var(--color-paper-3)", border: "1px solid var(--color-rule)" }} /> Chưa rõ{" "}
              <strong>{data.cot.unassigned}</strong>
            </li>
          </ul>
        </article>

        <article className="return-dashboard-card">
          <header>
            <div>
              <p>02 — TRẠNG THÁI</p>
              <h3>Tồn vs Đang trả</h3>
            </div>
            <span className="return-dashboard-card-count">{data.total} đơn</span>
          </header>
          <Donut
            total={Math.max(1, data.backlog + data.returning)}
            segments={[
              { label: "Tồn", value: data.backlog, color: "var(--color-warning)" },
              { label: "Đang trả", value: data.returning, color: "var(--color-accent)" },
            ]}
            centerLabel="tổng"
          />
          <ul className="return-dashboard-legend">
            <li>
              <i style={{ background: "var(--color-warning)" }} /> Tồn <strong>{data.backlog}</strong>
            </li>
            <li>
              <i style={{ background: "var(--color-accent)" }} /> Đang trả <strong>{data.returning}</strong>
            </li>
          </ul>
        </article>

        <article className="return-dashboard-card is-wide">
          <header>
            <div>
              <p>03 — ĐỊA BÀN</p>
              <h3>Theo quận</h3>
            </div>
            <span className="return-dashboard-card-count">{data.districts.length} quận</span>
          </header>
          <div className="return-dashboard-bars">
            {data.districts.slice(0, 6).map((d) => (
              <div key={d.name} className="return-dashboard-bar-row">
                <span className="return-dashboard-bar-label">{d.name}</span>
                <span className="return-dashboard-bar-track">
                  <i style={{ width: `${(d.total / maxDistrict) * 100}%` }} />
                </span>
                <strong>{d.total}</strong>
                <small>{Math.round((d.total / total) * 100)}%</small>
              </div>
            ))}
            {!data.districts.length ? <p className="return-dashboard-empty">Chưa có dữ liệu quận.</p> : null}
          </div>
        </article>
      </div>

      {/* Row 3: Zone + Wards */}
      <div className="return-dashboard-grid is-two">
        <article className="return-dashboard-card">
          <header>
            <div>
              <p>04 — TUYẾN TRẢ</p>
              <h3>Top zone trả</h3>
            </div>
            <span className="return-dashboard-card-count">{data.zones.length} zone</span>
          </header>
          <div className="return-dashboard-bars is-zones">
            {data.zones.map((z, i) => (
              <div key={z.name} className="return-dashboard-bar-row">
                <span className="return-dashboard-bar-rank">{String(i + 1).padStart(2, "0")}</span>
                <span className="return-dashboard-bar-label is-zone">{z.name}</span>
                <span className="return-dashboard-bar-track is-zone">
                  <i style={{ width: `${(z.total / maxZone) * 100}%`, background: `var(--color-chart-${(i % 5) + 1})` }} />
                </span>
                <strong>{z.total}</strong>
              </div>
            ))}
            {!data.zones.length ? <p className="return-dashboard-empty">Chưa có zone trả.</p> : null}
          </div>
        </article>

        <article className="return-dashboard-card">
          <header>
            <div>
              <p>05 — PHƯỜNG NÓNG</p>
              <h3>Top phường tồn nhiều</h3>
            </div>
            <TrendingUp size={16} aria-hidden="true" />
          </header>
          <div className="return-dashboard-bars is-wards">
            {data.wards.map((w, i) => (
              <div key={`${w.district}-${w.ward}`} className="return-dashboard-bar-row is-ward">
                <span className="return-dashboard-bar-rank">{String(i + 1).padStart(2, "0")}</span>
                <span className="return-dashboard-bar-label is-ward">
                  {w.ward}
                  <em>{w.district}</em>
                </span>
                <span className="return-dashboard-bar-track is-ward">
                  <i style={{ width: `${(w.total / maxWard) * 100}%`, background: `var(--color-chart-${(i % 5) + 1})` }} />
                </span>
                <strong>{w.total}</strong>
              </div>
            ))}
            {!data.wards.length ? <p className="return-dashboard-empty">Chưa có phường.</p> : null}
          </div>
        </article>
      </div>

      {/* Row 4: Aging + Top riders */}
      <div className="return-dashboard-grid is-two">
        <article className="return-dashboard-card">
          <header>
            <div>
              <p>06 — TUỔI ĐƠN</p>
              <h3>Aging tồn kho</h3>
            </div>
            <Clock3 size={16} aria-hidden="true" />
          </header>
          <div className="return-dashboard-aging">
            {[
              { label: "<1 ngày", value: data.aging.fresh, tone: "fresh" },
              { label: "1–5 ngày", value: data.aging.warning, tone: "warning" },
              { label: ">5 ngày", value: data.aging.danger, tone: "danger" },
              { label: "Chưa rõ", value: data.aging.unknown, tone: "muted" },
            ].map((b) => {
              const max = Math.max(1, data.aging.fresh + data.aging.warning + data.aging.danger + data.aging.unknown);
              return (
                <div key={b.label} className="return-dashboard-aging-row">
                  <span className="return-dashboard-aging-label">{b.label}</span>
                  <span className="return-dashboard-aging-track">
                    <i className={`is-${b.tone}`} style={{ width: `${(b.value / max) * 100}%` }} />
                  </span>
                  <strong>{b.value}</strong>
                  <small>{data.total ? Math.round((b.value / data.total) * 100) : 0}%</small>
                </div>
              );
            })}
          </div>
          <p className="return-dashboard-hint">Tính từ `create_time` đến hiện tại. &gt;5 ngày cần ưu tiên xử lý.</p>
        </article>

        <article className="return-dashboard-card">
          <header>
            <div>
              <p>07 — RIDER TẢI NẶNG</p>
              <h3>Top rider gán nhiều</h3>
            </div>
            <span className="return-dashboard-card-count">{data.topRiders.length} rider</span>
          </header>
          {data.topRiders.length ? (
            <ol className="return-dashboard-rider-list">
              {data.topRiders.map((r, i) => (
                <li key={r.riderCode}>
                  <span className="return-dashboard-rider-rank">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{r.riderName}</strong>
                    <span>
                      {r.riderCode} · {r.kv || "—"} · {r.cot || "—"}
                    </span>
                  </div>
                  <strong className="return-dashboard-rider-total">{r.total}</strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="return-dashboard-empty">Chưa có rider được gán.</p>
          )}
        </article>
      </div>
    </section>
  );
}

function Donut({
  total,
  segments,
  centerLabel,
}: {
  total: number;
  segments: Array<{ label: string; value: number; color: string }>;
  centerLabel: string;
}) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const filtered = segments.filter((s) => s.value > 0);
  const sum = filtered.reduce((a, s) => a + s.value, 0) || 1;

  return (
    <div className="return-dashboard-donut">
      <svg viewBox="0 0 120 120" width={120} height={120} role="img" aria-label="Biểu đồ tròn">
        <circle cx={60} cy={60} r={radius} fill="none" stroke="var(--color-paper-3)" strokeWidth={14} />
        {filtered.map((seg) => {
          const len = (seg.value / sum) * circumference;
          const dash = `${len} ${circumference - len}`;
          const el = (
            <circle
              key={seg.label}
              cx={60}
              cy={60}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={14}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform="rotate(-90 60 60)"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="return-dashboard-donut-center">
        <strong>{total.toLocaleString("vi-VN")}</strong>
        <span>{centerLabel}</span>
      </div>
    </div>
  );
}
