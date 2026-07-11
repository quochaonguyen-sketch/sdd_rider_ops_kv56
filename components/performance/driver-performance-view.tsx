"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, CalendarDays, PackageCheck, RefreshCcw, Search, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import {
  type PerformanceDirection,
  type PerformanceFilters,
  type PerformanceResult,
  type PerformanceRow,
  type PerformanceSortKey,
  type PerformanceSummary,
} from "@/lib/performance/driver-performance";

type Props = {
  result: PerformanceResult | null;
  filters: PerformanceFilters;
  error: string | null;
  loadedKey: string;
};

const emptySummary: PerformanceSummary = {
  groups: 0,
  active_riders: 0,
  delivery_assigned: 0,
  delivery_delivered: 0,
  pickup_assigned: 0,
  pickup_picked: 0,
};

export function DriverPerformanceView({ result, filters, error, loadedKey }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [clientLoading, setClientLoading] = useState(false);
  const [queryInput, setQueryInput] = useState(filters.q);
  const rows = result?.rows ?? [];
  const summary = result?.summary ?? emptySummary;
  const pageCount = Math.max(1, Math.ceil(summary.groups / filters.pageSize));
  const isLoading = isPending || clientLoading;

  const updateParams = useCallback((mutator: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutator(params);
    const nextUrl = `${pathname}?${params.toString()}`;
    const currentUrl = `${pathname}?${searchParams.toString()}`;
    if (nextUrl === currentUrl) return;
    setClientLoading(true);
    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setClientLoading(false), 0);
    return () => window.clearTimeout(timer);
  }, [loadedKey]);

  useEffect(() => {
    const nextQuery = queryInput.trim();
    if (nextQuery === filters.q) return;
    const timer = window.setTimeout(() => {
      updateParams((params) => {
        if (nextQuery) params.set("q", nextQuery);
        else params.delete("q");
        params.set("page", "1");
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [filters.q, queryInput, updateParams]);

  const activeFilterText = useMemo(() => {
    const parts = [`ngày ${formatDate(filters.date)}`, "KV5/KV6"];
    if (filters.q) parts.push(`tìm "${filters.q}"`);
    return parts.join(" · ");
  }, [filters.date, filters.q]);

  function changeDate(value: string) {
    updateParams((params) => {
      params.set("date", value);
      params.set("page", "1");
      params.delete("preset");
      params.delete("mode");
      params.delete("start");
      params.delete("end");
    });
  }

  function changeSort(sort: PerformanceSortKey) {
    updateParams((params) => {
      const nextDirection: PerformanceDirection = filters.sort === sort && filters.dir === "desc" ? "asc" : "desc";
      params.set("sort", sort);
      params.set("dir", nextDirection);
      params.set("page", "1");
    });
  }

  function changePage(nextPage: number) {
    updateParams((params) => {
      params.set("page", String(Math.min(pageCount, Math.max(1, nextPage))));
    });
  }

  function refresh() {
    updateParams((params) => {
      params.set("_r", String(Date.now()));
    });
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-slate-950 text-white">
              <BarChart3 size={21} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Performance Deli / Pick KV5/KV6</h1>
              <p className="mt-0.5 text-sm text-slate-500">Xem sản lượng rider khu 5 và 6 theo một ngày, có phân trang server-side.</p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[180px_minmax(260px,1fr)_auto] xl:min-w-[680px]">
          <label className="block" htmlFor="performance-date">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Chọn ngày</span>
            <Input id="performance-date" type="date" value={filters.date} onChange={(event) => changeDate(event.target.value)} />
          </label>
          <label className="block" htmlFor="performance-search">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Tìm rider / quận / COT</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input
                id="performance-search"
                className="pl-9"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Tên, ID, KV, COT, quận..."
                aria-describedby="performance-search-help"
              />
            </div>
            <span id="performance-search-help" className="sr-only">Tìm kiếm tự động sau khi ngừng gõ.</span>
          </label>
          <div className="flex items-end">
            <Button type="button" className="w-full" variant="secondary" disabled={isLoading} onClick={refresh}>
              <RefreshCcw size={16} />
              Tải lại
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50 text-sm font-medium text-red-700">
          Không thể tải dữ liệu performance. Chi tiết: {error}
        </Card>
      ) : null}

      <div className={cn("grid grid-cols-2 gap-3 xl:grid-cols-4", isLoading && "opacity-60")}>
        <MetricCard icon={<Truck size={18} />} label="Deli đã giao / đã phân" value={`${formatNumber(summary.delivery_delivered)} / ${formatNumber(summary.delivery_assigned)}`} helper={formatRate(rate(summary.delivery_delivered, summary.delivery_assigned))} tone={scoreTone(rate(summary.delivery_delivered, summary.delivery_assigned))} />
        <MetricCard icon={<PackageCheck size={18} />} label="Pick đã lấy / đã phân" value={`${formatNumber(summary.pickup_picked)} / ${formatNumber(summary.pickup_assigned)}`} helper={formatRate(rate(summary.pickup_picked, summary.pickup_assigned))} tone={scoreTone(rate(summary.pickup_picked, summary.pickup_assigned))} />
        <MetricCard icon={<CalendarDays size={18} />} label="Dòng dữ liệu" value={formatNumber(summary.groups)} helper={`Trang ${filters.page}/${pageCount} · ${formatNumber(filters.pageSize)} dòng/trang`} tone="slate" />
        <MetricCard icon={<BarChart3 size={18} />} label="Rider có dữ liệu" value={formatNumber(summary.active_riders)} helper="Chỉ tính rider KV5/KV6" tone="slate" />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-busy={isLoading}>
        <div className="flex flex-col gap-1 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-950">Danh sách rider theo ngày</h2>
            <p className="text-sm text-slate-500">Bộ lọc: {activeFilterText}.</p>
          </div>
          <div className="flex items-center gap-2">
            {isLoading ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Đang tải dữ liệu...</span> : null}
            <Badge tone="blue">{formatNumber(rows.length)} / {formatNumber(summary.groups)} dòng</Badge>
          </div>
        </div>

        <div className="relative max-h-[68vh] overflow-auto [scrollbar-gutter:stable]">
          {isLoading ? (
            <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-blue-100 bg-blue-50/95 px-4 py-2 text-sm font-semibold text-blue-700 backdrop-blur">
              <span className="size-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
              Đang tải dữ liệu ngày {formatDate(filters.date)}...
            </div>
          ) : null}
          <table className="w-full min-w-[1040px] text-left text-sm">
            <caption className="sr-only">Bảng performance Deli Pick rider KV5 KV6 theo một ngày</caption>
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-[0_1px_0_#e2e8f0]">
              <tr>
                <SortHeader label="Rider" sortKey="rider" current={filters} onSort={changeSort} />
                <th scope="col" className="px-4 py-3 font-semibold">KV / COT</th>
                <th scope="col" className="px-4 py-3 font-semibold">Khu vực</th>
                <SortHeader label="Deli" sortKey="delivery" current={filters} onSort={changeSort} align="right" />
                <SortHeader label="Tỉ lệ deli" sortKey="deliveryRate" current={filters} onSort={changeSort} align="right" />
                <SortHeader label="Pick" sortKey="pickup" current={filters} onSort={changeSort} align="right" />
                <SortHeader label="Tỉ lệ pick" sortKey="pickupRate" current={filters} onSort={changeSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && rows.length === 0 ? (
                Array.from({ length: 8 }, (_, index) => (
                  <tr key={index} className="h-16 animate-pulse">
                    <td colSpan={7} className="px-4">
                      <div className="h-4 rounded bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState filters={filters} />
                  </td>
                </tr>
              ) : (
                rows.map((row) => <PerformanceTableRow key={`${row.report_date}-${row.driver_id}`} row={row} />)
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">Trang <strong className="text-slate-800">{filters.page}</strong> / {pageCount}</p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={filters.page <= 1 || isLoading} onClick={() => changePage(filters.page - 1)}>
              Trước
            </Button>
            <Button type="button" variant="secondary" disabled={filters.page >= pageCount || isLoading} onClick={() => changePage(filters.page + 1)}>
              Sau
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PerformanceTableRow({ row }: { row: PerformanceRow }) {
  return (
    <tr className="transition hover:bg-blue-50/40">
      <th scope="row" className="px-4 py-3 text-left">
        <p className="font-semibold text-slate-950">{row.rider_name ?? row.driver_name ?? "Chưa map rider"}</p>
        <p className="font-mono text-xs font-normal text-slate-500">{row.driver_id}</p>
      </th>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-800">{row.kv ?? "—"}</p>
        <p className="text-xs text-slate-500">{row.cot ?? "—"}</p>
      </td>
      <td className="px-4 py-3">
        <p className="max-w-56 truncate font-medium text-slate-800">{row.delivery_district ?? "Chưa có quận giao"}</p>
        <p className="max-w-56 truncate text-xs text-slate-500">Pick: {row.pickup_district ?? "—"}</p>
      </td>
      <td className="px-4 py-3 text-right">
        <p className="font-bold tabular-nums text-slate-950">{formatNumber(row.delivery_delivered)}</p>
        <p className="text-xs text-slate-400">/ {formatNumber(row.delivery_assigned)} phân</p>
      </td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{formatRate(row.delivery_rate)}</td>
      <td className="px-4 py-3 text-right">
        <p className="font-bold tabular-nums text-slate-950">{formatNumber(row.pickup_picked)}</p>
        <p className="text-xs text-slate-400">/ {formatNumber(row.pickup_assigned)} phân</p>
      </td>
      <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{formatRate(row.pickup_rate)}</td>
    </tr>
  );
}

function EmptyState({ filters }: { filters: PerformanceFilters }) {
  return (
    <div className="mx-auto flex min-h-80 max-w-xl flex-col items-center justify-center px-6 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
        <Search size={20} />
      </div>
      <h3 className="mt-3 font-bold text-slate-950">Không có dữ liệu performance phù hợp</h3>
      <p className="mt-2 text-sm text-slate-500">
        Đang xem ngày {formatDate(filters.date)}, chỉ rider KV5/KV6
        {filters.q ? ` và từ khóa "${filters.q}"` : ""}. Hãy chọn ngày khác hoặc xóa bớt từ khóa tìm kiếm.
      </p>
    </div>
  );
}

function SortHeader({ label, sortKey, current, onSort, align, className }: { label: string; sortKey: PerformanceSortKey; current: PerformanceFilters; onSort: (key: PerformanceSortKey) => void; align?: "right"; className?: string }) {
  const Icon = current.sort !== sortKey ? ArrowUpDown : current.dir === "asc" ? ArrowUp : ArrowDown;
  const directionLabel = current.sort === sortKey ? (current.dir === "asc" ? "tăng dần" : "giảm dần") : "chưa sắp xếp";
  return (
    <th scope="col" className={cn("px-4 py-3 font-semibold", className)} aria-sort={current.sort === sortKey ? (current.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={cn("flex items-center gap-1 hover:text-slate-950", align === "right" && "ml-auto")} onClick={() => onSort(sortKey)} aria-label={`Sắp xếp ${label}, hiện ${directionLabel}`}>
        {label}
        <Icon size={13} />
      </button>
    </th>
  );
}

function MetricCard({ icon, label, value, helper, tone }: { icon: React.ReactNode; label: string; value: string; helper: string; tone: "blue" | "emerald" | "slate" | "amber" | "red" }) {
  const classes = {
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <Card className="min-h-32">
      <span className={cn("grid size-10 place-items-center rounded-lg", classes[tone])}>{icon}</span>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{helper}</p>
    </Card>
  );
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("vi-VN").format(value ?? 0);
}

function formatRate(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}

function scoreTone(value: number | null | undefined): "blue" | "emerald" | "slate" | "amber" | "red" {
  if (value === null || value === undefined) return "slate";
  if (value >= 95) return "emerald";
  if (value >= 85) return "blue";
  if (value >= 70) return "amber";
  return "red";
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}
