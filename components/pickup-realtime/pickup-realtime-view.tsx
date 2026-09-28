/* Pickup Realtime · KV5 + KV6
 * Layout, tokens and shared widgets follow the Realtime Delivery dashboard
 * (dashboard-command-header, KpiCard, RealtimeIndicator, Button/Input/Select).
 * Data (Supabase 1, written by SPX_Launcher job "pickup48h", REPLACE = latest snapshot only):
 *  - pickup_48h_summary_groups: route x ward x COT. The ONLY source for route and ward totals.
 *    `ward` = clean NEW ward (2025 structure), `area` = KV of that ward (sheet "Coverage SA"),
 *    `route_area` = dominant KV of the route's wards.
 *  - pickup_48h_realtime_riders: one row per KV5/KV6 rider (riders.kv).
 *  - pickup_48h_rider_groups: rider x route x ward (never summed per route: shared routes double count).
 *  - riders: rider profile (riders.cot). The Rider table's COT column shows this profile value
 *    normalised to COT1/COT2 (same source as Realtime Delivery), NOT the summary sheet's cot column.
 * Since the 2025 merge there is no district level: "quận" from the API is just the city.
 */
"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  MapPin,
  PackageCheck,
  PauseCircle,
  RefreshCcw,
  Route as RouteIcon,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { KpiCard, RealtimeIndicator } from "@/components/realtime-dashboard/realtime-dashboard-view";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/utils/cn";

type Area = "KV5" | "KV6";
type AreaFilter = Area | "all";

type SummaryGroupRow = {
  snapshot_id: string;
  snapshot_at: string | null;
  khu_vuc: string;
  ward: string | null;
  cot: string;
  area: string | null;
  route_area: string | null;
  assign_orders: number | null;
  picked_orders: number | null;
  onhold_orders: number | null;
};

type RiderRow = {
  snapshot_id: string;
  driver_id: string;
  driver_name: string | null;
  area: string | null;
  zones: string | null;
  total_pickup_quantity: number | null;
  pickup_point_count: number | null;
  assigned_orders: number | null;
  onhold_orders: number | null;
};

type RiderGroupRow = {
  snapshot_id: string;
  driver_id: string;
  khu_vuc: string;
  ward: string | null;
  ward_area: string | null;
  assigned_orders: number | null;
  picked_orders: number | null;
  onhold_orders: number | null;
};

type RiderProfileRow = {
  rider_code: string | null;
  cot: string | null;
};

type Metrics = { assigned: number; picked: number; onhold: number };
type SummaryGroup = Metrics & { route: string; ward: string; cot: string; area: Area | null; routeArea: Area | null };
type RiderGroup = Metrics & { route: string; ward: string; wardArea: Area | null };
type Rider = Metrics & { id: string; name: string; area: Area | null; cot: string; routes: string[]; pickupPoints: number; groups: RiderGroup[] };
type RouteTotal = Metrics & { route: string; area: Area | null; wards: number; riders: number };
type WardTotal = Metrics & { ward: string; area: Area | null; routes: number; riders: number };
type RiderView = Rider & { view: Metrics };
type Snapshot = { summary: SummaryGroup[]; riders: Rider[]; snapshotAt: string | null };
type Filters = { area: AreaFilter; ward: string; route: string; cot: string };
type RiderSortKey = "name" | "cot" | "assigned" | "picked" | "onhold" | "rate";
type RouteSortKey = "route" | "assigned" | "picked" | "onhold" | "rate";
type Sort<K extends string> = { key: K; direction: "asc" | "desc" };
type Options = { wards: string[]; routes: string[]; cots: string[] };

const AREAS: readonly Area[] = ["KV5", "KV6"];
const UNKNOWN_WARD = "Chưa xác định";
const RIDER_PAGE_SIZE = 20;
const ROUTE_PAGE_SIZE = 12;
const RELOAD_DEBOUNCE_MS = 1500;
const EMPTY: Snapshot = { summary: [], riders: [], snapshotAt: null };
const DEFAULT_FILTERS: Filters = { area: "all", ward: "all", route: "all", cot: "all" };
const SUMMARY_COLUMNS = "snapshot_id,snapshot_at,khu_vuc,ward,cot,area,route_area,assign_orders,picked_orders,onhold_orders";
const RIDER_COLUMNS = "snapshot_id,driver_id,driver_name,area,zones,total_pickup_quantity,pickup_point_count,assigned_orders,onhold_orders";
const RIDER_GROUP_COLUMNS = "snapshot_id,driver_id,khu_vuc,ward,ward_area,assigned_orders,picked_orders,onhold_orders";
const RIDER_PROFILE_COLUMNS = "rider_code,cot";
const KV_LIST = AREAS.join(",");

