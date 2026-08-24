"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, BarChart3, CalendarDays, PackageCheck, RefreshCcw, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/utils/cn";
import {
  type PerformanceDirection,
  type PerformanceFilters,
  type PerformancePeriod,
  type PerformanceResult,
  type PerformanceRow,
  type PerformanceSortKey,
  type PerformanceSummary,
  type PerformanceWardRow,
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
  wards: [],
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
  const wardOnHold = result?.wardOnHold ?? [];
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
    <div className="perf-page mx-auto max-w-[1600px]">
      <PageHeader />

      <PerformanceFilters
        filters={filters}
        options={options}
        isLoading={isLoading}
        onRefresh={refresh}
        updateParams={updateParams}
      />

      {error ? (
        <div className="perf-error" role="alert">
          Không thể tải dữ liệu performance. Chi tiết: {error}
        </div>
      ) : null}

      <PerformanceKpiCards summary={summary} page={filters.page} pageCount={pageCount} pageSize={filters.pageSize} isLoading={isLoading} />

      <WardOnHoldChart rows={wardOnHold} filters={filters} isLoading={isLoading} />

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
    <header className="perf-header">
      <div className="perf-header-top">
        <span className="perf-mark">
          <BarChart3 size={22} />
        </span>
        <div className="perf-header-copy">
          <p className="perf-kicker">Rider Operations · KV5/KV6</p>
          <h1 className="perf-title">Performance Deli / Pick KV5/KV6</h1>
          <p className="perf-desc">
            Xem sản lượng rider khu 5 và 6 theo ngày, tuần hoặc tháng — có phân trang server-side.
          </p>
        </div>
      </div>
      <div className="perf-scope">
        <span>Ngữ cảnh</span>
        <strong>Chỉ tính rider KV5/KV6 · Tổng hợp theo chu kỳ đã chọn</strong>
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

  function changeFilter(field: "kv" | "district" | "ward" | "cot", value: string) {
    updateParams((params) => {
      if (value === "all") params.delete(field);
      else params.set(field, value);
      if (field === "kv") {
        params.delete("district");
        params.delete("ward");
        params.delete("cot");
      }
      if (field === "district") params.delete("ward");
      params.set("page", "1");
    });
  }

  return (
    <section className="perf-filters" aria-label="Bộ lọc performance">
      <div className="perf-filters-period">
        <div className="perf-filters-label">
          <span>Chu kỳ thống kê</span>
          <small>Ngày, tuần gần nhất hoặc tháng hiện tại</small>
        </div>
        <div className="perf-period-toggle" role="group" aria-label="Chọn chu kỳ thống kê">
          {(["day", "week", "month"] as const).map((period) => (
            <button
              key={period}
              type="button"
              aria-pressed={filters.period === period}
              className={cn("perf-period-option", filters.period === period && "is-active")}
              onClick={() =>
                updateParams((params) => {
                  params.set("period", period);
                  params.set("page", "1");
                })
              }
            >
              {periodLabel(period)}
            </button>
          ))}
        </div>
      </div>

      <div className="perf-filters-grid">
        <label className="block" htmlFor="performance-date">
          <span className="perf-field-label">Chọn ngày</span>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" size={16} />
            <Input id="performance-date" type="date" className="pl-9" value={filters.date} onChange={(event) => changeDate(event.target.value)} aria-label="Chọn ngày xem performance" />
          </div>
        </label>

        <label className="block" htmlFor="performance-kv">
          <span className="perf-field-label">Khu</span>
          <Select id="performance-kv" value={filters.kv} onChange={(event) => changeFilter("kv", event.target.value)} aria-label="Lọc theo khu">
            <option value="all">KV5 + KV6</option>
            <option value="KV5">KV5</option>
            <option value="KV6">KV6</option>
          </Select>
        </label>

        <label className="block" htmlFor="performance-district">
          <span className="perf-field-label">Quận giao</span>
          <Select id="performance-district" value={filters.district} onChange={(event) => changeFilter("district", event.target.value)} aria-label="Lọc theo quận giao">
            <option value="all">Tất cả quận</option>
            {options.districts.map((district) => (
              <option key={district} value={district}>{district}</option>
            ))}
          </Select>
        </label>

        <label className="block" htmlFor="performance-ward">
          <span className="perf-field-label">Phường</span>
          <Select id="performance-ward" value={filters.ward} onChange={(event) => changeFilter("ward", event.target.value)} aria-label="Lọc theo phường giao">
            <option value="all">Tất cả phường</option>
            {options.wards.map((ward) => (
              <option key={ward} value={ward}>{ward}</option>
            ))}
          </Select>
        </label>

        <label className="block" htmlFor="performance-cot">
          <span className="perf-field-label">COT</span>
          <Select id="performance-cot" value={filters.cot} onChange={(event) => changeFilter("cot", event.target.value)} aria-label="Lọc theo COT">
            <option value="all">Tất cả COT</option>
            {options.cots.map((cot) => (
              <option key={cot} value={cot}>{cot}</option>
            ))}
          </Select>
        </label>

        <label className="block" htmlFor="performance-search">
          <span className="perf-field-label">Tìm rider / quận / phường / COT</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" size={16} />
            <Input
              id="performance-search"
              className="pl-9"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              placeholder="Tên, ID, KV, COT, quận, phường..."
              aria-describedby="performance-search-help"
            />
          </div>
          <span id="performance-search-help" className="sr-only">Tìm kiếm tự động sau khi ngừng gõ.</span>
        </label>

        <Button type="button" className="perf-refresh" variant="secondary" disabled={isLoading} onClick={onRefresh}>
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
    <section className={cn("perf-kpis", isLoading && "is-loading")} aria-label="Chỉ số tổng quan">
      <div className="perf-kpi-grid">
        <KpiCard
          icon={<Truck size={18} />}
          title="Deli đã giao / đã phân"
          primary={formatNumber(summary.delivery_delivered)}
          secondary={`/ ${formatNumber(summary.delivery_assigned)} đã phân`}
          rate={deliRate}
        />
        <KpiCard
          icon={<PackageCheck size={18} />}
          title="Pick đã lấy / đã phân"
          primary={formatNumber(summary.pickup_picked)}
          secondary={`/ ${formatNumber(summary.pickup_assigned)} đã phân`}
          rate={pickRate}
        />
      </div>
      <div className="perf-kpi-context" aria-label="Thông tin dữ liệu đang xem">
        <ContextStat label="Dòng dữ liệu" value={formatNumber(summary.groups)} sub={`Trang ${page}/${pageCount} · ${formatNumber(pageSize)} dòng/trang`} />
        <ContextStat label="Rider có dữ liệu" value={formatNumber(summary.active_riders)} sub="Chỉ tính rider KV5/KV6" />
      </div>
    </section>
  );
}

