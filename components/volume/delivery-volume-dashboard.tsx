"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, Grid2X2, Layers3, MapPin, RefreshCcw, Search, Truck } from "lucide-react";
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
  averageDays: number;
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
  averageDays,
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
      />

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <CotVolumeCard cotVolumes={cotVolumes} totalOrders={totalOrders} loading={loading} isAverage={isAverage} />
        <DeliveryTrendCard trend={trend} loading={loading} viewMode={viewMode} />
      </div>

      <DeliveryAreaExplorer
        date={date}
        viewMode={viewMode}
        totalOrders={totalOrders}
        districts={districts}
        loading={loading}
        averageDays={averageDays}
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
}: {
  loading: boolean;
  totalOrders: number;
  districtCount: number;
  wardCount: number;
  cotCount: number;
  isAverage: boolean;
}) {
  const items = [
    { label: isAverage ? "TB đơn/ngày" : "Tổng đơn", value: totalOrders, icon: Truck, tone: "bg-blue-50 text-blue-700" },
    { label: "Quận/huyện", value: districtCount, icon: MapPin, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Phường/xã", value: wardCount, icon: Grid2X2, tone: "bg-amber-50 text-amber-700" },
    { label: "Số COT", value: cotCount, icon: Layers3, tone: "bg-slate-100 text-slate-700" },
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
          {isAverage ? "Sản lượng trung bình/ngày theo nhóm COT." : "Tỷ trọng sản lượng giữa hai nhóm vận hành."}
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {["COT 1", "COT 2"].map((name, index) => {
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
                  className={cn("h-full rounded-full", index === 0 ? "bg-blue-500" : "bg-emerald-500")}
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
  loading,
  viewMode,
}: {
  trend: DeliveryTrendPoint[];
  loading: boolean;
  viewMode: DeliveryViewMode;
}) {
  const max = Math.max(1, ...trend.map((point) => point.count));
  const label = viewMode === "day" ? "Trong ngày đã chọn" : viewMode === "week" ? "7 ngày trong tuần" : "Các ngày trong tháng";

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 className="font-bold text-slate-950">Xu hướng sản lượng</h2>
        <p className="mt-0.5 text-xs text-slate-500">{label}</p>
      </div>
      <div className="flex h-[190px] items-end gap-2 overflow-x-auto px-4 pb-4 pt-6 sm:px-5">
        {!loading && trend.length === 0 ? <p className="m-auto text-sm text-slate-500">Chưa có dữ liệu xu hướng.</p> : null}
        {trend.map((point) => (
          <div key={point.date} className="flex min-w-10 flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[10px] font-bold text-slate-500">{formatCompact(point.count)}</span>
            <div className="flex h-28 w-full max-w-12 items-end rounded-t bg-blue-50">
              <div className="w-full rounded-t bg-blue-500" style={{ height: `${Math.max(6, (point.count / max) * 100)}%` }} />
            </div>
            <span className="text-[10px] font-semibold text-slate-400">{formatShortDate(point.date)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DeliveryAreaExplorer({
  date,
  viewMode,
  totalOrders,
  districts,
  loading,
  averageDays,
}: {
  date: string;
  viewMode: DeliveryViewMode;
  totalOrders: number;
  districts: DeliveryDistrict[];
  loading: boolean;
  averageDays: number;
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
  onSelect,
}: {
  districts: DeliveryDistrict[];
  selectedDistrict: string | null;
  loading: boolean;
  isAverage: boolean;
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
  onSelect,
}: {
  district: DeliveryDistrict;
  selected: boolean;
  isAverage: boolean;
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
}: {
  district: DeliveryDistrict | null;
  wards: DeliveryWard[];
  query: string;
  onQueryChange: (value: string) => void;
  sortMode: "volume" | "name";
  onSortModeChange: (mode: "volume" | "name") => void;
  isAverage: boolean;
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
                <span className="rounded-md bg-blue-50 px-2.5 py-1.5 text-blue-700">COT 1: {formatNumber(cotValue(district.cots, "COT 1"))}</span>
                <span className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-700">COT 2: {formatNumber(cotValue(district.cots, "COT 2"))}</span>
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
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase text-slate-500">
              <th className="border-b border-slate-200 bg-slate-50 px-3 py-2.5">Phường/xã</th>
              <th className="border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-right">{isAverage ? "TB đơn/ngày" : "Tổng đơn"}</th>
              <th className="border-b border-slate-200 bg-blue-50/70 px-3 py-2.5 text-right text-blue-700">COT 1{isAverage ? " TB" : ""}</th>
              <th className="border-b border-slate-200 bg-emerald-50/70 px-3 py-2.5 text-right text-emerald-700">COT 2{isAverage ? " TB" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {wards.map((ward, index) => (
              <tr key={ward.ward} className={cn("transition hover:bg-blue-50/60", index % 2 === 1 && "bg-slate-50/60")}>
                <td className="border-b border-slate-100 px-3 py-3 font-semibold text-slate-800">{ward.ward}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right font-black text-slate-950">{formatNumber(ward.count)}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right font-semibold text-blue-700">{formatNumber(cotValue(ward.cots, "COT 1"))}</td>
                <td className="border-b border-slate-100 px-3 py-3 text-right font-semibold text-emerald-700">{formatNumber(cotValue(ward.cots, "COT 2"))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {district && wards.length === 0 ? <EmptyState text="Không tìm thấy phường/xã phù hợp." /> : null}
      </div>
    </div>
  );
}

function CotMetadata({ cots }: { cots: DeliveryCotSummary[] }) {
  return (
    <div className="mt-1.5 flex gap-3 text-[11px] font-semibold text-slate-500">
      <span>COT 1: {formatNumber(cotValue(cots, "COT 1"))}</span>
      <span>COT 2: {formatNumber(cotValue(cots, "COT 2"))}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="p-6 text-center text-sm text-slate-500">{text}</p>;
}

function cotValue(cots: DeliveryCotSummary[], name: string) {
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