export function PickupRealtimeView() {
  const [data, setData] = useState<Snapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [query, setQuery] = useState("");
  const [riderSort, setRiderSort] = useState<Sort<RiderSortKey>>({ key: "assigned", direction: "desc" });
  const [routeSort, setRouteSort] = useState<Sort<RouteSortKey>>({ key: "assigned", direction: "desc" });
  const [riderPage, setRiderPage] = useState(1);
  const [routePage, setRoutePage] = useState(1);
  const [expandedRider, setExpandedRider] = useState<string | null>(null);
  useReportInitialDataLoading("pickup-realtime", loading);

  const requestRef = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const supabase = createClient();
    setLoading(true);
    setError(null);
    // Tables only hold the latest snapshot (job replaces them): one parallel round-trip.
    // Summary rows: KV5/KV6 wards, plus unmapped wards of KV5/KV6 routes.
    // Rider profiles (riders.cot) are the source for the Rider table's COT column (same as Realtime Delivery).
    const [summaryResult, riderResult, groupResult, profileResult] = await Promise.all([
      supabase.from("pickup_48h_summary_groups").select(SUMMARY_COLUMNS).or(`area.in.(${KV_LIST}),route_area.in.(${KV_LIST})`).limit(5000),
      supabase.from("pickup_48h_realtime_riders").select(RIDER_COLUMNS).limit(5000),
      supabase.from("pickup_48h_rider_groups").select(RIDER_GROUP_COLUMNS).limit(10000),
      supabase.from("riders").select(RIDER_PROFILE_COLUMNS).limit(10000),
    ]);
    if (requestId !== requestRef.current) return;
    const firstError = summaryResult.error ?? riderResult.error ?? groupResult.error ?? profileResult.error;
    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }
    setData(buildSnapshot(
      (summaryResult.data ?? []) as SummaryGroupRow[],
      (riderResult.data ?? []) as RiderRow[],
      (groupResult.data ?? []) as RiderGroupRow[],
      (profileResult.data ?? []) as RiderProfileRow[],
    ));
    setLoading(false);
  }, []);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLoad = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void load(), RELOAD_DEBOUNCE_MS);
  }, [load]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useSupabaseRealtime({ table: "pickup_48h_summary_groups", onChange: scheduleLoad, debounceMs: 800 });
  useSupabaseRealtime({ table: "pickup_48h_realtime_riders", onChange: scheduleLoad, debounceMs: 800 });
  useSupabaseRealtime({ table: "pickup_48h_rider_groups", onChange: scheduleLoad, debounceMs: 800 });

  const updateFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === "area") { next.ward = "all"; next.route = "all"; }
      return next;
    });
    setRiderPage(1);
    setRoutePage(1);
  }, []);
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setQuery("");
    setRiderPage(1);
    setRoutePage(1);
  }, []);

  // Ward scope (KV of the ward): KPI + ward breakdown. Unmapped wards count under their route's KV.
  const wardScope = useMemo(() => data.summary.filter((row) => inAreaByWard(row, filters.area) && matchesWardRoute(row, filters) && matchesCot(row.cot, filters.cot)), [data.summary, filters]);
  const kpi = useMemo(() => sumMetrics(wardScope), [wardScope]);
  // Route scope (KV of the route): full route totals straight from the summary.
  const routeScope = useMemo(() => data.summary.filter((row) => inArea(row.routeArea, filters.area) && matchesWardRoute(row, filters) && matchesCot(row.cot, filters.cot)), [data.summary, filters]);

  const ridersByRoute = useMemo(() => indexRiders(data.riders, (group) => group.route), [data.riders]);
  const ridersByWard = useMemo(() => indexRiders(data.riders, (group) => group.ward), [data.riders]);
  const routeTotals = useMemo(() => buildRouteTotals(routeScope, ridersByRoute), [routeScope, ridersByRoute]);
  const routeSum = useMemo(() => sumMetrics(routeTotals), [routeTotals]);
  const sortedRoutes = useMemo(() => sortRows(routeTotals, routeSort, (row) => row.route), [routeTotals, routeSort]);
  const wardTotals = useMemo(() => buildWardTotals(wardScope, ridersByWard), [wardScope, ridersByWard]);
  const options = useMemo(() => {
    const base = buildOptions(data.summary, filters.area);
    const riderCots = new Set<string>();
    for (const rider of data.riders) {
      if (filters.area !== "all" && rider.area !== filters.area) continue;
      if (rider.cot && rider.cot !== "—") riderCots.add(rider.cot);
    }
    const merged = new Set<string>([...base.cots, ...riderCots]);
    return { ...base, cots: [...merged].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })) };
  }, [data.summary, data.riders, filters.area]);

  const riderViews = useMemo(() => {
    const q = normalize(query);
    const scoped = filters.ward !== "all" || filters.route !== "all";
    const rows: RiderView[] = [];
    for (const rider of data.riders) {
      if (filters.area !== "all" && rider.area !== filters.area) continue;
      if (!matchesCot(rider.cot, filters.cot)) continue;
      if (q && !normalize(`${rider.id} ${rider.name} ${rider.routes.join(" ")} ${rider.cot}`).includes(q)) continue;
      if (!scoped) { rows.push({ ...rider, view: rider }); continue; }
      const groups = rider.groups.filter((group) => (filters.ward === "all" || group.ward === filters.ward) && (filters.route === "all" || group.route === filters.route));
      if (groups.length) rows.push({ ...rider, view: sumMetrics(groups) });
    }
    return sortRows(rows, riderSort, (row) => row.name, (row) => row.view);
  }, [data.riders, filters, query, riderSort]);

  const riderPageCount = Math.max(1, Math.ceil(riderViews.length / RIDER_PAGE_SIZE));
  const safeRiderPage = Math.min(riderPage, riderPageCount);
  const riderRows = useMemo(() => riderViews.slice((safeRiderPage - 1) * RIDER_PAGE_SIZE, safeRiderPage * RIDER_PAGE_SIZE), [riderViews, safeRiderPage]);
  const routePageCount = Math.max(1, Math.ceil(sortedRoutes.length / ROUTE_PAGE_SIZE));
  const safeRoutePage = Math.min(routePage, routePageCount);
  const routeRows = useMemo(() => sortedRoutes.slice((safeRoutePage - 1) * ROUTE_PAGE_SIZE, safeRoutePage * ROUTE_PAGE_SIZE), [sortedRoutes, safeRoutePage]);

  const areaCounts = useMemo(() => ({
    KV5: data.riders.filter((rider) => rider.area === "KV5").length,
    KV6: data.riders.filter((rider) => rider.area === "KV6").length,
  }), [data.riders]);
  const pickRate = rate(kpi.picked, kpi.assigned);
  const pending = Math.max(0, kpi.assigned - kpi.picked - kpi.onhold);
  const hasFilter = filters.area !== "all" || filters.ward !== "all" || filters.route !== "all" || filters.cot !== "all" || query.trim() !== "";

  const toggleRiderSort = useCallback((key: RiderSortKey) => {
    setRiderSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "name" || key === "cot" ? "asc" : "desc" });
    setRiderPage(1);
  }, []);
  const toggleRouteSort = useCallback((key: RouteSortKey) => {
    setRouteSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "route" ? "asc" : "desc" });
    setRoutePage(1);
  }, []);
  const selectRoute = useCallback((route: string) => updateFilter("route", route), [updateFilter]);
  const selectWard = useCallback((ward: string) => updateFilter("ward", ward), [updateFilter]);

  return (
    <div className="dashboard-control mx-auto max-w-[1600px] space-y-6">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Pickup realtime · KV5 + KV6 · theo tuyến / phường</div>
          <h1>Pickup Realtime</h1>
          <p>Tổng theo tuyến và phường lấy từ bảng tổng hợp pickup_48h_summary (không cộng dồn rider). Khu vực theo phường mới (Coverage SA).</p>
        </div>
        <div className="dashboard-command-actions">
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /><span>Làm mới</span>
          </Button>
        </div>
      </header>

      <div className="dashboard-readout-strip">
        <RealtimeIndicator snapshotAt={data.snapshotAt} loading={loading} />
        <span className="hidden sm:inline">Cập nhật lúc {formatDateTime(data.snapshotAt)}</span>
        <span className="ml-auto hidden items-center gap-1.5 text-xs text-[var(--color-muted)] sm:inline-flex">
          <UsersBadge label="KV5" value={areaCounts.KV5} /><UsersBadge label="KV6" value={areaCounts.KV6} />
        </span>
      </div>
      {error ? <div role="alert" className="dashboard-error">{error}</div> : null}

      <section aria-labelledby="pickup-kpi-heading" className="space-y-3">
        <h2 id="pickup-kpi-heading" className="sr-only">Chỉ số tổng quan</h2>
        <div className="grid grid-cols-12 gap-3">
          <KpiCard className="col-span-6 lg:col-span-3" icon={RouteIcon} label="Tổng đơn gán" value={kpi.assigned} helper={`${wardTotals.length} phường · ${pending.toLocaleString("vi-VN")} chưa lấy`} tone="blue" loading={loading} />
          <KpiCard className="col-span-6 lg:col-span-3" icon={PackageCheck} label="Đã lấy" value={kpi.picked} helper="Sản lượng task đã pick" tone="green" loading={loading} />
          <KpiCard className="col-span-6 lg:col-span-3" icon={PauseCircle} label="Onhold" value={kpi.onhold} helper={`${rate(kpi.onhold, kpi.assigned)}% tổng đơn gán`} tone={kpi.onhold ? "red" : "green"} loading={loading} />
          <KpiCard className="col-span-6 lg:col-span-3" icon={TrendingUp} label="Tỷ lệ lấy" value={`${pickRate}%`} helper={`${kpi.picked.toLocaleString("vi-VN")}/${kpi.assigned.toLocaleString("vi-VN")} đơn`} tone={pickRate >= 80 ? "green" : pickRate >= 50 ? "blue" : "red"} loading={loading} />
        </div>
      </section>

      <FilterPanel
        filters={filters} query={query} options={options} hasFilter={hasFilter}
        onArea={(value) => updateFilter("area", value)}
        onWard={(value) => updateFilter("ward", value)}
        onRoute={(value) => updateFilter("route", value)}
        onCot={(value) => updateFilter("cot", value)}
        onQuery={(value) => { setQuery(value); setRiderPage(1); }}
        onReset={resetFilters}
      />

      <div className="grid grid-cols-12 gap-6">
        <section aria-labelledby="route-heading" className="col-span-12 xl:col-span-7">
          <RouteTable
            rows={routeRows} total={sortedRoutes.length} loading={loading} sort={routeSort} activeRoute={filters.route}
            page={safeRoutePage} pageCount={routePageCount} totals={routeSum}
            onSort={toggleRouteSort} onSelect={selectRoute}
            onPrevious={() => setRoutePage((value) => Math.max(1, value - 1))}
            onNext={() => setRoutePage((value) => Math.min(routePageCount, value + 1))}
          />
        </section>
        <section aria-labelledby="ward-heading" className="col-span-12 xl:col-span-5">
          <WardBreakdown rows={wardTotals} loading={loading} activeWard={filters.ward} totals={kpi} onSelect={selectWard} />
        </section>
      </div>

      <section aria-labelledby="pickup-rider-heading">
        <RiderTable
          rows={riderRows} total={riderViews.length} allTotal={data.riders.length} loading={loading} sort={riderSort}
          page={safeRiderPage} pageCount={riderPageCount} expanded={expandedRider}
          onSort={toggleRiderSort}
          onToggle={(id) => setExpandedRider((current) => current === id ? null : id)}
          onPrevious={() => setRiderPage((value) => Math.max(1, value - 1))}
          onNext={() => setRiderPage((value) => Math.min(riderPageCount, value + 1))}
        />
      </section>
    </div>
  );
}