function WardOnHoldChart({ rows, filters, isLoading }: { rows: PerformanceWardRow[]; filters: PerformanceFilters; isLoading: boolean }) {
  const [sortKey, setSortKey] = useState<"rate" | "count">("rate");
  const isAllDistricts = filters.district === "all";

  const items = useMemo(() => {
    if (isAllDistricts) {
      const map = new Map<string, { name: string; assigned: number; delivered: number }>();
      for (const row of rows) {
        const name = row.district ?? "Chưa xác định";
        const item = map.get(name) ?? { name, assigned: 0, delivered: 0 };
        item.assigned += row.delivery_assigned;
        item.delivered += row.delivery_delivered;
        map.set(name, item);
      }
      return Array.from(map.values()).map((item) => {
        const onHold = Math.max(0, item.assigned - item.delivered);
        return { key: item.name, name: item.name, onHold, assigned: item.assigned, rate: item.assigned > 0 ? (onHold / item.assigned) * 100 : null };
      });
    }
    return rows
      .filter((row) => row.ward)
      .map((row) => {
        const onHold = Math.max(0, row.delivery_assigned - row.delivery_delivered);
        return { key: `${row.district}-${row.ward}`, name: row.ward as string, onHold, assigned: row.delivery_assigned, rate: row.rate };
      });
  }, [rows, isAllDistricts]);

  const data = useMemo(
    () =>
      [...items]
        .sort((a, b) =>
          sortKey === "rate"
            ? (b.rate ?? -1) - (a.rate ?? -1) || b.onHold - a.onHold
            : b.onHold - a.onHold || (b.rate ?? -1) - (a.rate ?? -1),
        )
        .slice(0, 12),
    [items, sortKey],
  );

  const totalOnHold = data.reduce((sum, row) => sum + row.onHold, 0);
  const scope = periodScopeLabel(filters);
  const title = isAllDistricts ? "Quận On Hold cao nhất" : "Phường On Hold cao nhất";

  return (
    <section className="perf-ward-onhold" aria-label={title}>
      <div className="perf-ward-head">
        <div>
          <h2>{title}</h2>
          <p>
            {scope} · {isAllDistricts ? "tất cả quận" : filters.district} · {formatNumber(totalOnHold)} đơn OH · xếp theo{" "}
            {sortKey === "rate" ? "tỉ lệ" : "số đơn"}
          </p>
        </div>
        <div className="perf-period-toggle" role="group" aria-label="Xếp hạng on hold">
          <button type="button" aria-pressed={sortKey === "rate"} className={cn("perf-period-option", sortKey === "rate" && "is-active")} onClick={() => setSortKey("rate")}>
            Theo tỉ lệ
          </button>
          <button type="button" aria-pressed={sortKey === "count"} className={cn("perf-period-option", sortKey === "count" && "is-active")} onClick={() => setSortKey("count")}>
            Theo số đơn
          </button>
        </div>
      </div>

      {isLoading && data.length === 0 ? (
        <div className="perf-ward-list is-loading" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => <div key={index} className="perf-ward-row" />)}
        </div>
      ) : data.length === 0 ? (
        <p className="perf-ward-empty">Không có dữ liệu On Hold trong phạm vi đang chọn.</p>
      ) : (
        <div className="perf-ward-list">
          {data.map((row, index) => (
            <div className="perf-ward-row" key={row.key}>
              <span className="perf-ward-rank">{String(index + 1).padStart(2, "0")}</span>
              <div className="perf-ward-main">
                <p className="perf-ward-name" title={row.name}>{row.name}</p>
                <div className="perf-ward-track" aria-hidden="true">
                  <span className="perf-ward-fill" style={{ width: `${Math.min(100, row.rate ?? 0)}%` }} />
                </div>
              </div>
              <div className="perf-ward-value">
                <strong className={scoreTextClass(row.rate)}>{formatRate(row.rate)}</strong>
                <span>{formatNumber(row.onHold)} đơn OH</span>
              </div>
            </div>
          ))}
        </div>
      )}
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
      periodScopeLabel(filters),
      filters.kv === "all" ? "KV5/KV6" : filters.kv,
      filters.district === "all" ? "Tất cả quận giao" : filters.district,
      filters.ward === "all" ? "Tất cả phường" : filters.ward,
      filters.cot === "all" ? "Tất cả COT" : filters.cot,
      `${formatNumber(rows.length)}/${formatNumber(summary.groups)} dòng`,
    ];
    if (filters.q) parts.push(`Tìm "${filters.q}"`);
    return parts.join(" · ");
  }, [filters, rows.length, summary.groups]);

  return (
    <section className="perf-table" aria-busy={isLoading}>
      <div className="perf-table-head">
        <div>
          <h2 className="perf-table-title">Danh sách rider</h2>
          <p className="perf-table-sub">{filterText}</p>
        </div>
        <div className="flex items-center gap-2">
          {isLoading ? <span className="perf-badge is-loading">Đang tải dữ liệu...</span> : null}
          <span className="perf-badge">
            {formatNumber(rows.length)} / {formatNumber(summary.groups)} dòng
          </span>
        </div>
      </div>

      <div className="relative max-h-[68vh] overflow-auto [scrollbar-gutter:stable]">
        {isLoading ? (
          <div className="perf-loading-bar">
            <span className="size-3 animate-spin rounded-full border-2 border-[var(--color-accent-soft)] border-t-[var(--color-accent)]" />
            Đang tải dữ liệu {filters.period === "day" ? `ngày ${formatDate(filters.date)}` : periodScopeLabel(filters)}...
          </div>
        ) : null}

        <table className="w-full min-w-[1120px] border-separate border-spacing-0 text-left text-sm">
          <caption className="sr-only">Bảng performance Deli Pick rider KV5 KV6</caption>
          <thead className="perf-table-thead">
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
                    <div className="h-4 rounded bg-[var(--color-paper-2)]" />
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
    <tr className={cn("transition hover:bg-[var(--color-accent-soft)]", index % 2 === 1 ? "bg-[var(--color-paper-2)]" : "bg-[var(--color-paper)]")}>
      <th scope="row" className="px-4 py-3 text-left">
        <p className="max-w-72 truncate font-bold text-[var(--color-ink)]" title={row.rider_name ?? row.driver_name ?? row.driver_id}>
          {row.rider_name ?? row.driver_name ?? "Chưa map rider"}
        </p>
        <p className="font-mono text-xs font-normal text-[var(--color-muted)]">{row.driver_id}</p>
      </th>
      <td className="px-4 py-3">
        <p className="font-bold text-[var(--color-ink-2)]">{row.kv ?? "—"}</p>
        <p className="text-xs text-[var(--color-muted)]">{row.cot ?? "—"}</p>
      </td>
      <td className="px-4 py-3">
        <p className="max-w-56 truncate font-semibold text-[var(--color-ink-2)]" title={row.delivery_district ?? undefined}>{row.delivery_district ?? "Chưa có quận giao"}</p>
        <span className="mt-1 inline-flex max-w-56 truncate rounded-full bg-[var(--color-paper-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-muted)]" title={row.delivery_ward ?? undefined}>
          {row.delivery_ward ?? "Chưa có phường"}
        </span>
        <span className="mt-1 inline-flex max-w-56 truncate rounded-full bg-[var(--color-paper-2)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-muted)]" title={row.pickup_district ?? undefined}>
          Pick: {row.pickup_district ?? "—"}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <p className="font-black tabular-nums text-[var(--color-ink)]">{formatNumber(row.delivery_delivered)}</p>
        <p className="text-xs text-[var(--color-muted)]">/ {formatNumber(row.delivery_assigned)} phân</p>
      </td>
      <td className="px-4 py-3 text-right">
        <ProgressMetric value={deliRate} />
      </td>
      <td className="px-4 py-3 text-right">
        <p className="font-black tabular-nums text-[var(--color-ink)]">{formatNumber(row.pickup_picked)}</p>
        <p className="text-xs text-[var(--color-muted)]">/ {formatNumber(row.pickup_assigned)} phân</p>
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
    <div className="flex flex-col gap-3 border-t border-[var(--color-rule)] bg-[var(--color-paper)] p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-muted)]">
        <span>Trang <strong className="text-[var(--color-ink)]">{page}</strong> / {pageCount}</span>
        <label className="flex items-center gap-2">
          <span>Dòng/trang</span>
          <select
            value={pageSize}
            disabled={disabled}
            className="rounded-lg border border-[var(--color-rule-strong)] bg-[var(--color-paper)] px-2 py-1 text-sm font-semibold text-[var(--color-ink)] disabled:opacity-60"
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
              item === page ? "border-[var(--color-graphite)] bg-[var(--color-graphite)] text-[var(--color-graphite-ink)]" : "border-[var(--color-rule-strong)] bg-[var(--color-paper)] text-[var(--color-ink-2)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]",
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
}: {
  icon: React.ReactNode;
  title: string;
  primary: string;
  secondary: string;
  rate: number | null;
}) {
  return (
    <Card className="perf-kpi">
      <div className="perf-kpi-top">
        <span className="perf-kpi-icon">{icon}</span>
        <span className={cn("perf-kpi-badge", scoreBadgeClass(rate))}>{formatRate(rate)}</span>
      </div>
      <div className="perf-kpi-body">
        <p className="perf-kpi-title">{title}</p>
        <div className="perf-kpi-numbers">
          <p className="perf-kpi-value">{primary}</p>
          <p className="perf-kpi-secondary">{secondary}</p>
        </div>
      </div>
      <div className="perf-kpi-foot">
        <ProgressBar value={rate} />
      </div>
    </Card>
  );
}

function ContextStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="perf-context-stat">
      <span className="perf-context-label">{label}</span>
      <strong className="perf-context-value">{value}</strong>
      {sub ? <span className="perf-context-sub">{sub}</span> : null}
    </div>
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
    <div className="h-2 overflow-hidden rounded-full bg-[var(--color-paper-2)]" aria-hidden="true">
      <div className={cn("h-full rounded-full transition-all", scoreBarClass(value))} style={{ width: `${safeValue}%` }} />
    </div>
  );
}

function EmptyState({ filters }: { filters: PerformanceFilters }) {
  const scope = [
    filters.kv === "all" ? "KV5/KV6" : filters.kv,
    filters.district === "all" ? "tất cả quận giao" : filters.district,
    filters.ward === "all" ? "tất cả phường" : filters.ward,
    filters.cot === "all" ? "tất cả COT" : filters.cot,
  ].join(" · ");

  return (
    <div className="mx-auto flex min-h-80 max-w-xl flex-col items-center justify-center px-6 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-[var(--color-paper-2)] text-[var(--color-muted)]">
        <Search size={20} />
      </div>
      <h3 className="mt-3 font-bold text-[var(--color-ink)]">Không có dữ liệu performance phù hợp</h3>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Đang xem {periodScopeLabel(filters)}, bộ lọc {scope}
        {filters.q ? ` và từ khóa "${filters.q}"` : ""}. Hãy đổi chu kỳ, chọn ngày khác, đổi quận/COT hoặc xóa bớt từ khóa tìm kiếm.
      </p>
    </div>
  );
}

