import { AlertTriangle } from "lucide-react";
import { ZONE_COLORS } from "@/components/zones/zone-map-types";

export function ZoneLegend({ capacityConfigured }: { capacityConfigured: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Màu zone</p><div className="mt-2 flex flex-wrap gap-1.5">{ZONE_COLORS.map((color) => <span key={color} className="size-4 rounded-full ring-2 ring-white shadow-sm" style={{ backgroundColor: color }} />)}<span className="ml-1 text-xs text-slate-500">Màu giúp phân biệt các polygon liền kề</span></div></div>
        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Trạng thái</p><div className="mt-2 flex flex-wrap gap-4 text-xs font-semibold text-slate-600"><LegendStatus color="#16a34a" label="Đang hoạt động" /><LegendStatus color="#94a3b8" label="Không hoạt động" dashed /><LegendStatus color="#dc2626" label="Đầy tải" /></div></div>
      </div>
      {!capacityConfigured ? <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> Chưa có capacity trong dữ liệu zone, nên trạng thái “Đầy tải” chưa phát sinh. Cần cấu hình capacity theo phường/zone để bật cảnh báo này.</p> : null}
    </div>
  );
}

function LegendStatus({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return <span className="flex items-center gap-2"><span className="size-3.5 rounded border-2" style={{ borderColor: color, backgroundColor: `${color}22`, borderStyle: dashed ? "dashed" : "solid" }} />{label}</span>;
}
