"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, Grid2X2, Layers3, MapPin, Minus, RefreshCcw, Search, TrendingDown, TrendingUp, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

export type DeliveryViewMode = "day" | "week" | "month";

export type DeliveryCotSummary = {
  cot: string;
  count: number;
};

export type DeliveryWard = {
  ward: string;
  count: number;
  cots: DeliveryCotSummary[];
};

export type DeliveryDistrict = {
  district: string;
  count: number;
  wards: DeliveryWard[];
  cots: DeliveryCotSummary[];
};

export type DeliveryTrendPoint = {
  date: string;
  count: number;
  cot11: number;
  cot12: number;
  cot2: number;
};

type DeliveryVolumeDashboardProps = {
  date: string;
  onDateChange: (value: string) => void;
  viewMode: DeliveryViewMode;
  onViewModeChange: (mode: DeliveryViewMode) => void;
  onRefresh: () => void;
  loading: boolean;
  error: string | null;
  totalOrders: number;
  wardCount: number;
  cotVolumes: DeliveryCotSummary[];
  districts: DeliveryDistrict[];
  trend: DeliveryTrendPoint[];
  comparisonTrend: DeliveryTrendPoint[];
  averageDays: number;
  comparisonTotalOrders: number;
  comparisonDistricts: DeliveryDistrict[];
  comparisonLabel: string;
};

export function DeliveryVolumeDashboard({
  date,
  onDateChange,
  viewMode,
  onViewModeChange,
  onRefresh,
  loading,
  error,
  totalOrders,
  wardCount,
  cotVolumes,
  districts,
  trend,
  comparisonTrend,
  averageDays,
  comparisonTotalOrders,
  comparisonDistricts,
  comparisonLabel,
}: DeliveryVolumeDashboardProps) {
  const isAverage = viewMode !== "day";
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Tổng quan khu vực</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Delivery Volume</h1>
          <p className="mt-1 text-sm text-slate-500">Tổng lượng đơn theo ngày, quận/huyện và phường/xã.</p>
        </div>
        <VolumeNavigation />
      </header>

      <DateFilter
        date={date}
        onDateChange={onDateChange}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        onRefresh={onRefresh}
        loading={loading}
      />

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          Không tải được dữ liệu: {error}
        </p>
      ) : null}

      <KpiCards
        loading={loading}
        totalOrders={totalOrders}
        districtCount={districts.length}
        wardCount={wardCount}
        cotCount={cotVolumes.length}
        isAverage={isAverage}
        comparisonTotalOrders={comparisonTotalOrders}
        comparisonLabel={comparisonLabel}
      />

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <CotVolumeCard cotVolumes={cotVolumes} totalOrders={totalOrders} loading={loading} isAverage={isAverage} />
        <DeliveryTrendCard trend={trend} comparisonTrend={comparisonTrend} loading={loading} viewMode={viewMode} />
      </div>

      <DeliveryAreaExplorer
        date={date}
        viewMode={viewMode}
        totalOrders={totalOrders}
        districts={districts}
        loading={loading}
        averageDays={averageDays}
        comparisonDistricts={comparisonDistricts}
        comparisonLabel={comparisonLabel}
      />
    </div>
  );
}

function VolumeNavigation() {
  return (
    <nav className="inline-flex self-start rounded-lg bg-slate-100 p-1" aria-label="Loại volume">
      <Link href="/volume/delivery" className="rounded-md bg-white px-4 py-2 text-sm font-bold text-slate-950 shadow-sm">
        Delivery
      </Link>
      <Link href="/volume/pickup" className="rounded-md px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-900">
        Pickup
      </Link>
    </nav>
  );
}

