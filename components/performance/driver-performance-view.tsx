"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, CalendarDays, PackageCheck, RefreshCcw, Search, Truck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

type UpdateParams = (mutator: (params: URLSearchParams) => void) => void;

const emptySummary: PerformanceSummary = {
  groups: 0,
  active_riders: 0,
  delivery_assigned: 0,
  delivery_delivered: 0,
  pickup_assigned: 0,
  pickup_picked: 0,
};

const emptyOptions: PerformanceResult["options"] = {
  districts: [],
  cots: [],
};

export function DriverPerformanceView({ result, filters, error, loadedKey }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [clientLoading, setClientLoading] = useState(false);
  const rows = result?.rows ?? [];
  const summary = result?.summary ?? emptySummary;
  const options = result?.options ?? emptyOptions;
  const pageCount = Math.max(1, Math.ceil(summary.groups / filters.pageSize));
  const isLoading = isPending || clientLoading;

  const updateParams = useCallback<UpdateParams>((mutator) => {
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

  function changePageSize(pageSize: number) {
    updateParams((params) => {
      params.set("pageSize", String(pageSize));
      params.set("page", "1");
    });
  }

  function refresh() {
    updateParams((params) => {
      params.set("_r", String(Date.now()));
    });
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <PageHeader />

      <PerformanceFilters
        filters={filters}
        options={options}
        isLoading={isLoading}
        onRefresh={refresh}
        updateParams={updateParams}
      />

      {error ? (
        <Card className="border-red-200 bg-red-50 text-sm font-medium text-red-700">
          Không thể tải dữ liệu performance. Chi tiết: {error}
        </Card>
      ) : null}

      <PerformanceKpiCards summary={summary} page={filters.page} pageCount={pageCount} pageSize={filters.pageSize} isLoading={isLoading} />

      <RiderPerformanceTable
        rows={rows}
        summary={summary}
        filters={filters}
        pageCount={pageCount}
        isLoading={isLoading}
        onSort={changeSort}
        onPageChange={changePage}
        onPageSizeChange={changePageSize}
      />
    </div>
  );
}

function PageHeader() {
  return (
    <header className="rounded-2xl border border-slate-200/80 bg-white/85 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-slate-950 text-white shadow-sm">
            <BarChart3 size={22} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Rider Operations · KV5/KV6</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Performance Deli / Pick KV5/KV6</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Xem sản lượng rider khu 5 và 6 theo một ngày, có phân trang server-side.
            </p>
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
          <span className="font-bold text-slate-950">Ngữ cảnh:</span> chỉ tính rider KV5/KV6
        </div>
      </div>
    </header>
  );
}

function PerformanceFilters({
  filters,
  options,
  isLoading,
  onRefresh,
  updateParams,
}: {
  filters: PerformanceFilters;
  options: PerformanceResult["options"];
  isLoading: boolean;
  onRefresh: () => void;
  updateParams: UpdateParams;
}) {
  const [queryInput, setQueryInput] = useState(filters.q);

  useEffect(() => {
    const timer = window.setTimeout(() => setQueryInput(filters.q), 0);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

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

  function changeFilter(field: "kv" | "district" | "cot", value: string) {
    updateParams((params) => {
      if (value === "all") params.delete(field);
      else params.set(field, value);
      if (field === "kv") {
        params.delete("district");
        params.delete("cot");
      }
      params.set("page", "1");
    });
  }

  return (
    <section className="sticky top-16 z-20 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl" aria-label="Bộ lọc performance">
      <div className="grid gap-3 xl:grid-cols-[180px_150px_220px_160px_minmax(260px,1fr)_auto] xl:items-end">
        <label className="block" htmlFor="performance-date">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Chọn ngày</span>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input id="performance-date" type="date" className="pl-9" value={filters.date} onChange={(event) => changeDate(event.target.value)} aria-label="Chọn ngày xem performance" />
          </div>
        </label>

        <label className="block" htmlFor="performance-kv">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Khu</span>
          <Select id="performance-kv" value={filters.kv} onChange={(event) => changeFilter("kv", event.target.value)} aria-label="Lọc theo khu">
            <option value="all">KV5 + KV6</option>
            <option value="KV5">KV5</option>
            <option value="KV6">KV6</option>
          </Select>
        </label>

        <label className="block" htmlFor="performance-district">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Quận giao</span>
          <Select id="performance-district" value={filters.district} onChange={(event) => changeFilter("district", event.target.value)} aria-label="Lọc theo quận giao">
            <option value="all">Tất cả quận</option>
            {options.districts.map((district) => (
              <option key={district} value={district}>{district}</option>
            ))}
          </Select>
        </label>

        <label className="block" htmlFor="performance-cot">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">COT</span>
          <Select id="performance-cot" value={filters.cot} onChange={(event) => changeFilter("cot", event.target.value)} aria-label="Lọc theo COT">
            <option value="all">Tất cả COT</option>
            {options.cots.map((cot) => (
              <option key={cot} value={cot}>{cot}</option>
            ))}
          </Select>
        </label>

        <label className="block" htmlFor="performance-search">
          <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Tìm rider / quận / COT</span>
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

        <Button type="button" className="h-10 min-w-32" variant="secondary" disabled={isLoading} onClick={onRefresh}>
          <RefreshCcw size={16} className={isLoading ? "animate-spin" : undefined} />
          Tải lại
        </Button>
      </div>
    </section>
  );
}

function PerformanceKpiCards({
  summary,
  page,
  pageCount,
  pageSize,
  isLoading,
}: {
  summary: PerformanceSummary;
  page: number;
  pageCount: number;
  pageSize: number;
  isLoading: boolean;
}) {
  const deliRate = rate(summary.delivery_delivered, summary.delivery_assigned);
  const pickRate = rate(summary.pickup_picked, summary.pickup_assigned);

  return (
    <section className={cn("grid gap-3 md:grid-cols-2 2xl:grid-cols-4", isLoading && "opacity-70")} aria-label="Chỉ số tổng quan">
      <KpiCard
        icon={<Truck size={19} />}
        title="Deli đã giao / đã phân"
        primary={formatNumber(summary.delivery_delivered)}
        secondary={`/ ${formatNumber(summary.delivery_assigned)} đã phân`}
        rate={deliRate}
        tone={scoreTone(deliRate)}
      />
      <KpiCard
        icon={<PackageCheck size={19} />}
        title="Pick đã lấy / đã phân"
        primary={formatNumber(summary.pickup_picked)}
        secondary={`/ ${formatNumber(summary.pickup_assigned)} đã phân`}
        rate={pickRate}
        tone={scoreTone(pickRate)}
      />
      <KpiCard
        icon={<CalendarDays size={19} />}
        title="Dòng dữ liệu"
        primary={formatNumber(summary.groups)}
        secondary={`Trang ${page}/${pageCount} · ${formatNumber(pageSize)} dòng/trang`}
        tone="slate"
      />
      <KpiCard
        icon={<UsersRound size={19} />}
        title="Rider có dữ liệu"
        primary={formatNumber(summary.active_riders)}
        secondary="Chỉ tính rider KV5/KV6"
        tone="slate"
      />
    </section>
  );
}

function RiderPerformanceTable({
  rows,
  summary,
  filters,
  pageCount,
  isLoading,
  onSort,
  onPageChange,
  onPageSizeChange,
}: {
  rows: PerformanceRow[];
  summary: PerformanceSummary;
  filters: PerformanceFilters;
  pageCount: number;
  isLoading: boolean;
  onSort: (sort: PerformanceSortKey) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const filterText = useMemo(() => {
    const parts = [
      `Ngày ${formatDate(filters.date)}`,
      filters.kv === "all" ? "KV5/KV6" : filters.kv,
      filters.district === "all" ? "Tất cả quận giao" : filters.district,
      filters.cot === "all" ? "Tất cả COT" : filters.cot,
      `${formatNumber(rows.length)}/${formatNumber(summary.groups)} dòng`,
    ];
    if (filters.q) parts.push(`Tìm "${filters.q}"`);
    return parts.join(" · ");
  }, [filters.cot, filters.date, filters.district, filters.kv, filters.q, rows.length, summary.groups]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-busy={isLoading}>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-black text-slate-950">Danh sách rider theo ngày</h2>
          <p className="mt-1 text-sm text-slate-500">{filterText}</p>
        </div>
        <div className="flex items-center gap-2">
          {isLoading ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">Đang tải dữ liệu...</span> : null}
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
            {formatNumber(rows.length)} / {formatNumber(summary.groups)} dòng
          </span>
        </div>
      </div>

      <div className="relative max-h-[68vh] overflow-auto [scrollbar-gutter:stable]">
        {isLoading ? (
          <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-blue-100 bg-blue-50/95 px-4 py-2 text-sm font-semibold text-blue-700 backdrop-blur">
            <span className="size-3 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
            Đang tải dữ liệu ngày {formatDate(filters.date)}...
          </div>
        ) : null}

        <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Bảng performance Deli Pick rider KV5 KV6 theo một ngày</caption>
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-[0_1px_0_#e2e8f0]">
            <tr>
              <SortHeader label="Rider" sortKey="rider" current={filters} onSort={onSort} className="w-[24%]" />
              <th scope="col" className="px-4 py-3 font-semibold">KV / COT</th>
              <SortHeader label="Khu vực" sortKey="area" current={filters} onSort={onSort} />
              <SortHeader label="Deli" sortKey="delivery" current={filters} onSort={onSort} align="right" />
              <SortHeader label="Tỉ lệ deli" sortKey="deliveryRate" current={filters} onSort={onSort} align="right" />
              <SortHeader label="Pick" sortKey="pickup" current={filters} onSort={onSort} align="right" />
              <SortHeader label="Tỉ lệ pick" sortKey="pickupRate" current={filters} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody>
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
              rows.map((row, index) => <PerformanceTableRow key={`${row.report_date}-${row.driver_id}`} row={row} index={index} />)
            )}
          </tbody>
        </table>
      </div>

      <PaginationControls
        page={filters.page}
        pageCount={pageCount}
        pageSize={filters.pageSize}
        disabled={isLoading}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </section>
  );
}

function PerformanceTableRow({ row, index }: { row: PerformanceRow; index: number }) {
  const deliRate = row.delivery_rate;
  const pickRate = row.pickup_rate;

  return (
    <tr className={cn("transition hover:bg-blue-50/60", index % 2 === 1 ? "bg-slate-50/45" : "bg-white")}>
      <th scope="row" className="px-4 py-3 text-left">
        <p className="max-w-72 truncate font-bold text-slate-950" title={row.rider_name ?? row.driver_name ?? row.driver_id}>
          {row.rider_name ?? row.driver_name ?? "Chưa map rider"}
        </p>
        <p className="font-mono text-xs font-normal text-slate-500">{row.driver_id}</p>
      </th>
      <td className="px-4 py-3">
        <p className="font-bold text-slate-800">{row.kv ?? "—"}</p>
        <p className="text-xs text-slate-500">{row.cot ?? "—"}</p>
      </td>
      <td className="px-4 py-3">
        <p className="max-w-56 truncate font-semibold text-slate-800" title={row.delivery_district ?? undefined}>{row.delivery_district ?? "Chưa có quận giao"}</p>
        <span className="mt-1 inline-flex max-w-56 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
          Pick: {row.pickup_district ?? "—"}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <p className="font-black tabular-nums text-slate-950">{formatNumber(row.delivery_delivered)}</p>
        <p className="text-xs text-slate-400">/ {formatNumber(row.delivery_assigned)} phân</p>
      </td>
      <td className="px-4 py-3 text-right">
        <ProgressMetric value={deliRate} />
      </td>
      <td className="px-4 py-3 text-right">
        <p className="font-black tabular-nums text-slate-950">{formatNumber(row.pickup_picked)}</p>
        <p className="text-xs text-slate-400">/ {formatNumber(row.pickup_assigned)} phân</p>
      </td>
      <td className="px-4 py-3 text-right">
        <ProgressMetric value={pickRate} />
      </td>
    </tr>
  );
}

function PaginationControls({
  page,
  pageCount,
  pageSize,
  disabled,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  disabled: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const pages = pageWindow(page, pageCount);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
        <span>Trang <strong className="text-slate-800">{page}</strong> / {pageCount}</span>
        <label className="flex items-center gap-2">
          <span>Dòng/trang</span>
          <select
            value={pageSize}
            disabled={disabled}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-700 disabled:opacity-60"
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            aria-label="Chọn số dòng mỗi trang"
          >
            {[50, 100, 150, 200].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={page <= 1 || disabled} onClick={() => onPageChange(page - 1)}>
          Trước
        </Button>
        {pages.map((item) => (
          <button
            key={item}
            type="button"
            disabled={disabled}
            aria-current={item === page ? "page" : undefined}
            onClick={() => onPageChange(item)}
            className={cn(
              "grid size-9 place-items-center rounded-lg border text-sm font-bold transition disabled:opacity-60",
              item === page ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700",
            )}
          >
            {item}
          </button>
        ))}
        <Button type="button" variant="secondary" disabled={page >= pageCount || disabled} onClick={() => onPageChange(page + 1)}>
          Sau
        </Button>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  title,
  primary,
  secondary,
  rate,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  primary: string;
  secondary: string;
  rate?: number | null;
  tone: "blue" | "emerald" | "slate" | "amber" | "red";
}) {
  const classes = {
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    red: "bg-red-50 text-red-700 ring-red-100",
  };

  return (
    <Card className="min-h-36 border-slate-200/80 bg-white/90 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <span className={cn("grid size-11 place-items-center rounded-xl ring-1", classes[tone])}>{icon}</span>
        {rate !== undefined ? <span className={cn("rounded-full px-2.5 py-1 text-xs font-black", scoreBadgeClass(rate))}>{formatRate(rate)}</span> : null}
      </div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-1 flex flex-wrap items-end gap-x-2 gap-y-1">
        <p className="text-2xl font-black tabular-nums tracking-tight text-slate-950">{primary}</p>
        <p className="pb-1 text-sm font-semibold text-slate-500">{secondary}</p>
      </div>
      {rate !== undefined ? (
        <div className="mt-4">
          <ProgressBar value={rate} />
        </div>
      ) : null}
    </Card>
  );
}

function ProgressMetric({ value }: { value: number | null }) {
  return (
    <div className="ml-auto w-32">
      <p className={cn("mb-1 text-sm font-black tabular-nums", scoreTextClass(value))}>{formatRate(value)}</p>
      <ProgressBar value={value} />
    </div>
  );
}

function ProgressBar({ value }: { value: number | null }) {
  const safeValue = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
      <div className={cn("h-full rounded-full transition-all", scoreBarClass(value))} style={{ width: `${safeValue}%` }} />
    </div>
  );
}

function EmptyState({ filters }: { filters: PerformanceFilters }) {
  const scope = [
    filters.kv === "all" ? "KV5/KV6" : filters.kv,
    filters.district === "all" ? "tất cả quận giao" : filters.district,
    filters.cot === "all" ? "tất cả COT" : filters.cot,
  ].join(" · ");

  return (
    <div className="mx-auto flex min-h-80 max-w-xl flex-col items-center justify-center px-6 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
        <Search size={20} />
      </div>
      <h3 className="mt-3 font-bold text-slate-950">Không có dữ liệu performance phù hợp</h3>
      <p className="mt-2 text-sm text-slate-500">
        Đang xem ngày {formatDate(filters.date)}, bộ lọc {scope}
        {filters.q ? ` và từ khóa "${filters.q}"` : ""}. Hãy chọn ngày khác, đổi quận/COT hoặc xóa bớt từ khóa tìm kiếm.
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

function pageWindow(page: number, pageCount: number) {
  const start = Math.max(1, Math.min(page - 2, pageCount - 4));
  const end = Math.min(pageCount, start + 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
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
  if (value >= 90) return "emerald";
  if (value >= 70) return "amber";
  return "red";
}

function scoreBadgeClass(value: number | null | undefined) {
  const tone = scoreTone(value);
  if (tone === "emerald") return "bg-emerald-50 text-emerald-700";
  if (tone === "amber") return "bg-amber-50 text-amber-700";
  if (tone === "red") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-500";
}

function scoreTextClass(value: number | null | undefined) {
  const tone = scoreTone(value);
  if (tone === "emerald") return "text-emerald-700";
  if (tone === "amber") return "text-amber-700";
  if (tone === "red") return "text-red-700";
  return "text-slate-500";
}

function scoreBarClass(value: number | null | undefined) {
  const tone = scoreTone(value);
  if (tone === "emerald") return "bg-emerald-500";
  if (tone === "amber") return "bg-amber-500";
  if (tone === "red") return "bg-red-500";
  return "bg-slate-300";
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}
