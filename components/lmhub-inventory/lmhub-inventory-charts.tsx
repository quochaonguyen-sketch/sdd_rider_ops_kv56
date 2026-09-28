"use client";

import { cn } from "@/utils/cn";

export type Area = "KV5" | "KV6";
export type HeatBin = { key: string; label: string; count: number; className: string };
export type BarRow = { label: string; area: Area; value: number };

export function ChartHead({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="px-5 py-4">
      <h2 className="text-sm font-bold tracking-tight text-[var(--color-ink)]">{title}</h2>
      <p className="text-xs text-[var(--color-muted)]">{caption}</p>
    </div>
  );
}

export function Donut({ kv5, kv6 }: { kv5: number; kv6: number }) {
  const total = kv5 + kv6;
  const r = 36;
  const c = 2 * Math.PI * r;
  const a = total ? (kv5 / total) * c : 0;
  return (
    <svg viewBox="0 0 96 96" className="h-24 w-24 shrink-0">
      <circle cx="48" cy="48" r={r} fill="none" stroke="var(--color-paper-3)" strokeWidth="10" />
      <circle cx="48" cy="48" r={r} fill="none" stroke="var(--color-accent)" strokeWidth="10" strokeDasharray={`${a} ${c}`} strokeLinecap="round" transform="rotate(-90 48 48)" />
      <circle cx="48" cy="48" r={r} fill="none" stroke="var(--color-success)" strokeWidth="10" strokeDasharray={`${total ? (kv6 / total) * c : 0} ${c}`} strokeDashoffset={-a} strokeLinecap="round" transform="rotate(-90 48 48)" />
      <text x="48" y="46" textAnchor="middle" className="fill-[var(--color-ink)]" fontSize="13" fontWeight="700">{total.toLocaleString("vi-VN")}</text>
      <text x="48" y="60" textAnchor="middle" className="fill-[var(--color-muted)]" fontSize="8">đơn</text>
    </svg>
  );
}

export function ShareRow({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const width = total > 0 ? Math.max(4, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-semibold text-[var(--color-ink)]">{label}</span>
        <span className="font-mono text-[var(--color-ink-2)]">{value.toLocaleString("vi-VN")} · {total ? Math.round((value / total) * 100) : 0}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-paper-3)]">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: tone }} />
      </div>
    </div>
  );
}

export function BarChart({ rows }: { rows: BarRow[] }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-[var(--color-muted)]">Chưa có dữ liệu quận.</p>;
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const width = Math.max(6, Math.round((row.value / max) * 100));
        const tone = row.value >= 36 ? "bg-[var(--color-error)]" : row.value >= 6 ? "bg-[var(--color-warning)]" : "bg-[var(--color-success)]";
        return (
          <div key={`${row.area}-${row.label}`} className="grid grid-cols-[minmax(0,9.5rem)_1fr_3.2rem] items-center gap-2">
            <p className="truncate text-xs font-medium text-[var(--color-ink)]">
              <span className="mr-1 text-[10px] font-semibold uppercase text-[var(--color-muted)]">{row.area}</span>{row.label}
            </p>
            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--color-paper-3)]">
              <div className={cn("h-full rounded-full", tone)} style={{ width: `${width}%` }} />
            </div>
            <p className="text-right font-mono text-xs font-semibold text-[var(--color-ink)]">{row.value.toLocaleString("vi-VN")}</p>
          </div>
        );
      })}
    </div>
  );
}

export function RiskStrip({ bins }: { bins: HeatBin[] }) {
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[var(--color-paper-3)]">
        {bins.map((bin) => (
          <div key={bin.key} className={bin.className} style={{ width: `${total ? (bin.count / total) * 100 : 0}%` }} title={`${bin.label}: ${bin.count}`} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {bins.map((bin) => (
          <div key={bin.key} className="rounded-lg bg-[var(--color-paper-2)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{bin.label}</p>
            <p className="font-mono text-lg font-bold text-[var(--color-ink)]">{bin.count}</p>
            <p className="text-[11px] text-[var(--color-muted)]">{total ? Math.round((bin.count / total) * 100) : 0}% phường</p>
          </div>
        ))}
      </div>
    </div>
  );
}
