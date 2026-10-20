"use client";

import { useState } from "react";
import { ArrowUpRight, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { addCounts, deliveryDistrictLabel, emptyCounts, heatClass, sameFocus, visibleCount, visibleTotal, type CotFilter, type DistrictAgg, type InventoryFocus } from "./lmhub-inventory-model";

export function DeliveryInventoryBoard({ districts, cot, selected, onSelect, forceExpanded = false }: {
  districts: DistrictAgg[]; cot: CotFilter; selected: InventoryFocus | null;
  onSelect: (focus: InventoryFocus) => void; forceExpanded?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const total = districts.reduce((sum, district) => addCounts(sum, district.totals), emptyCounts());
  const allOpen = forceExpanded || districts.every((district) => !collapsed[district.district]);

  return <section aria-label="Tồn Delivery tất cả quận" className="space-y-2">
    <header className="flex items-center justify-between gap-2 text-xs">
      <p className="font-semibold text-slate-700">{districts.length} quận · <span className="tabular-nums">{visibleTotal(total, cot).toLocaleString("vi-VN")}</span> đơn đang hiển thị</p>
      <button type="button" disabled={forceExpanded || !districts.length} onClick={() => setCollapsed(Object.fromEntries(districts.map((district) => [district.district, allOpen])))} className="min-h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40">{allOpen ? "Thu tất cả" : "Mở tất cả"}</button>
    </header>
    {!districts.length ? <p className="rounded-lg border border-slate-200 bg-white p-5 text-center text-xs text-slate-500">Không có phường khớp bộ lọc.</p> : null}
    <div className={cn("grid items-start gap-2", districts.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4")}>
      {districts.map((district) => {
        const label = deliveryDistrictLabel(district.district);
        const open = forceExpanded || !collapsed[district.district];
        const focus: InventoryFocus = { area: district.area, district: district.district, ward: null };
        return <article key={district.district} className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <header className="flex items-center gap-1 border-b border-blue-100 bg-blue-50 px-2 py-1.5">
            <button type="button" aria-expanded={open} aria-label={`${open ? "Thu gọn" : "Mở"} ${label}`} disabled={forceExpanded} onClick={() => setCollapsed((current) => ({ ...current, [district.district]: open }))} className="flex min-h-7 min-w-0 flex-1 items-center gap-1 text-left text-xs font-bold text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span>{label}</span></button>
            <button type="button" aria-label={`Xem đơn ${label}`} disabled={!visibleTotal(district.totals, cot)} onClick={() => onSelect(focus)} className="flex min-h-7 items-center gap-1 rounded px-1 text-xs font-bold tabular-nums text-blue-800 hover:bg-blue-100 disabled:opacity-40"><span>{visibleTotal(district.totals, cot).toLocaleString("vi-VN")}</span><ArrowUpRight size={13} /></button>
          </header>
          {open ? <div className="max-h-[58vh] overflow-auto">
            <table className="w-full table-fixed text-left text-[12px] leading-4">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] text-slate-500"><tr><th scope="col" className="px-2 py-1.5 font-medium">Phường</th><th scope="col" className="w-10 px-1 py-1.5 text-right font-medium">COT 1</th><th scope="col" className="w-10 px-1 py-1.5 text-right font-medium">COT 2</th><th scope="col" className="w-12 px-1.5 py-1.5 text-right font-semibold">Tổng</th></tr></thead>
              <tbody>
                {!district.wards.length ? <tr><td colSpan={4} className="px-3 py-4 text-[11px] leading-4 text-slate-500">{district.district === "Thủ Đức" ? "Chưa có dữ liệu thuộc 12 phường Thủ Đức cũ." : "Chưa có đơn khớp bộ lọc."}</td></tr> : null}
                {district.wards.map((ward) => {
                  const wardFocus: InventoryFocus = { area: ward.area, district: ward.district, ward: ward.ward };
                  return <tr key={ward.ward} className={cn("border-t border-slate-100 hover:bg-blue-50/60", sameFocus(selected, wardFocus) && "bg-blue-50 ring-1 ring-inset ring-blue-200")}>
                    <th scope="row" className="px-2 py-0.5 font-normal"><button type="button" title={ward.ward} aria-label={`Xem đơn ${ward.ward}, ${label}`} onClick={() => onSelect(wardFocus)} className="min-h-7 w-full text-left leading-4 text-slate-700 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">{ward.ward.replace(/^Phường\s+/i, "")}</button></th>
                    <NumberCell value={visibleCount(ward, "cot1", cot)} /><NumberCell value={visibleCount(ward, "cot2", cot)} />
                    <NumberCell value={visibleTotal(ward, cot)} heat onClick={() => onSelect(wardFocus)} label={`Xem ${visibleTotal(ward, cot)} đơn ${ward.ward}, ${label}`} />
                  </tr>;
                })}
              </tbody>
              <tfoot className="sticky bottom-0 border-t border-slate-200 bg-slate-50"><tr><th scope="row" className="px-2 py-1.5 text-[11px] font-semibold text-slate-700">{district.wards.length} phường</th><NumberCell value={visibleCount(district.totals, "cot1", cot)} strong /><NumberCell value={visibleCount(district.totals, "cot2", cot)} strong /><NumberCell value={visibleTotal(district.totals, cot)} strong heat /></tr></tfoot>
            </table>
          </div> : null}
        </article>;
      })}
    </div>
  </section>;
}

function NumberCell({ value, strong, heat, onClick, label }: { value: number; strong?: boolean; heat?: boolean; onClick?: () => void; label?: string }) {
  const style = cn("inline-block min-w-6 rounded px-1 py-0.5", heat && heatClass(value), !value && "text-slate-400");
  return <td className={cn("px-1 py-0.5 text-right tabular-nums", strong ? "font-semibold text-slate-900" : "text-slate-600")}>{onClick ? <button type="button" onClick={onClick} aria-label={label} className={cn(style, "min-h-7 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600")}>{value.toLocaleString("vi-VN")}</button> : <span className={style}>{value.toLocaleString("vi-VN")}</span>}</td>;
}
