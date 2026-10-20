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
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div><h2 className="font-bold text-slate-950">Tồn theo quận / phường</h2><p className="mt-1 text-xs text-slate-500">Chọn tên phường hoặc “Xem đơn” để mở chi tiết. Bấm mũi tên để thu gọn quận.</p></div>
      <button type="button" disabled={forceExpanded || !districts.length} onClick={() => setCollapsed(Object.fromEntries(districts.map((district) => [district.district, allOpen])))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">{allOpen ? "Thu gọn tất cả" : "Mở tất cả"}</button>
    </header>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500"><tr><th scope="col" className="px-5 py-3">Địa bàn</th><th scope="col" className="w-20 px-3 py-3 text-right">COT 1</th><th scope="col" className="w-20 px-3 py-3 text-right">COT 2</th><th scope="col" className="w-24 px-3 py-3 text-right">Tổng tồn</th><th scope="col" className="w-28 px-4 py-3"><span className="sr-only">Thao tác</span></th></tr></thead>
        {!districts.length ? <tbody><tr><td colSpan={5} className="px-5 py-12 text-center text-slate-500">Không có phường khớp bộ lọc. Hãy đổi quận hoặc xóa từ khóa.</td></tr></tbody> : districts.map((district) => {
          const label = deliveryDistrictLabel(district.district);
          const open = forceExpanded || !collapsed[district.district];
          const focus: InventoryFocus = { area: district.area, district: district.district, ward: null };
          return <tbody key={district.district}>
            <tr className="border-y border-blue-100 bg-blue-50/80">
              <th scope="row" className="px-3 py-3"><button type="button" aria-expanded={open} aria-label={`${open ? "Thu gọn" : "Mở"} ${label}`} disabled={forceExpanded} onClick={() => setCollapsed((current) => ({ ...current, [district.district]: open }))} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600">{open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}<span>{label}<span className="ml-2 font-normal text-xs text-blue-600">{district.wards.length} phường có dữ liệu</span></span></button></th>
              <NumberCell value={visibleCount(district.totals, "cot1", cot)} strong />
              <NumberCell value={visibleCount(district.totals, "cot2", cot)} strong />
              <NumberCell value={visibleTotal(district.totals, cot)} strong heat />
              <td className="px-4 py-3"><DetailButton label={label} disabled={!district.totals.total} onClick={() => onSelect(focus)} /></td>
            </tr>
            {open && !district.wards.length ? <tr><td colSpan={5} className="px-6 py-6 text-sm text-slate-500">{district.district === "Thủ Đức" ? "Chưa có đơn thuộc 12 phường Thủ Đức cũ trong dữ liệu cập nhật gần nhất." : "Chưa có đơn khớp bộ lọc trong dữ liệu cập nhật gần nhất."}</td></tr> : null}
            {open && district.wards.map((ward) => {
              const wardFocus: InventoryFocus = { area: ward.area, district: ward.district, ward: ward.ward };
              const count = visibleTotal(ward, cot);
              return <tr key={ward.ward} className={cn("border-b border-slate-100 transition-colors hover:bg-blue-50/50", sameFocus(selected, wardFocus) && "bg-blue-50 ring-1 ring-inset ring-blue-200")}>
                <th scope="row" className="px-5 py-1.5 pl-12 font-medium"><button type="button" onClick={() => onSelect(wardFocus)} className="min-h-11 w-full text-left text-slate-800 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-blue-600">{ward.ward}</button></th>
                <NumberCell value={visibleCount(ward, "cot1", cot)} /><NumberCell value={visibleCount(ward, "cot2", cot)} /><NumberCell value={count} heat />
                <td className="px-4 py-2"><DetailButton label={`${ward.ward}, ${label}`} onClick={() => onSelect(wardFocus)} /></td>
              </tr>;
            })}
          </tbody>;
        })}
        {districts.length ? <tfoot className="border-t-2 border-slate-200 bg-slate-50"><tr><th scope="row" className="px-5 py-4 font-bold text-slate-900">Tổng đang hiển thị</th><NumberCell value={visibleCount(total, "cot1", cot)} strong /><NumberCell value={visibleCount(total, "cot2", cot)} strong /><NumberCell value={visibleTotal(total, cot)} strong heat /><td /></tr></tfoot> : null}
      </table>
    </div>
  </section>;
}

function NumberCell({ value, strong, heat }: { value: number; strong?: boolean; heat?: boolean }) {
  return <td className={cn("px-3 py-3 text-right tabular-nums", strong ? "font-bold text-slate-900" : "text-slate-600")}><span className={cn("inline-block min-w-10 rounded-lg px-2 py-1", heat && heatClass(value), !value && "text-slate-400")}>{value.toLocaleString("vi-VN")}</span></td>;
}

function DetailButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onClick} aria-label={`Xem đơn ${label}`} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-30">Xem đơn<ArrowUpRight size={14} /></button>;
}