function DateFilter({
  date,
  onDateChange,
  viewMode,
  onViewModeChange,
  onRefresh,
  loading,
}: {
  date: string;
  onDateChange: (value: string) => void;
  viewMode: DeliveryViewMode;
  onViewModeChange: (mode: DeliveryViewMode) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const modes: Array<{ value: DeliveryViewMode; label: string }> = [
    { value: "day", label: "Theo ngày" },
    { value: "week", label: "Theo tuần" },
    { value: "month", label: "Theo tháng" },
  ];

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Bộ lọc báo cáo</h2>
        <p className="mt-0.5 text-xs text-slate-500">Chọn mốc thời gian và phạm vi tổng hợp delivery.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-[210px]">
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Ngày tham chiếu</span>
          <span className="relative block">
            <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} className="pl-9" />
          </span>
        </label>
        <div>
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Chế độ xem</span>
          <div className="inline-flex rounded-md bg-slate-100 p-1">
            {modes.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => onViewModeChange(mode.value)}
                className={cn(
                  "rounded px-3 py-2 text-xs font-bold transition",
                  viewMode === mode.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-900",
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
        <Button type="button" variant="secondary" onClick={onRefresh} disabled={loading}>
          <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} />
          Làm mới
        </Button>
      </div>
    </section>
  );
}

