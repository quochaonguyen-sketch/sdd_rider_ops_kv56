import { cn } from "@/utils/cn";

export function RiderLoaderVisual({ compact = false }: { compact?: boolean }) {
  return (
    <span className={cn("rider-loader-surface", compact && "is-compact")}>
      <span className="rider-loader-track" aria-hidden="true">
        <span className="rider-loader-bike">
          <svg viewBox="0 0 160 90" fill="none">
            <g className="rider-loader-body">
              <g className="rider-loader-wheel" style={{ transformOrigin: "37px 67px" }}>
                <circle cx="37" cy="67" r="18" fill="var(--color-paper)" fillOpacity=".72" stroke="var(--color-ink-2)" strokeWidth="4" />
                <path d="M37 51v32M21 67h32M26 56l22 22M48 56 26 78" stroke="var(--color-rule-strong)" strokeWidth="1.5" />
              </g>
              <g className="rider-loader-wheel" style={{ transformOrigin: "123px 67px" }}>
                <circle cx="123" cy="67" r="18" fill="var(--color-paper)" fillOpacity=".72" stroke="var(--color-ink-2)" strokeWidth="4" />
                <path d="M123 51v32M107 67h32M112 56l22 22M134 56l-22 22" stroke="var(--color-rule-strong)" strokeWidth="1.5" />
              </g>

              <path d="M37 67h34l19-27h27l6 27" stroke="var(--color-ink-2)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M65 67 55 48h39l14 19H65Z" fill="var(--color-note-accent)" stroke="var(--color-note-accent)" strokeWidth="3" strokeLinejoin="round" />
              <path d="M108 40 99 28h16M113 40h18" stroke="var(--color-ink-2)" strokeWidth="4" strokeLinecap="round" />
              <path d="M30 48h28" stroke="var(--color-ink-2)" strokeWidth="5" strokeLinecap="round" />
              <rect x="22" y="35" width="33" height="20" rx="4" fill="var(--color-note-accent)" />
              <path d="M27 40h23M27 45h16" stroke="var(--color-accent-ink)" strokeOpacity=".8" strokeWidth="2" strokeLinecap="round" />

              <path d="m88 19 16 15-11 15M88 20 72 43" stroke="var(--color-ink-2)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M76 17c5-7 18-6 21 3l-3 18H76l-5-14 5-7Z" fill="var(--color-note-accent)" />
              <text x="78" y="31" fill="var(--color-accent-ink)" fontSize="9" fontWeight="800">SPX</text>
              <circle cx="84" cy="9" r="8" fill="var(--color-note-soft)" />
              <path d="M75 8c2-9 16-10 20 0l-4 3H76l-1-3Z" fill="var(--color-note-accent)" />
              <path d="M93 8h8" stroke="var(--color-note-accent)" strokeWidth="3" strokeLinecap="round" />
            </g>
          </svg>
        </span>
        <span className="rider-loader-road-track">
          <span className="rider-loader-road" />
        </span>
      </span>
      <span className="rider-loader-title">Đang tải dữ liệu vận hành</span>
      <span className="rider-loader-caption">SPX rider đang tới...</span>
    </span>
  );
}

export function RiderPageLoader() {
  return (
    <div className="rider-page-loader" role="status" aria-live="polite" aria-label="Đang tải dữ liệu">
      <RiderLoaderVisual />
    </div>
  );
}
