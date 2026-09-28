"use client";

import { cn } from "@/utils/cn";
import { formatDateTime, visibleCount, visibleTotal, heatClass, addCounts, emptyCounts, type CotFilter, type DistrictAgg, type WardAgg } from "@/components/lmhub-inventory/lmhub-inventory-model";

export function AreaBoard({ title, districts, cot, selected, onSelect, updatedAt }: { title: string; districts: DistrictAgg[]; cot: CotFilter; selected: WardAgg | null; onSelect: (ward: WardAgg) => void; updatedAt: string | null }) {
  const grand = districts.reduce((sum, item) => addCounts(sum, item.totals), emptyCounts());
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className="flex items-center justify-between bg-[var(--color-graphite)] px-4 py-3 text-[var(--color-graphite-ink)]">
        <div>
          <h2 className="text-sm font-bold tracking-tight">{title}</h2>
          <p className="text-[11px] font-medium text-[var(--color-graphite-ink)]/70">Cập nhật {formatDateTime(updatedAt)}</p>
        </div>
        <span className="font-mono text-sm font-semibold">{visibleTotal(grand, cot).toLocaleString("vi-VN")} đơn</span>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--color-paper-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Quận / Phường</th>
              <th className="w-20 px-3 py-2.5 text-right font-semibold">COT 1</th>
              <th className="w-20 px-3 py-2.5 text-right font-semibold">COT 2</th>
              <th className="w-24 px-3 py-2.5 text-right font-semibold">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {!districts.length ? <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">Không có dòng khớp lọc.</td></tr> : districts.map((district) => <DistrictRows key={`${district.area}-${district.district}`} district={district} cot={cot} selected={selected} onSelect={onSelect} />)}
            {districts.length ? (
              <tr className="border-t border-[var(--color-rule-strong)] bg-[var(--color-paper-3)]">
                <td className="px-4 py-3 font-bold text-[var(--color-ink)]">Tổng {title}</td>
                <td className="px-3 py-3 text-right font-mono font-bold">{visibleCount(grand, "cot1", cot).toLocaleString("vi-VN")}</td>
                <td className="px-3 py-3 text-right font-mono font-bold">{visibleCount(grand, "cot2", cot).toLocaleString("vi-VN")}</td>
                <HeatCell value={visibleTotal(grand, cot)} strong />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DistrictRows({ district, cot, selected, onSelect }: { district: DistrictAgg; cot: CotFilter; selected: WardAgg | null; onSelect: (ward: WardAgg) => void }) {
  return (
    <>
      <tr className="border-t border-[var(--color-rule)] bg-[var(--color-accent-soft)]">
        <td className="px-4 py-2.5 font-bold text-[var(--color-accent)]">{district.district}</td>
        <td className="px-3 py-2.5 text-right font-mono font-semibold text-[var(--color-ink)]">{visibleCount(district.totals, "cot1", cot).toLocaleString("vi-VN")}</td>
        <td className="px-3 py-2.5 text-right font-mono font-semibold text-[var(--color-ink)]">{visibleCount(district.totals, "cot2", cot).toLocaleString("vi-VN")}</td>
        <HeatCell value={visibleTotal(district.totals, cot)} strong />
      </tr>
      {district.wards.map((ward) => {
        const active = selected?.area === ward.area && selected.district === ward.district && selected.ward === ward.ward;
        return (
          <tr key={ward.ward} onClick={() => onSelect(ward)} className={cn("cursor-pointer border-t border-[var(--color-rule)] hover:bg-[var(--color-paper-2)]", active && "bg-[var(--color-accent-soft)]")}>
            <td className="px-4 py-2.5 pl-8 text-[var(--color-ink)]">{ward.ward}</td>
            <td className="px-3 py-2.5 text-right font-mono text-[var(--color-ink-2)]">{visibleCount(ward, "cot1", cot).toLocaleString("vi-VN")}</td>
            <td className="px-3 py-2.5 text-right font-mono text-[var(--color-ink-2)]">{visibleCount(ward, "cot2", cot).toLocaleString("vi-VN")}</td>
            <HeatCell value={visibleTotal(ward, cot)} />
          </tr>
        );
      })}
    </>
  );
}

function HeatCell({ value, strong }: { value: number; strong?: boolean }) {
  return <td className={cn("px-3 py-2.5 text-right font-mono", heatClass(value), strong && "font-bold")}>{value.toLocaleString("vi-VN")}</td>;
}

export function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      <span className="rounded-md bg-[var(--color-success-soft)] px-2 py-1 text-[var(--color-success)]">1–5 ít</span>
      <span className="rounded-md bg-[var(--color-warning-soft)] px-2 py-1 text-[var(--color-warning)]">6–20 vừa</span>
      <span className="rounded-md bg-[var(--color-warning-soft)] px-2 py-1 text-[var(--color-warning)]">21–35 cao</span>
      <span className="rounded-md bg-[var(--color-error-soft)] px-2 py-1 text-[var(--color-error)]">36+ đỏ</span>
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper)] p-1">
      {options.map((option) => (
        <button key={option.id} type="button" onClick={() => onChange(option.id)} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", value === option.id ? "bg-[var(--color-graphite)] text-[var(--color-graphite-ink)]" : "text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)]")}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