function KpiCards({
  loading,
  totalOrders,
  districtCount,
  wardCount,
  cotCount,
  isAverage,
  comparisonTotalOrders,
  comparisonLabel,
}: {
  loading: boolean;
  totalOrders: number;
  districtCount: number;
  wardCount: number;
  cotCount: number;
  isAverage: boolean;
  comparisonTotalOrders: number;
  comparisonLabel: string;
}) {
  const items = [
    { label: isAverage ? "TB đơn/ngày" : "Tổng đơn", value: totalOrders, icon: Truck, tone: "bg-blue-50 text-blue-700", previous: comparisonTotalOrders },
    { label: "Quận/huyện", value: districtCount, icon: MapPin, tone: "bg-emerald-50 text-emerald-700", previous: null },
    { label: "Phường/xã", value: wardCount, icon: Grid2X2, tone: "bg-amber-50 text-amber-700", previous: null },
    { label: "Số COT", value: cotCount, icon: Layers3, tone: "bg-slate-100 text-slate-700", previous: null },
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Chỉ số delivery">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase text-slate-500">{item.label}</p>
              <span className={cn("grid size-8 place-items-center rounded-md", item.tone)}><Icon size={17} /></span>
            </div>
            <p className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl">{loading ? "-" : formatNumber(item.value)}</p>
            {item.previous !== null && !loading ? (
              <div className="mt-2 flex items-center gap-2">
                <GrowthBadge current={item.value} previous={item.previous} />
                <span className="truncate text-[11px] text-slate-400">{comparisonLabel}</span>
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function CotVolumeCard({
  cotVolumes,
  totalOrders,
  loading,
  isAverage,
}: {
  cotVolumes: DeliveryCotSummary[];
  totalOrders: number;
  loading: boolean;
  isAverage: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 className="font-bold text-slate-950">Volume theo COT</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {isAverage ? "Sản lượng trung bình/ngày theo nhóm COT." : "COT 1.1 và COT 1.2 là volume giao buổi sáng."}
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {["COT 1.1", "COT 1.2", "COT 2"].map((name, index) => {
          const value = cotValue(cotVolumes, name);
          const percentage = totalOrders > 0 ? (value / totalOrders) * 100 : 0;
          return (
            <div key={name} className="px-4 py-4 sm:px-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase text-slate-500">{name}</p>
                  <p className="mt-1 text-2xl font-black text-slate-950">{loading ? "-" : formatNumber(value)}</p>
                </div>
                <strong className="text-sm text-slate-500">{percentage.toFixed(1)}%</strong>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn("h-full rounded-full", index === 0 ? "bg-sky-500" : index === 1 ? "bg-blue-700" : "bg-emerald-500")}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DeliveryTrendCard({
  trend,
  comparisonTrend,
  loading,
  viewMode,
}: {
  trend: DeliveryTrendPoint[];
  comparisonTrend: DeliveryTrendPoint[];
  loading: boolean;
  viewMode: DeliveryViewMode;
}) {
  const [comparisonSeries, setComparisonSeries] = useState<"total" | "cot11" | "cot12" | "cot2">("total");
  const comparisonSeriesLabel = comparisonSeries === "cot11" ? "COT 1.1" : comparisonSeries === "cot12" ? "COT 1.2" : comparisonSeries === "cot2" ? "COT 2" : "Tổng";
  const max = Math.max(1, ...trend.map((point) => point.count), ...comparisonTrend.map((point) => point.count));
  const lineMax = Math.max(1, ...trend.map((point) => trendSeriesValue(point, comparisonSeries)), ...comparisonTrend.map((point) => trendSeriesValue(point, comparisonSeries)));
  const displayMax = comparisonSeries === "total" ? max : lineMax;
  const label = viewMode === "day" ? "Trong ngày đã chọn" : viewMode === "week" ? "7 ngày trong tuần" : "Các ngày trong tháng";

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 className="font-bold text-slate-950">Xu hướng sản lượng</h2>
        <p className="mt-0.5 text-xs text-slate-500">{label}</p>
        <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-bold text-slate-500">
          {comparisonSeries === "total" ? <><Legend color="bg-sky-400" label="COT 1.1" /><Legend color="bg-blue-600" label="COT 1.2" /><Legend color="bg-emerald-500" label="COT 2" /></> : <Legend color={trendSeriesColor(comparisonSeries)} label={`${comparisonSeriesLabel} được chọn`} />}
          {viewMode !== "day" ? <><Legend color="bg-slate-900" label={`${comparisonSeriesLabel} hiện tại`} line /><Legend color="bg-slate-400" label={`${comparisonSeriesLabel} kỳ trước`} line dashed /></> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Chọn COT để xem volume">
            {([
              ["total", "Tổng"],
              ["cot11", "COT 1.1"],
              ["cot12", "COT 1.2"],
              ["cot2", "COT 2"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setComparisonSeries(value)} className={cn("rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition", comparisonSeries === value ? "border-blue-600 bg-blue-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700")}>{label}</button>
            ))}
        </div>
      </div>
      <div className="overflow-x-auto px-4 pb-4 pt-5 sm:px-5">
        {!loading && trend.length === 0 ? <p className="m-auto text-sm text-slate-500">Chưa có dữ liệu xu hướng.</p> : null}
        {trend.length > 0 ? (
          <div className="relative h-[190px]" style={{ minWidth: `${Math.max(420, trend.length * 52)}px` }}>
            <div className="absolute inset-x-0 bottom-6 top-5 flex items-end">
              {trend.map((point) => (
                <div key={point.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <span className="mb-1 text-[10px] font-bold text-slate-600">{formatCompact(trendSeriesValue(point, comparisonSeries))}</span>
                  <div className="flex h-28 w-8 flex-col-reverse overflow-hidden rounded-t bg-slate-100 ring-1 ring-slate-200/70">
                    {comparisonSeries === "total" ? <><TrendSegment value={point.cot11} max={displayMax} className="bg-sky-400" /><TrendSegment value={point.cot12} max={displayMax} className="bg-blue-600" /><TrendSegment value={point.cot2} max={displayMax} className="bg-emerald-500" /></> : <TrendSegment value={trendSeriesValue(point, comparisonSeries)} max={displayMax} className={trendSeriesColor(comparisonSeries)} />}
                  </div>
                  <span className="mt-2 text-[10px] font-semibold text-slate-400">{formatShortDate(point.date)}</span>
                </div>
              ))}
            </div>
            {viewMode !== "day" ? (
              <svg className="pointer-events-none absolute inset-x-0 top-5 h-28 w-full overflow-visible" viewBox={`0 0 ${trend.length * 52} 112`} preserveAspectRatio="none" aria-hidden="true">
                <polyline points={trendLinePoints(trend, lineMax, trend.length, comparisonSeries)} fill="none" stroke="#0f172a" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
                {comparisonTrend.length > 0 ? <polyline points={trendLinePoints(comparisonTrend.slice(0, trend.length), lineMax, trend.length, comparisonSeries)} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" /> : null}
              </svg>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TrendSegment({ value, max, className }: { value: number; max: number; className: string }) {
  return <div className={cn("w-full shrink-0", className)} style={{ height: `${value > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} title={formatNumber(value)} />;
}

function Legend({ color, label, line = false, dashed = false }: { color: string; label: string; line?: boolean; dashed?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><span className={cn(color, line ? "h-0.5 w-5" : "size-2.5 rounded-sm", dashed && "bg-transparent border-t-2 border-dashed border-slate-400")} />{label}</span>;
}

function trendLinePoints(points: DeliveryTrendPoint[], max: number, slots = points.length, series: "total" | "cot11" | "cot12" | "cot2" = "total") {
  return points.map((point, index) => `${(index + 0.5) * (slots * 52 / Math.max(1, slots))},${112 - (trendSeriesValue(point, series) / max) * 108}`).join(" ");
}

function trendSeriesValue(point: DeliveryTrendPoint, series: "total" | "cot11" | "cot12" | "cot2") {
  if (series === "cot11") return point.cot11;
  if (series === "cot12") return point.cot12;
  if (series === "cot2") return point.cot2;
  return point.count;
}

function trendSeriesColor(series: "total" | "cot11" | "cot12" | "cot2") {
  if (series === "cot11") return "bg-sky-400";
  if (series === "cot12") return "bg-blue-600";
  if (series === "cot2") return "bg-emerald-500";
  return "bg-slate-900";
}

function DeliveryAreaExplorer({
  date,
  viewMode,
  totalOrders,
  districts,
  loading,
  averageDays,
  comparisonDistricts,
  comparisonLabel,
}: {
  date: string;
  viewMode: DeliveryViewMode;
  totalOrders: number;
  districts: DeliveryDistrict[];
  loading: boolean;
  averageDays: number;
  comparisonDistricts: DeliveryDistrict[];
  comparisonLabel: string;
}) {
  const isAverage = viewMode !== "day";
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [wardQuery, setWardQuery] = useState("");
  const [sortMode, setSortMode] = useState<"volume" | "name">("volume");
  const activeDistrict = districts.find((district) => district.district === selectedDistrict) ?? districts[0] ?? null;
  const wards = useMemo(() => {
    const query = normalizeSearch(wardQuery);
    const filtered = activeDistrict?.wards.filter((ward) => normalizeSearch(ward.ward).includes(query)) ?? [];
    return [...filtered].sort((a, b) =>
      sortMode === "name" ? a.ward.localeCompare(b.ward, "vi") : b.count - a.count || a.ward.localeCompare(b.ward, "vi"),
    );
  }, [activeDistrict, sortMode, wardQuery]);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="font-bold text-slate-950">Volume theo khu vực</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            {periodLabel(date, viewMode)} · {isAverage ? `trung bình trên ${averageDays} ngày có dữ liệu` : "sắp xếp theo tổng đơn giảm dần"}.
          </p>
        </div>
        <span className="self-start rounded-md bg-blue-600 px-3 py-2 text-xs font-bold text-white">
          {formatNumber(totalOrders)} {isAverage ? "đơn TB/ngày" : "đơn"}
        </span>
      </div>

      <div className="grid min-h-[580px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <DistrictSummaryList
          districts={districts}
          selectedDistrict={activeDistrict?.district ?? null}
          loading={loading}
          isAverage={isAverage}
          comparisonDistricts={comparisonDistricts}
          comparisonLabel={comparisonLabel}
          onSelect={(district) => {
            setSelectedDistrict(district);
            setWardQuery("");
          }}
        />
        <WardDetailPanel
          district={activeDistrict}
          wards={wards}
          query={wardQuery}
          onQueryChange={setWardQuery}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          isAverage={isAverage}
          comparisonDistrict={
            activeDistrict
              ? comparisonDistricts.find((district) => district.district === activeDistrict.district) ?? null
              : null
          }
          comparisonLabel={comparisonLabel}
        />
      </div>
    </section>
  );
}

function DistrictSummaryList({
  districts,
  selectedDistrict,
  loading,
  isAverage,
  comparisonDistricts,
  comparisonLabel,
  onSelect,
}: {
  districts: DeliveryDistrict[];
  selectedDistrict: string | null;
  loading: boolean;
  isAverage: boolean;
  comparisonDistricts: DeliveryDistrict[];
  comparisonLabel: string;
  onSelect: (district: string) => void;
}) {
  return (
    <aside className="border-b border-slate-200 lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2.5">
        <span className="text-xs font-bold uppercase text-slate-500">Quận/huyện</span>
        <span className="text-xs font-semibold text-slate-400">{districts.length}</span>
      </div>
      <div className="max-h-[420px] divide-y divide-slate-100 overflow-y-auto lg:max-h-[720px]">
        {!loading && districts.length === 0 ? <EmptyState text="Chưa có dữ liệu quận/huyện." /> : null}
        {districts.map((district) => (
          <DistrictSummaryItem
            key={district.district}
            district={district}
            selected={selectedDistrict === district.district}
            isAverage={isAverage}
            comparison={comparisonDistricts.find((item) => item.district === district.district) ?? null}
            comparisonLabel={comparisonLabel}
            onSelect={() => onSelect(district.district)}
          />
        ))}
      </div>
    </aside>
  );
}

function DistrictSummaryItem({
  district,
  selected,
  isAverage,
  comparison,
  comparisonLabel,
  onSelect,
}: {
  district: DeliveryDistrict;
  selected: boolean;
  isAverage: boolean;
  comparison: DeliveryDistrict | null;
  comparisonLabel: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full border-l-2 px-4 py-3 text-left transition",
        selected ? "border-blue-500 bg-blue-50/70" : "border-transparent hover:bg-slate-50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-bold text-slate-900">{district.district}</span>
        <strong className="shrink-0 text-base text-slate-950">{formatNumber(district.count)}</strong>
      </div>
      <p className="mt-1 text-xs text-slate-500">{district.wards.length} phường/xã</p>
      {isAverage ? <p className="mt-0.5 text-[11px] font-semibold text-blue-600">Trung bình/ngày</p> : null}
      <CotMetadata cots={district.cots} />
      <div className="mt-2 flex items-center gap-2">
        <GrowthBadge current={district.count} previous={comparison?.count ?? 0} />
        <span className="truncate text-[10px] text-slate-400">{comparisonLabel}</span>
      </div>
    </button>
  );
}

function WardDetailPanel({
  district,
  wards,
  query,
  onQueryChange,
  sortMode,
  onSortModeChange,
  isAverage,
  comparisonDistrict,
  comparisonLabel,
}: {
  district: DeliveryDistrict | null;
  wards: DeliveryWard[];
  query: string;
  onQueryChange: (value: string) => void;
  sortMode: "volume" | "name";
  onSortModeChange: (mode: "volume" | "name") => void;
  isAverage: boolean;
  comparisonDistrict: DeliveryDistrict | null;
  comparisonLabel: string;
}) {
  return (
    <div className="min-w-0">
      <div className="border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase text-slate-400">Chi tiết phường/xã</p>
            <h3 className="mt-1 truncate text-lg font-black text-slate-950">{district?.district ?? "Chưa chọn quận"}</h3>
            {district ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-md bg-slate-100 px-2.5 py-1.5 text-slate-600">
                  {formatNumber(district.count)} {isAverage ? "TB/ngày" : "đơn"}
                </span>
                <span className="rounded-md bg-sky-50 px-2.5 py-1.5 text-sky-700">COT 1.1: {formatNumber(cotValue(district.cots, "COT 1.1"))}</span>
                <span className="rounded-md bg-blue-50 px-2.5 py-1.5 text-blue-700">COT 1.2: {formatNumber(cotValue(district.cots, "COT 1.2"))}</span>
                <span className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-700">COT 2: {formatNumber(cotValue(district.cots, "COT 2"))}</span>
                <span className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1.5 text-slate-600 ring-1 ring-slate-200">
                  <GrowthBadge current={district.count} previous={comparisonDistrict?.count ?? 0} />
                  {comparisonLabel}
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block w-full sm:w-[240px]">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Tìm phường/xã" className="pl-9" />
            </label>
            <select
              value={sortMode}
              onChange={(event) => onSortModeChange(event.target.value as "volume" | "name")}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 outline-none focus:border-blue-400"
            >
              <option value="volume">Nhiều đơn nhất</option>
              <option value="name">Tên A-Z</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto p-4 sm:p-5">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase text-slate-500">
              <th className="border-b border-slate-200 bg-slate-50 px-3 py-2.5">Phường/xã</th>
              <th className="border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-right">{isAverage ? "TB đơn/ngày" : "Tổng đơn"}</th>
              <th className="border-b border-slate-200 bg-sky-50/70 px-3 py-2.5 text-right text-sky-700">COT 1.1{isAverage ? " TB" : ""}</th>
              <th className="border-b border-slate-200 bg-blue-50/70 px-3 py-2.5 text-right text-blue-700">COT 1.2{isAverage ? " TB" : ""}</th>
              <th className="border-b border-slate-200 bg-emerald-50/70 px-3 py-2.5 text-right text-emerald-700">COT 2{isAverage ? " TB" : ""}</th>
              <th className="border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-right">Tăng trưởng</th>
            </tr>
          </thead>
          <tbody>
            {wards.map((ward, index) => (
              <tr key={ward.ward} className={cn("transition hover:bg-blue-50/60", index % 2 === 1 && "bg-slate-50/60")}>
                <td className="border-b border-slate-100 px-3 py-3 font-semibold text-slate-800">{ward.ward}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right font-black text-slate-950">{formatNumber(ward.count)}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right font-semibold text-sky-700">{formatNumber(cotValue(ward.cots, "COT 1.1"))}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right font-semibold text-blue-700">{formatNumber(cotValue(ward.cots, "COT 1.2"))}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right font-semibold text-emerald-700">{formatNumber(cotValue(ward.cots, "COT 2"))}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right">
                  <GrowthBadge
                    current={ward.count}
                    previous={comparisonDistrict?.wards.find((item) => item.ward === ward.ward)?.count ?? 0}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {district && wards.length === 0 ? <EmptyState text="Không tìm thấy phường/xã phù hợp." /> : null}
      </div>
    </div>
  );
}

function GrowthBadge({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) {
    if (current <= 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-500">
          <Minus size={12} /> 0%
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">
        <TrendingUp size={12} /> Mới
      </span>
    );
  }

  const growth = ((current - previous) / previous) * 100;
  if (Math.abs(growth) < 0.05) {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-500">
        <Minus size={12} /> 0%
      </span>
    );
  }

  const positive = growth > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-bold",
        positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700",
      )}
    >
      <Icon size={12} /> {positive ? "+" : ""}{growth.toFixed(1)}%
    </span>
  );
}

function CotMetadata({ cots }: { cots: DeliveryCotSummary[] }) {
  return (
    <div className="mt-1.5 flex gap-3 text-[11px] font-semibold text-slate-500">
      <span>COT 1.1: {formatNumber(cotValue(cots, "COT 1.1"))}</span>
      <span>COT 1.2: {formatNumber(cotValue(cots, "COT 1.2"))}</span>
      <span>COT 2: {formatNumber(cotValue(cots, "COT 2"))}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="p-6 text-center text-sm text-slate-500">{text}</p>;
}

function cotValue(cots: DeliveryCotSummary[], name: string) {
  if (name === "COT 1") {
    return cots.filter((cot) => /^COT 1(?:\.|$)/.test(cot.cot)).reduce((total, cot) => total + cot.count, 0);
  }
  return cots.find((cot) => cot.cot === name)?.count ?? 0;
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim();
}

function periodLabel(date: string, viewMode: DeliveryViewMode) {
  const formatted = formatVietnameseDate(date);
  if (viewMode === "week") return `Tuần chứa ngày ${formatted}`;
  if (viewMode === "month") return `Tháng ${formatted.slice(3)}`;
  return `Ngày ${formatted}`;
}

function formatVietnameseDate(date: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function formatShortDate(date: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}
