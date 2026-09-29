"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import {
  formatDateTime,
  visibleCount,
  visibleTotal,
  heatClass,
  addCounts,
  emptyCounts,
  districtKey,
  sameFocus,
  type CotFilter,
  type DistrictAgg,
  type InventoryFocus,
} from "@/components/lmhub-inventory/lmhub-inventory-model";

export function AreaBoard({
  title,
  districts,
  cot,
  selected,
  onSelect,
  updatedAt,
  columnLabel,
}: {
  title: string;
  districts: DistrictAgg[];
  cot: CotFilter;
  selected: InventoryFocus | null;
  onSelect: (focus: InventoryFocus) => void;
  updatedAt: string | null;
  parentNoun?: string;
  childNoun?: string;
  columnLabel?: string;
}) {
  const grand = districts.reduce((sum, item) => addCounts(sum, item.totals), emptyCounts());
  const keys = useMemo(() => districts.map((item) => districtKey(item.area, item.district)), [districts]);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const isOpen = (key: string) => openMap[key] !== false;
  const allOpen = keys.length > 0 && keys.every((key) => isOpen(key));

  const setAll = (next: boolean) => {
    const map: Record<string, boolean> = {};
    for (const key of keys) map[key] = next;
    setOpenMap(map);
  };

  const toggle = (key: string) => {
    setOpenMap((current) => ({ ...current, [key]: !(current[key] !== false) }));
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className="flex items-center justify-between bg-[var(--color-graphite)] px-4 py-3 text-[var(--color-graphite-ink)]">
        <div>
          <h2 className="text-sm font-bold tracking-tight">{title}</h2>
          <p className="text-[11px] font-medium text-[var(--color-graphite-ink)]/70">Cập nhật {formatDateTime(updatedAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAll(!allOpen)}
            className="rounded-md border border-white/15 px-2 py-1 text-[11px] font-semibold text-[var(--color-graphite-ink)]/80 hover:bg-white/10"
          >
            {allOpen ? "Thu quận" : "Mở quận"}
          </button>
          <span className="font-mono text-sm font-semibold">{visibleTotal(grand, cot).toLocaleString("vi-VN")} đơn</span>
        </div>
      </div>
      <div className="max-h-[52vh] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--color-paper-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2.5 font-semibold">{columnLabel ?? "Quận / Phường"}</th>
              <th className="w-20 px-3 py-2.5 text-right font-semibold">COT 1</th>
              <th className="w-20 px-3 py-2.5 text-right font-semibold">COT 2</th>
              <th className="w-24 px-3 py-2.5 text-right font-semibold">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {!districts.length ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">
                  Không có dòng khớp lọc.
                </td>
              </tr>
            ) : (
              districts.map((district) => (
                <DistrictRows
                  key={`${district.area}-${district.district}`}
                  district={district}
                  cot={cot}
                  selected={selected}
                  open={isOpen(districtKey(district.area, district.district))}
                  onToggle={() => toggle(districtKey(district.area, district.district))}
                  onSelect={onSelect}
                />
              ))
            )}
            {districts.length ? (
              <tr className="border-t border-[var(--color-rule-strong)] bg-[var(--color-paper-3)]">
                <td className="px-4 py-3 font-bold text-[var(--color-ink)]">Tổng {title}</td>
                <CountCell value={visibleCount(grand, "cot1", cot)} strong />
                <CountCell value={visibleCount(grand, "cot2", cot)} strong />
                <HeatCell value={visibleTotal(grand, cot)} strong />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DistrictRows({
  district,
  cot,
  selected,
  open,
  onToggle,
  onSelect,
}: {
  district: DistrictAgg;
  cot: CotFilter;
  selected: InventoryFocus | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (focus: InventoryFocus) => void;
}) {
  const focus: InventoryFocus = { area: district.area, district: district.district, ward: null };
  const active = sameFocus(selected, focus);
  const childActive = selected?.area === district.area && selected.district === district.district && selected.ward !== null;

  return (
    <>
      <tr
        className={cn(
          "border-t border-[var(--color-rule)] bg-[var(--color-accent-soft)]",
          (active || childActive) && "ring-1 ring-inset ring-[var(--color-accent)]/40",
        )}
      >
        <td className="px-2 py-2.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={open ? "Thu phường" : "Mở phường"}
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--color-accent)] hover:bg-white/70"
            >
              {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
            <button
              type="button"
              onClick={() => onSelect(focus)}
              className="min-w-0 flex-1 truncate text-left font-bold text-[var(--color-accent)] hover:underline"
            >
              {district.district}
            </button>
          </div>
        </td>
        <td className="px-1 py-1">
          <button type="button" className="w-full" onClick={() => onSelect(focus)}>
            <CountCell value={visibleCount(district.totals, "cot1", cot)} strong asDiv />
          </button>
        </td>
        <td className="px-1 py-1">
          <button type="button" className="w-full" onClick={() => onSelect(focus)}>
            <CountCell value={visibleCount(district.totals, "cot2", cot)} strong asDiv />
          </button>
        </td>
        <td className="px-1 py-1">
          <button type="button" className="w-full" onClick={() => onSelect(focus)}>
            <HeatCell value={visibleTotal(district.totals, cot)} strong asDiv />
          </button>
        </td>
      </tr>
      {open
        ? district.wards.map((ward) => {
            const wardFocus: InventoryFocus = { area: ward.area, district: ward.district, ward: ward.ward };
            const wardActive = sameFocus(selected, wardFocus);
            const total = visibleTotal(ward, cot);
            return (
              <tr
                key={ward.ward}
                onClick={() => onSelect(wardFocus)}
                className={cn(
                  "cursor-pointer border-t border-[var(--color-rule)] hover:bg-[var(--color-paper-2)]",
                  wardActive && "bg-[var(--color-accent-soft)]",
                  total <= 0 && "bg-white",
                )}
              >
                <td className={cn("px-4 py-2.5 pl-12", total <= 0 ? "text-slate-400" : "text-[var(--color-ink)]")}>{ward.ward}</td>
                <CountCell value={visibleCount(ward, "cot1", cot)} />
                <CountCell value={visibleCount(ward, "cot2", cot)} />
                <HeatCell value={total} />
              </tr>
            );
          })
        : null}
    </>
  );
}

function CountCell({ value, strong, asDiv }: { value: number; strong?: boolean; asDiv?: boolean }) {
  const className = cn(
    "px-3 py-2.5 text-right font-mono",
    value <= 0 ? "bg-white text-slate-300" : "text-[var(--color-ink-2)]",
    strong && value > 0 && "font-semibold text-[var(--color-ink)]",
  );
  if (asDiv) return <div className={className}>{value.toLocaleString("vi-VN")}</div>;
  return <td className={className}>{value.toLocaleString("vi-VN")}</td>;
}

function HeatCell({ value, strong, asDiv }: { value: number; strong?: boolean; asDiv?: boolean }) {
  const className = cn("px-3 py-2.5 text-right font-mono", heatClass(value), strong && value > 0 && "font-bold");
  if (asDiv) return <div className={className}>{value.toLocaleString("vi-VN")}</div>;
  return <td className={className}>{value.toLocaleString("vi-VN")}</td>;
}

export function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      <span className="rounded-md border border-[var(--color-rule)] bg-white px-2 py-1 text-slate-400">0 hết tồn</span>
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
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold",
            value === option.id ? "bg-[var(--color-graphite)] text-[var(--color-graphite-ink)]" : "text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