function SortHeader({ label, sortKey, current, onSort, align, className }: { label: string; sortKey: PerformanceSortKey; current: PerformanceFilters; onSort: (key: PerformanceSortKey) => void; align?: "right"; className?: string }) {
  const Icon = current.sort !== sortKey ? ArrowUpDown : current.dir === "asc" ? ArrowUp : ArrowDown;
  const directionLabel = current.sort === sortKey ? (current.dir === "asc" ? "tăng dần" : "giảm dần") : "chưa sắp xếp";
  return (
    <th scope="col" className={cn("px-4 py-3 font-semibold", className)} aria-sort={current.sort === sortKey ? (current.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={cn("flex items-center gap-1 hover:text-[var(--color-ink)]", align === "right" && "ml-auto")} onClick={() => onSort(sortKey)} aria-label={`Sắp xếp ${label}, hiện ${directionLabel}`}>
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

function periodLabel(period: PerformancePeriod) {
  return period === "day" ? "Ngày" : period === "week" ? "Tuần" : "Tháng";
}

function periodScopeLabel(filters: PerformanceFilters) {
  if (filters.period === "week") return `Tuần đến ${formatDate(filters.date)}`;
  if (filters.period === "month") return `Tháng ${filters.date.slice(0, 7)}`;
  return `Ngày ${formatDate(filters.date)}`;
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
  if (tone === "emerald") return "bg-[var(--color-success-soft)] text-[var(--color-success)]";
  if (tone === "amber") return "bg-[var(--color-warning-soft)] text-[var(--color-warning)]";
  if (tone === "red") return "bg-[var(--color-error-soft)] text-[var(--color-error)]";
  return "bg-[var(--color-paper-2)] text-[var(--color-muted)]";
}

function scoreTextClass(value: number | null | undefined) {
  const tone = scoreTone(value);
  if (tone === "emerald") return "text-[var(--color-success)]";
  if (tone === "amber") return "text-[var(--color-warning)]";
  if (tone === "red") return "text-[var(--color-error)]";
  return "text-[var(--color-muted)]";
}

function scoreBarClass(value: number | null | undefined) {
  const tone = scoreTone(value);
  if (tone === "emerald") return "bg-[var(--color-success)]";
  if (tone === "amber") return "bg-[var(--color-warning)]";
  if (tone === "red") return "bg-[var(--color-error)]";
  return "bg-[var(--color-rule-strong)]";
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}