function UsersBadge({ label, value }: { label: string; value: number }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-paper-2)] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--color-ink-2)] ring-1 ring-[var(--color-rule)]">{label}<span className="tabular-nums text-[var(--color-muted)]">{value} rider</span></span>;
}

const FilterPanel = memo(function FilterPanel({ filters, query, options, hasFilter, onArea, onWard, onRoute, onCot, onQuery, onReset }: {
  filters: Filters; query: string; options: Options; hasFilter: boolean;
  onArea: (value: AreaFilter) => void; onWard: (value: string) => void;
  onRoute: (value: string) => void; onCot: (value: string) => void; onQuery: (value: string) => void; onReset: () => void;
}) {
  return (
    <section aria-label="Bộ lọc" className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FilterField label="Khu vực">
          <Select value={filters.area} onChange={(event) => onArea(toAreaFilter(event.target.value))}>
            <option value="all">KV5 + KV6</option>
            {AREAS.map((area) => <option key={area} value={area}>{area === "KV5" ? "KV5 · Q3, Bình Thạnh, Thủ Đức (cũ)" : "KV6 · Gò Vấp, Q12, Hóc Môn (cũ)"}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Phường">
          <Select value={filters.ward} onChange={(event) => onWard(event.target.value)}>
            <option value="all">Tất cả phường</option>
            {options.wards.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Tuyến">
          <Select value={filters.route} onChange={(event) => onRoute(event.target.value)}>
            <option value="all">Tất cả tuyến</option>
            {options.routes.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </FilterField>
        <FilterField label="COT">
          <Select value={filters.cot} onChange={(event) => onCot(event.target.value)}>
            <option value="all">Tất cả COT</option>
            {options.cots.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Tìm rider">
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Tên, mã rider, tuyến, COT" className="pl-9" />
          </span>
        </FilterField>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs font-semibold text-slate-500">Đang lọc:</span>
        <FilterChip>{filters.area === "all" ? "KV5 + KV6" : filters.area}</FilterChip>
        <FilterChip>{filters.ward === "all" ? "Mọi phường" : filters.ward}</FilterChip>
        <FilterChip>{filters.route === "all" ? "Mọi tuyến" : filters.route}</FilterChip>
        <FilterChip>{filters.cot === "all" ? "Mọi COT" : filters.cot}</FilterChip>
        {hasFilter ? <button type="button" onClick={onReset} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"><X size={12} />Xóa lọc</button> : null}
      </div>
    </section>
  );
});

const RouteTable = memo(function RouteTable({ rows, total, loading, sort, activeRoute, page, pageCount, totals, onSort, onSelect, onPrevious, onNext }: {
  rows: RouteTotal[]; total: number; loading: boolean; sort: Sort<RouteSortKey>; activeRoute: string; page: number; pageCount: number; totals: Metrics;
  onSort: (key: RouteSortKey) => void; onSelect: (route: string) => void; onPrevious: () => void; onNext: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h2 id="route-heading" className="text-base font-bold text-slate-950">Tổng theo tuyến</h2>
        <p className="mt-0.5 text-sm text-slate-500">Từ bảng tổng hợp · {total} tuyến (khu vực của tuyến) · chọn một tuyến để lọc</p>
      </div>
      <div className="min-h-[320px] flex-1 overflow-auto">
        <table className="w-full min-w-[640px] table-fixed text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-600 shadow-[0_1px_0_#e2e8f0]">
            <tr>
              <SortHeader label="Tuyến" sortKey="route" current={sort} onSort={onSort} className="w-[30%]" />
              <SortHeader label="Đã gán" sortKey="assigned" current={sort} onSort={onSort} align="right" />
              <SortHeader label="Đã lấy" sortKey="picked" current={sort} onSort={onSort} align="right" />
              <SortHeader label="Onhold" sortKey="onhold" current={sort} onSort={onSort} align="right" />
              <SortHeader label="% lấy" sortKey="rate" current={sort} onSort={onSort} align="right" className="w-[20%]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && !rows.length ? <SkeletonRows columns={5} /> : !rows.length ? <EmptyRow columns={5} text="Chưa có dữ liệu tổng hợp tuyến." /> : rows.map((row) => (
              <tr key={row.route} tabIndex={0} onClick={() => onSelect(activeRoute === row.route ? "all" : row.route)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(activeRoute === row.route ? "all" : row.route); } }} className={cn("h-14 cursor-pointer transition-colors hover:bg-blue-50/50 focus:bg-blue-50 focus:outline-none", activeRoute === row.route && "bg-blue-50")}>
                <td className="px-4">
                  <div className="truncate font-mono text-[13px] font-semibold text-slate-900">{row.route}</div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500"><AreaBadge area={row.area} />{row.wards} phường · {row.riders} rider</div>
                </td>
                <td className="px-4 text-right font-semibold tabular-nums text-slate-900">{formatNumber(row.assigned)}</td>
                <td className="px-4 text-right tabular-nums text-emerald-700">{formatNumber(row.picked)}</td>
                <td className={cn("px-4 text-right tabular-nums", row.onhold ? "text-red-600" : "text-slate-400")}>{formatNumber(row.onhold)}</td>
                <td className="px-4"><RateBar picked={row.picked} assigned={row.assigned} /></td>
              </tr>
            ))}
          </tbody>
          {rows.length ? (
            <tfoot className="sticky bottom-0 bg-slate-50 text-sm font-bold text-slate-900 shadow-[0_-1px_0_#e2e8f0]">
              <tr className="h-12">
                <td className="px-4">Tổng các tuyến</td>
                <td className="px-4 text-right tabular-nums">{formatNumber(totals.assigned)}</td>
                <td className="px-4 text-right tabular-nums text-emerald-700">{formatNumber(totals.picked)}</td>
                <td className="px-4 text-right tabular-nums text-red-600">{formatNumber(totals.onhold)}</td>
                <td className="px-4 text-right tabular-nums">{rate(totals.picked, totals.assigned)}%</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <Pager page={page} pageCount={pageCount} label={`${total} tuyến`} onPrevious={onPrevious} onNext={onNext} />
    </div>
  );
});

const WardBreakdown = memo(function WardBreakdown({ rows, loading, activeWard, totals, onSelect }: {
  rows: WardTotal[]; loading: boolean; activeWard: string; totals: Metrics; onSelect: (ward: string) => void;
}) {
  const max = rows.reduce((value, row) => Math.max(value, row.assigned), 0) || 1;
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h2 id="ward-heading" className="text-base font-bold text-slate-950">Theo phường</h2>
        <p className="mt-0.5 text-sm text-slate-500">Từ bảng tổng hợp · {rows.length} phường mới · chọn một phường để lọc</p>
      </div>
      <div className="max-h-[620px] min-h-[320px] flex-1 divide-y divide-slate-100 overflow-auto">
        {loading && !rows.length ? Array.from({ length: 6 }, (_, index) => <div key={index} className="m-4 h-10 animate-pulse rounded bg-slate-100" />) : !rows.length ? <p className="p-8 text-center text-sm text-slate-500">Chưa có dữ liệu phường.</p> : rows.map((row) => {
          const active = activeWard === row.ward;
          const value = rate(row.picked, row.assigned);
          return (
            <button key={row.ward} type="button" aria-pressed={active} onClick={() => onSelect(active ? "all" : row.ward)} className={cn("block w-full px-4 py-3 text-left transition-colors hover:bg-blue-50/50 focus:outline-none focus-visible:bg-blue-50", active && "bg-blue-50")}>
              <div className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  {row.ward === UNKNOWN_WARD ? <CircleAlert size={13} className="shrink-0 text-amber-500" /> : <MapPin size={13} className="shrink-0 text-slate-400" />}
                  <span className={cn("truncate text-sm font-semibold", row.ward === UNKNOWN_WARD ? "text-amber-700" : "text-slate-900")}>{row.ward}</span>
                  <AreaBadge area={row.area} />
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-slate-600">{formatNumber(row.picked)}/{formatNumber(row.assigned)} · <span className={cn("font-bold", rateTone(value))}>{value}%</span></span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${(row.assigned / max) * 100}%` }} /></div>
              <div className="mt-1 text-[11px] text-slate-500">{row.routes} tuyến · {row.riders} rider · onhold <span className={row.onhold ? "font-semibold text-red-600" : undefined}>{formatNumber(row.onhold)}</span></div>
            </button>
          );
        })}
      </div>
      {rows.length ? (
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900">
          <span>Tổng phường</span>
          <span className="font-mono tabular-nums">{formatNumber(totals.picked)}/{formatNumber(totals.assigned)} · onhold {formatNumber(totals.onhold)}</span>
        </div>
      ) : null}
    </div>
  );
});

const RiderTable = memo(function RiderTable({ rows, total, allTotal, loading, sort, page, pageCount, expanded, onSort, onToggle, onPrevious, onNext }: {
  rows: RiderView[]; total: number; allTotal: number; loading: boolean; sort: Sort<RiderSortKey>; page: number; pageCount: number; expanded: string | null;
  onSort: (key: RiderSortKey) => void; onToggle: (id: string) => void; onPrevious: () => void; onNext: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-1 border-b border-slate-200 p-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 id="pickup-rider-heading" className="text-base font-bold text-slate-950">Rider KV5 / KV6</h2>
          <p className="mt-0.5 text-sm text-slate-500">Hiển thị {total}/{allTotal} rider · khu vực theo danh sách rider · số liệu theo bộ lọc phường/tuyến · chọn dòng để xem chi tiết</p>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-slate-500"><CircleAlert size={13} />Nhiều rider chung tuyến: không cộng bảng này để ra tổng tuyến.</p>
      </div>
      <div className="max-h-[640px] min-h-[360px] overflow-auto">
        <table className="w-full min-w-[1020px] table-fixed text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-600 shadow-[0_1px_0_#e2e8f0]">
            <tr>
              <SortHeader label="Rider" sortKey="name" current={sort} onSort={onSort} className="w-[24%]" />
              <SortHeader label="COT" sortKey="cot" current={sort} onSort={onSort} className="w-[12%]" />
              <th className="w-[20%] px-4 py-3 font-semibold">Tuyến</th>
              <SortHeader label="Đã gán" sortKey="assigned" current={sort} onSort={onSort} align="right" />
              <SortHeader label="Đã lấy" sortKey="picked" current={sort} onSort={onSort} align="right" />
              <SortHeader label="Onhold" sortKey="onhold" current={sort} onSort={onSort} align="right" />
              <SortHeader label="% lấy" sortKey="rate" current={sort} onSort={onSort} align="right" className="w-[14%]" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && !rows.length ? <SkeletonRows columns={7} /> : !rows.length ? <EmptyRow columns={7} text="Không có rider KV5/KV6 khớp bộ lọc." /> : rows.map((rider) => (
              <RiderRowItem key={rider.id} rider={rider} open={expanded === rider.id} onToggle={onToggle} />
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pageCount={pageCount} label={`${total} rider`} onPrevious={onPrevious} onNext={onNext} />
    </div>
  );
});

const RiderRowItem = memo(function RiderRowItem({ rider, open, onToggle }: { rider: RiderView; open: boolean; onToggle: (id: string) => void }) {
  return (
    <>
      <tr tabIndex={0} aria-expanded={open} onClick={() => onToggle(rider.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onToggle(rider.id); } }} className={cn("h-16 cursor-pointer bg-white transition-colors hover:bg-blue-50/50 focus:bg-blue-50 focus:outline-none", open && "bg-blue-50/60")}>
        <td className="px-4">
          <div className="flex items-center gap-2">
            <ChevronDown size={14} className={cn("shrink-0 text-slate-400 transition-transform", open ? "rotate-0" : "-rotate-90")} />
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900">{rider.name}</div>
              <div className="flex items-center gap-1.5 font-mono text-xs text-slate-500">{rider.id}<AreaBadge area={rider.area} /></div>
            </div>
          </div>
        </td>
        <td className="px-4"><CotBadge cot={rider.cot} /></td>
        <td className="px-4"><div className="truncate font-mono text-xs text-slate-700" title={rider.routes.join(", ")}>{rider.routes.join(", ") || "—"}</div><div className="text-xs text-slate-500">{rider.pickupPoints} điểm lấy</div></td>
        <td className="px-4 text-right font-semibold tabular-nums text-slate-900">{formatNumber(rider.view.assigned)}</td>
        <td className="px-4 text-right tabular-nums text-emerald-700">{formatNumber(rider.view.picked)}</td>
        <td className={cn("px-4 text-right tabular-nums", rider.view.onhold ? "text-red-600" : "text-slate-400")}>{formatNumber(rider.view.onhold)}</td>
        <td className="px-4"><RateBar picked={rider.view.picked} assigned={rider.view.assigned} /></td>
      </tr>
      {open ? (
        <tr className="bg-slate-50/70">
          <td colSpan={7} className="px-4 py-3">
            {rider.groups.length ? (
              <table className="w-full table-fixed text-left text-xs">
                <thead className="text-slate-500"><tr><th className="w-[30%] py-1.5 pl-6 font-semibold">Tuyến</th><th className="font-semibold">Phường</th><th className="w-[12%] text-right font-semibold">Gán</th><th className="w-[12%] text-right font-semibold">Lấy</th><th className="w-[12%] pr-2 text-right font-semibold">Onhold</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rider.groups.map((group) => (
                    <tr key={`${group.route}|${group.ward}`} className="h-8">
                      <td className="truncate pl-6 font-mono text-slate-700">{group.route}</td>
                      <td className="truncate text-slate-700"><span className="inline-flex items-center gap-1.5">{group.ward}<AreaBadge area={group.wardArea} /></span></td>
                      <td className="text-right tabular-nums text-slate-900">{formatNumber(group.assigned)}</td>
                      <td className="text-right tabular-nums text-emerald-700">{formatNumber(group.picked)}</td>
                      <td className={cn("pr-2 text-right tabular-nums", group.onhold ? "text-red-600" : "text-slate-400")}>{formatNumber(group.onhold)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="pl-6 text-xs text-slate-500">Chưa có phân bổ phường cho rider này.</p>}
          </td>
        </tr>
      ) : null}
    </>
  );
});

function AreaBadge({ area }: { area: Area | null }) {
  if (!area) return null;
  return <span className={cn("inline-flex rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold ring-1", area === "KV5" ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-violet-50 text-violet-700 ring-violet-200")}>{area}</span>;
}

function CotBadge({ cot }: { cot: string }) {
  if (!cot || cot === "—") return <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-400 ring-1 ring-slate-200">—</span>;
  const key = cotKey(cot);
  const style = key.includes("COT1")
    ? "bg-blue-50 text-blue-700 ring-blue-200"
    : key.includes("COT2")
      ? "bg-violet-50 text-violet-700 ring-violet-200"
      : "bg-amber-50 text-amber-700 ring-amber-200";
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ring-1", style)}>{cot}</span>;
}

function RateBar({ picked, assigned }: { picked: number; assigned: number }) {
  const value = rate(picked, assigned);
  return (
    <div className="ml-auto w-full max-w-32 text-right">
      <span className={cn("font-mono text-xs font-bold tabular-nums", rateTone(value))}>{value}%</span>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={cn("h-full rounded-full", value >= 80 ? "bg-emerald-500" : value >= 50 ? "bg-blue-600" : "bg-amber-500")} style={{ width: `${Math.min(100, value)}%` }} /></div>
    </div>
  );
}

function Pager({ page, pageCount, label, onPrevious, onNext }: { page: number; pageCount: number; label: string; onPrevious: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
      <span className="text-slate-500">Trang {page}/{pageCount} · {label}</span>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={page <= 1} onClick={onPrevious}><ChevronLeft size={16} /> Trước</Button>
        <Button type="button" variant="secondary" disabled={page >= pageCount} onClick={onNext}>Sau <ChevronRight size={16} /></Button>
      </div>
    </div>
  );
}

function SortHeader<K extends string>({ label, sortKey, current, onSort, align, className }: { label: string; sortKey: K; current: Sort<K>; onSort: (key: K) => void; align?: "right"; className?: string }) {
  const Icon = current.key !== sortKey ? ArrowUpDown : current.direction === "asc" ? ArrowUp : ArrowDown;
  return <th className={cn("px-4 py-3", className)} aria-sort={current.key === sortKey ? (current.direction === "asc" ? "ascending" : "descending") : "none"}><button type="button" onClick={() => onSort(sortKey)} className={cn("flex items-center gap-1 font-semibold hover:text-slate-950", align === "right" && "ml-auto")}><span>{label}</span><Icon size={13} /></button></th>;
}
function SkeletonRows({ columns }: { columns: number }) { return <>{Array.from({ length: 6 }, (_, index) => <tr key={index} className="h-14 animate-pulse"><td colSpan={columns} className="px-4"><div className="h-4 rounded bg-slate-100" /></td></tr>)}</>; }
function EmptyRow({ columns, text }: { columns: number; text: string }) { return <tr><td colSpan={columns} className="px-4 py-10 text-center text-sm text-slate-500">{text}</td></tr>; }
function FilterField({ label, children }: { label: string; children: ReactNode }) { return <label className="space-y-1.5"><span className="block text-xs font-semibold text-slate-600">{label}</span>{children}</label>; }
function FilterChip({ children }: { children: ReactNode }) { return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{children}</span>; }

// ---------- data shaping (pure, memoized by callers) ----------

function latestSnapshotId(rows: ReadonlyArray<{ snapshot_id: string }>): string | null {
  let latest: string | null = null;
  for (const row of rows) if (row.snapshot_id && (latest === null || row.snapshot_id > latest)) latest = row.snapshot_id;
  return latest;
}

function buildSnapshot(summaryRows: SummaryGroupRow[], riderRows: RiderRow[], groupRows: RiderGroupRow[], profileRows: RiderProfileRow[] = []): Snapshot {
  const summaryId = latestSnapshotId(summaryRows);
  const riderId = latestSnapshotId(riderRows);
  const groupId = latestSnapshotId(groupRows);
  const summary: SummaryGroup[] = [];
  let snapshotAt: string | null = null;
  for (const row of summaryRows) {
    if (row.snapshot_id !== summaryId) continue;
    snapshotAt = snapshotAt ?? row.snapshot_at;
    summary.push({ route: clean(row.khu_vuc), ward: clean(row.ward), cot: clean(row.cot), area: toArea(row.area), routeArea: toArea(row.route_area), assigned: num(row.assign_orders), picked: num(row.picked_orders), onhold: num(row.onhold_orders) });
  }
  const cotByRider = new Map<string, string>();
  for (const profile of profileRows) {
    const code = (profile.rider_code ?? "").trim();
    if (!code) continue;
    const cot = (profile.cot ?? "").trim();
    if (cot) cotByRider.set(code, cot);
  }
  // Several raw (quan, phuong) rows can resolve to the same new ward: merge per (route, ward).
  const groupsByRider = new Map<string, Map<string, RiderGroup>>();
  for (const row of groupRows) {
    if (row.snapshot_id !== groupId) continue;
    const route = clean(row.khu_vuc);
    const ward = clean(row.ward);
    let byKey = groupsByRider.get(row.driver_id);
    if (!byKey) { byKey = new Map(); groupsByRider.set(row.driver_id, byKey); }
    const key = `${route}|${ward}`;
    const group = byKey.get(key);
    if (group) add(group, { assigned: num(row.assigned_orders), picked: num(row.picked_orders), onhold: num(row.onhold_orders) });
    else byKey.set(key, { route, ward, wardArea: toArea(row.ward_area), assigned: num(row.assigned_orders), picked: num(row.picked_orders), onhold: num(row.onhold_orders) });
  }
  const riders: Rider[] = [];
  for (const row of riderRows) {
    if (row.snapshot_id !== riderId) continue;
    const groups = [...(groupsByRider.get(row.driver_id)?.values() ?? [])].sort((a, b) => b.assigned - a.assigned);
    riders.push({
      id: row.driver_id,
      name: row.driver_name?.trim() || "Chưa có tên",
      area: toArea(row.area),
      cot: cotByRider.get(row.driver_id)?.trim() || "—",
      routes: (row.zones ?? "").split(",").map((zone) => zone.trim()).filter(Boolean),
      pickupPoints: num(row.pickup_point_count),
      assigned: num(row.assigned_orders),
      picked: num(row.total_pickup_quantity),
      onhold: num(row.onhold_orders),
      groups,
    });
  }
  return { summary, riders, snapshotAt };
}

function inArea(area: Area | null, filter: AreaFilter): boolean {
  return area !== null && (filter === "all" || area === filter);
}
function inAreaByWard(row: SummaryGroup, filter: AreaFilter): boolean {
  return row.area !== null ? inArea(row.area, filter) : row.ward === UNKNOWN_WARD && inArea(row.routeArea, filter);
}
function matchesWardRoute(row: SummaryGroup, filters: Filters): boolean {
  return (filters.ward === "all" || row.ward === filters.ward) && (filters.route === "all" || row.route === filters.route);
}
function cotKey(value: string): string {
  return value.toUpperCase().replace(/[\s_.-]+/g, "");
}
function matchesCot(value: string, filter: string): boolean {
  if (filter === "all") return true;
  if (!value || value === "—") return false;
  return value === filter || cotKey(value) === cotKey(filter);
}

function sumMetrics(rows: ReadonlyArray<Metrics>): Metrics {
  const total: Metrics = { assigned: 0, picked: 0, onhold: 0 };
  for (const row of rows) add(total, row);
  return total;
}

function indexRiders(riders: ReadonlyArray<Rider>, keyOf: (group: RiderGroup) => string): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const rider of riders) {
    for (const group of rider.groups) {
      const key = keyOf(group);
      const set = index.get(key);
      if (set) set.add(rider.id); else index.set(key, new Set([rider.id]));
    }
  }
  return index;
}

function buildRouteTotals(rows: ReadonlyArray<SummaryGroup>, ridersByRoute: Map<string, Set<string>>): RouteTotal[] {
  const map = new Map<string, Metrics & { area: Area | null; wardSet: Set<string> }>();
  for (const row of rows) {
    let entry = map.get(row.route);
    if (!entry) { entry = { area: row.routeArea, assigned: 0, picked: 0, onhold: 0, wardSet: new Set<string>() }; map.set(row.route, entry); }
    add(entry, row);
    entry.wardSet.add(row.ward);
  }
  return Array.from(map, ([route, { wardSet, ...entry }]) => ({ ...entry, route, wards: wardSet.size, riders: ridersByRoute.get(route)?.size ?? 0 }));
}

function buildWardTotals(rows: ReadonlyArray<SummaryGroup>, ridersByWard: Map<string, Set<string>>): WardTotal[] {
  const map = new Map<string, Metrics & { area: Area | null; routeSet: Set<string> }>();
  for (const row of rows) {
    let entry = map.get(row.ward);
    if (!entry) { entry = { area: row.area, assigned: 0, picked: 0, onhold: 0, routeSet: new Set<string>() }; map.set(row.ward, entry); }
    add(entry, row);
    entry.routeSet.add(row.route);
  }
  return Array.from(map, ([ward, { routeSet, ...entry }]) => ({ ...entry, ward, routes: routeSet.size, riders: ridersByWard.get(ward)?.size ?? 0 }))
    .sort((a, b) => Number(a.ward === UNKNOWN_WARD) - Number(b.ward === UNKNOWN_WARD) || b.assigned - a.assigned || a.ward.localeCompare(b.ward, "vi"));
}

function buildOptions(rows: ReadonlyArray<SummaryGroup>, area: AreaFilter): Options {
  const wards = new Set<string>();
  const routes = new Set<string>();
  const cots = new Set<string>();
  for (const row of rows) {
    if (inAreaByWard(row, area)) wards.add(row.ward);
    if (inArea(row.routeArea, area)) routes.add(row.route);
    if (row.cot && row.cot !== UNKNOWN_WARD) cots.add(row.cot);
  }
  const sorted = (set: Set<string>) => [...set].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
  return { wards: sorted(wards), routes: sorted(routes), cots: sorted(cots) };
}

function sortRows<T, K extends "name" | "route" | "cot" | "assigned" | "picked" | "onhold" | "rate">(rows: T[], sort: Sort<K>, label: (row: T) => string, metrics: (row: T) => Metrics = (row) => row as unknown as Metrics): T[] {
  const direction = sort.direction === "asc" ? 1 : -1;
  const value = (row: T): number => {
    const m = metrics(row);
    if (sort.key === "picked") return m.picked;
    if (sort.key === "onhold") return m.onhold;
    if (sort.key === "rate") return m.assigned ? m.picked / m.assigned : 0;
    return m.assigned;
  };
  return [...rows].sort((a, b) => {
    if (sort.key === "name" || sort.key === "route" || sort.key === "cot") {
      const aText = sort.key === "cot" ? String((a as unknown as { cot: unknown }).cot ?? "") : label(a);
      const bText = sort.key === "cot" ? String((b as unknown as { cot: unknown }).cot ?? "") : label(b);
      return aText.localeCompare(bText, "vi", { numeric: true }) * direction;
    }
    return (value(a) - value(b)) * direction || label(a).localeCompare(label(b), "vi", { numeric: true });
  });
}

function add(target: Metrics, source: Metrics) { target.assigned += source.assigned; target.picked += source.picked; target.onhold += source.onhold; }
function num(value: number | null | undefined): number { return typeof value === "number" && Number.isFinite(value) ? value : 0; }
function clean(value: string | null | undefined): string { const text = (value ?? "").trim(); return text && text.toUpperCase() !== "UNKNOWN" ? text : UNKNOWN_WARD; }
function toArea(value: string | null | undefined): Area | null { const text = (value ?? "").replace(/\s+/g, "").toUpperCase(); return text === "KV5" || text === "5" ? "KV5" : text === "KV6" || text === "6" ? "KV6" : null; }
function toAreaFilter(value: string): AreaFilter { return value === "KV5" || value === "KV6" ? value : "all"; }
function rate(picked: number, assigned: number): number { return assigned > 0 ? Math.round((picked / assigned) * 100) : 0; }
function rateTone(value: number): string { return value >= 80 ? "text-emerald-700" : value >= 50 ? "text-blue-700" : "text-amber-700"; }
function formatNumber(value: number): string { return value.toLocaleString("vi-VN"); }
function normalize(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim(); }
function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}
