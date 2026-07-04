"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bike,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  RefreshCcw,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/utils/cn";

type RealtimeRider = { id: string; driver_id: string; driver_name: string | null; total_assigned: number; delivered: number; delivering: number; failed: number; zone_id: string | null; first_delivery_at: string | null; idle_delivery_seconds: number; snapshot_id: string; snapshot_at: string };
type RiderProfile = { rider_code: string; full_name: string | null; kv: string | null; delivery_district: string | null; delivery_ward: string | null };
type RiderStatus = "delivering" | "completed" | "warning";
type DisplayRider = RealtimeRider & { name: string; kv: string; district: string; ward: string; status: RiderStatus; progress: number };
type SortKey = "name" | "status" | "eta" | "delivered";
type TimeRange = "15m" | "1h" | "today";

const PAGE_SIZE = 15;
const STATUS_ORDER: Record<RiderStatus, number> = { warning: 0, delivering: 1, completed: 2 };
const HIGH_FAILURE_RATE = 0.2;

export function RealtimeDashboardView() {
  const [date, setDate] = useState(todayInVietnam());
  const [rows, setRows] = useState<RealtimeRider[]>([]);
  const [profiles, setProfiles] = useState<RiderProfile[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState("all");
  const [status, setStatus] = useState<RiderStatus | "all">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("15m");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "status", direction: "asc" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<DisplayRider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    const supabase = createClient();
    const result = await supabase.from("riders").select("rider_code,full_name,kv,delivery_district,delivery_ward").eq("status", "active");
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setProfiles((result.data ?? []) as RiderProfile[]);
  }, []);

  const loadRealtime = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    setError(null);
    const latest = await supabase.from("realtime_delivery_riders").select("snapshot_id,snapshot_at").eq("work_date", date).order("snapshot_at", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) {
      setError(latest.error.message);
      setRows([]);
      setLoading(false);
      return;
    }
    if (!latest.data) {
      setRows([]);
      setSnapshotAt(null);
      setLoading(false);
      return;
    }
    const result = await supabase.from("realtime_delivery_riders").select("id,driver_id,driver_name,total_assigned,delivered,delivering,failed,zone_id,first_delivery_at,idle_delivery_seconds,snapshot_id,snapshot_at").eq("work_date", date).eq("snapshot_id", latest.data.snapshot_id);
    if (result.error) setError(result.error.message);
    setRows((result.data ?? []) as RealtimeRider[]);
    setSnapshotAt(latest.data.snapshot_at);
    setLoading(false);
  }, [date]);

  const load = useCallback(() => {
    void Promise.all([loadProfiles(), loadRealtime()]);
  }, [loadProfiles, loadRealtime]);

  useEffect(() => {
    // The client-side Supabase snapshot is intentionally loaded when the date changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useSupabaseRealtime({ table: "realtime_delivery_riders", onChange: loadRealtime });
  useSupabaseRealtime({ table: "riders", onChange: loadProfiles });

  const riders = useMemo(() => {
    const profileMap = new Map(profiles.map((profile) => [normalize(profile.rider_code), profile]));
    return rows.flatMap((row): DisplayRider[] => {
      const profile = profileMap.get(normalize(row.driver_id));
      if (!profile || !isKv56(profile.kv)) return [];
      const progress = row.total_assigned ? Math.round((row.delivered / row.total_assigned) * 100) : 0;
      return [{
        ...row,
        name: profile.full_name?.trim() || row.driver_name?.trim() || "Chưa có tên",
        kv: profile.kv?.trim() || "—",
        district: profile.delivery_district?.trim() || "Chưa xác định quận",
        ward: profile.delivery_ward?.trim() || "Chưa xác định phường",
        status: getRiderStatus(row),
        progress,
      }];
    });
  }, [profiles, rows]);

  const zones = useMemo(() => [...new Set(riders.map((rider) => rider.district))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })), [riders]);
  const filtered = useMemo(() => {
    const q = normalize(query);
    const result = riders.filter((rider) =>
      (zone === "all" || rider.district === zone) &&
      (status === "all" || rider.status === status) &&
      (!q || normalize(`${rider.driver_id} ${rider.name} ${rider.district} ${rider.ward}`).includes(q)),
    );
    return result.sort((a, b) => compareRiders(a, b, sort.key) * (sort.direction === "asc" ? 1 : -1));
  }, [query, riders, sort, status, zone]);

  const totals = useMemo(() => riders.reduce((sum, rider) => ({
    assigned: sum.assigned + rider.total_assigned,
    delivered: sum.delivered + rider.delivered,
    delivering: sum.delivering + rider.delivering,
    failed: sum.failed + rider.failed,
  }), { assigned: 0, delivered: 0, delivering: 0, failed: 0 }), [riders]);
  const activeRiders = riders.filter((rider) => rider.status !== "completed").length;
  const warningRiders = riders.filter((rider) => rider.status === "warning").length;
  const zeroProgressRiders = riders.filter((rider) => rider.total_assigned > 0 && rider.delivered === 0).length;
  const completedOrders = totals.delivered + totals.failed;
  const onTimeRate = completedOrders ? Math.round((totals.delivered / completedOrders) * 100) : 0;
  const zoneMetrics = useMemo(() => buildZoneMetrics(riders), [riders]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const changeSort = useCallback((key: SortKey) => {
    setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
    setPage(1);
  }, []);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Delivery operations</p>
            <RealtimeIndicator snapshotAt={snapshotAt} loading={loading} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">Realtime Delivery KV5 & KV6</h1>
          <p className="mt-1 text-sm text-slate-600">Theo dõi hiệu suất rider và tải vận hành theo khu vực.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading} className="self-start">
          <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /> Làm mới
        </Button>
      </header>

      <FilterBar
        date={date} timeRange={timeRange} zone={zone} status={status} zones={zones}
        onDateChange={(value) => { setDate(value); setPage(1); }}
        onTimeRangeChange={(value) => { setTimeRange(value); setPage(1); }}
        onZoneChange={(value) => { setZone(value); setPage(1); }}
        onStatusChange={(value) => { setStatus(value); setPage(1); }}
      />

      {error ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div> : null}

      <section aria-labelledby="current-performance-heading" className="space-y-4">
        <div>
          <h2 id="current-performance-heading" className="text-base font-bold text-slate-950">Hiệu suất hiện tại</h2>
          <p className="text-sm text-slate-500">Tổng quan từ snapshot mới nhất trong ngày.</p>
        </div>
        <div className="grid grid-cols-12 gap-4">
          <KpiCard className="col-span-6 xl:col-span-3" icon={Bike} label="Rider đang hoạt động" value={activeRiders} helper={`${riders.length} rider trong danh sách`} tone="blue" />
          <KpiCard className="col-span-6 xl:col-span-3" icon={Activity} label="Đơn đang giao" value={totals.delivering} helper={`${totals.assigned.toLocaleString("vi-VN")} đơn được phân`} tone="blue" />
          <KpiCard className="col-span-6 xl:col-span-3" icon={CheckCircle2} label="Tỷ lệ đúng hạn" value={`${onTimeRate}%`} helper={`${totals.delivered.toLocaleString("vi-VN")} đơn đã giao`} tone="green" />
          <KpiCard className="col-span-6 xl:col-span-3" icon={CircleAlert} label="Rider cảnh báo" value={warningRiders} helper={`${zeroProgressRiders} rider tiến độ 0% · ${totals.failed.toLocaleString("vi-VN")} đơn lỗi`} tone={warningRiders > 0 ? "red" : "green"} />
          <PerformanceChart className="col-span-12" totals={totals} />
        </div>
      </section>

      <section aria-labelledby="rider-status-heading">
        <RiderTable
          rows={paginated} total={filtered.length} allTotal={riders.length} query={query} loading={loading}
          sort={sort} page={safePage} pageCount={pageCount}
          onQueryChange={(value) => { setQuery(value); setPage(1); }}
          onSort={changeSort} onSelect={setSelected}
          onPrevious={() => setPage((value) => Math.max(1, value - 1))}
          onNext={() => setPage((value) => Math.min(pageCount, value + 1))}
        />
      </section>

      <ZonePerformanceSection zones={zoneMetrics} />
      {selected ? <RiderDetails rider={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

export const KpiCard = memo(function KpiCard({ icon: Icon, label, value, helper, tone, className }: { icon: typeof Bike; label: string; value: number | string; helper: string; tone: "blue" | "green" | "red"; className?: string }) {
  const colors = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700" };
  return <article className={cn("min-h-36 rounded-xl border border-slate-200 bg-white p-4", className)}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-950">{typeof value === "number" ? value.toLocaleString("vi-VN") : value}</p></div><span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", colors[tone])}><Icon size={18} /></span></div><p className="mt-4 text-xs text-slate-500">{helper}</p></article>;
});

export function FilterBar({ date, timeRange, zone, status, zones, onDateChange, onTimeRangeChange, onZoneChange, onStatusChange }: { date: string; timeRange: TimeRange; zone: string; status: RiderStatus | "all"; zones: string[]; onDateChange: (value: string) => void; onTimeRangeChange: (value: TimeRange) => void; onZoneChange: (value: string) => void; onStatusChange: (value: RiderStatus | "all") => void }) {
  return <section aria-label="Bộ lọc toàn cục" className="rounded-xl border border-slate-200 bg-white p-4"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><FilterField label="Ngày"><Input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} /></FilterField><FilterField label="Khoảng thời gian"><Select value={timeRange} onChange={(event) => onTimeRangeChange(event.target.value as TimeRange)}><option value="15m">15 phút gần nhất</option><option value="1h">1 giờ gần nhất</option><option value="today">Hôm nay</option></Select></FilterField><FilterField label="Khu vực"><Select value={zone} onChange={(event) => onZoneChange(event.target.value)}><option value="all">Tất cả khu vực</option>{zones.map((item) => <option key={item} value={item}>{item}</option>)}</Select></FilterField><FilterField label="Trạng thái rider"><Select value={status} onChange={(event) => onStatusChange(event.target.value as RiderStatus | "all")}><option value="all">Tất cả trạng thái</option><option value="delivering">Đang giao</option><option value="completed">Đã giao xong</option><option value="warning">Cảnh báo</option></Select></FilterField></div><div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"><span className="text-xs font-semibold text-slate-500">Đang lọc:</span><FilterChip>{timeRange === "15m" ? "15 phút" : timeRange === "1h" ? "1 giờ" : "Hôm nay"}</FilterChip><FilterChip>{zone === "all" ? "Mọi khu vực" : zone}</FilterChip><FilterChip>{status === "all" ? "Mọi trạng thái" : statusLabel(status)}</FilterChip></div></section>;
}

export function StatusBadge({ status }: { status: RiderStatus }) {
  const styles: Record<RiderStatus, string> = { delivering: "bg-blue-50 text-blue-700 ring-blue-600/20", completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", warning: "bg-red-50 text-red-700 ring-red-600/20" };
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", styles[status])}><span className={cn("size-1.5 rounded-full", status === "delivering" ? "bg-blue-500" : status === "completed" ? "bg-emerald-500" : "bg-red-500")} />{statusLabel(status)}</span>;
}

export function RealtimeIndicator({ snapshotAt, loading }: { snapshotAt: string | null; loading: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(interval); }, []);
  const snapshotTime = snapshotAt ? new Date(snapshotAt).getTime() : Number.NaN;
  const age = Number.isFinite(snapshotTime) ? Math.max(0, Math.floor((now - snapshotTime) / 1000)) : null;
  return <span className="inline-flex min-w-40 items-center gap-2 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"><span className={cn("relative flex size-2", loading && "opacity-60")}><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-50" /><span className="relative inline-flex size-2 rounded-full bg-emerald-600" /></span>{snapshotAt ? `Live · Cập nhật ${formatAge(age ?? 0)}` : "Live · Chưa có dữ liệu"}</span>;
}

export const RiderTable = memo(function RiderTable({ rows, total, allTotal, query, loading, sort, page, pageCount, onQueryChange, onSort, onSelect, onPrevious, onNext }: { rows: DisplayRider[]; total: number; allTotal: number; query: string; loading: boolean; sort: { key: SortKey; direction: "asc" | "desc" }; page: number; pageCount: number; onQueryChange: (value: string) => void; onSort: (key: SortKey) => void; onSelect: (rider: DisplayRider) => void; onPrevious: () => void; onNext: () => void }) {
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 id="rider-status-heading" className="text-base font-bold text-slate-950">Trạng thái rider</h2><p className="mt-0.5 text-sm text-slate-500">Hiển thị {total}/{allTotal} rider · Chọn một dòng để xem chi tiết</p></div><label className="relative block w-full lg:w-80"><span className="sr-only">Tìm rider</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Tìm tên, mã hoặc khu vực" className="pl-9" /></label></div><div className="max-h-[560px] min-h-[360px] overflow-auto"><table className="w-full min-w-[760px] table-fixed text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-600 shadow-[0_1px_0_#e2e8f0]"><tr><SortableHeader label="Rider" sortKey="name" current={sort} onSort={onSort} className="w-[30%]" /><SortableHeader label="Trạng thái" sortKey="status" current={sort} onSort={onSort} className="w-[17%]" /><th className="px-4 py-3 font-semibold">Khu vực</th><SortableHeader label="Đã giao" sortKey="delivered" current={sort} onSort={onSort} align="right" /><SortableHeader label="Thời gian chờ" sortKey="eta" current={sort} onSort={onSort} align="right" /></tr></thead><tbody className="divide-y divide-slate-100">{loading ? Array.from({ length: 8 }, (_, index) => <tr key={index} className="h-15 animate-pulse"><td colSpan={5} className="px-4"><div className="h-4 rounded bg-slate-100" /></td></tr>) : rows.map((rider) => <tr key={rider.id} tabIndex={0} onClick={() => onSelect(rider)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(rider); }} className="h-16 cursor-pointer bg-white transition-colors hover:bg-blue-50/50 focus:bg-blue-50 focus:outline-none"><td className="px-4 py-3"><p className="truncate font-semibold text-slate-950">{rider.name}</p><p className="truncate text-xs text-slate-500">{rider.driver_id} · {rider.kv}</p></td><td className="px-4 py-3"><StatusBadge status={rider.status} /></td><td className="px-4 py-3"><p className="truncate font-medium text-slate-700">{rider.district}</p><p className="truncate text-xs text-slate-500">{rider.ward}</p></td><td className="px-4 py-3 text-right"><p className="font-semibold tabular-nums text-slate-950">{rider.delivered}/{rider.total_assigned}</p><p className="text-xs tabular-nums text-slate-500">{rider.progress}%</p></td><td className="px-4 py-3 text-right font-medium tabular-nums text-slate-700">{formatDuration(rider.idle_delivery_seconds)}</td></tr>)}{!loading && rows.length === 0 ? <tr><td colSpan={5} className="h-72 px-4 text-center text-sm text-slate-500">Không tìm thấy rider phù hợp.</td></tr> : null}</tbody></table></div><div className="flex items-center justify-between border-t border-slate-200 px-4 py-3"><p className="text-sm text-slate-500">Trang <span className="font-semibold text-slate-700">{page}/{pageCount}</span></p><div className="flex gap-2"><Button type="button" variant="secondary" className="size-9 px-0" aria-label="Trang trước" disabled={page <= 1} onClick={onPrevious}><ChevronLeft size={16} /></Button><Button type="button" variant="secondary" className="size-9 px-0" aria-label="Trang sau" disabled={page >= pageCount} onClick={onNext}><ChevronRight size={16} /></Button></div></div></div>;
});

export function ZonePerformanceSection({ zones }: { zones: ReturnType<typeof buildZoneMetrics> }) {
  const [open, setOpen] = useState(true);
  const maxOrders = Math.max(1, ...zones.map((zone) => zone.assigned));
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-4 p-4 text-left"><span><span className="block text-base font-bold text-slate-950">Hiệu suất khu vực</span><span className="mt-0.5 block text-sm text-slate-500">So sánh tải và tỷ lệ hoàn thành theo quận</span></span><ChevronDown size={18} className={cn("shrink-0 text-slate-500 transition-transform", open && "rotate-180")} /></button>{open ? <div className="border-t border-slate-100 p-4"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{zones.map((zone) => <article key={zone.name} className="rounded-lg bg-slate-50 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{zone.name}</p><p className="mt-1 text-xs text-slate-500">{zone.riders} rider · {zone.assigned.toLocaleString("vi-VN")} đơn</p></div><span className="text-sm font-bold tabular-nums text-slate-900">{zone.rate}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" title={`${zone.assigned} đơn`}><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.max(5, zone.assigned / maxOrders * 100)}%` }} /></div></article>)}{zones.length === 0 ? <p className="col-span-full py-8 text-center text-sm text-slate-500">Chưa có dữ liệu khu vực.</p> : null}</div></div> : null}</section>;
}

function PerformanceChart({ totals, className }: { totals: { assigned: number; delivered: number; delivering: number; failed: number }; className?: string }) {
  const segments = [{ label: "Đã giao", value: totals.delivered, color: "bg-emerald-500" }, { label: "Đang giao", value: totals.delivering, color: "bg-blue-600" }, { label: "Giao lỗi", value: totals.failed, color: "bg-red-500" }];
  const max = Math.max(1, ...segments.map((segment) => segment.value));
  return <article className={cn("rounded-xl border border-slate-200 bg-white p-4", className)}><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><TrendingUp size={18} className="text-blue-700" /><h3 className="font-bold text-slate-950">Luồng xử lý đơn</h3></div><p className="mt-1 text-sm text-slate-500">So sánh các trạng thái đơn trong snapshot hiện tại</p></div><div className="flex flex-wrap gap-3">{segments.map((segment) => <span key={segment.label} className="flex items-center gap-1.5 text-xs text-slate-600"><span className={cn("size-2 rounded-sm", segment.color)} />{segment.label}</span>)}</div></div><div className="mt-5 grid h-28 grid-cols-3 items-end gap-4 border-b border-slate-200 px-2 sm:gap-8 sm:px-8">{segments.map((segment) => <div key={segment.label} className="flex h-full flex-col justify-end"><p className="mb-1 text-center text-xs font-semibold tabular-nums text-slate-700">{segment.value.toLocaleString("vi-VN")}</p><div className={cn("mx-auto w-full max-w-32 rounded-t", segment.color)} style={{ height: `${Math.max(4, segment.value / max * 78)}%` }} /></div>)}</div><div className="grid grid-cols-3 gap-4 px-2 pt-2 text-center text-xs text-slate-500 sm:gap-8 sm:px-8">{segments.map((segment) => <span key={segment.label}>{segment.label}</span>)}</div></article>;
}

function RiderDetails({ rider, onClose }: { rider: DisplayRider; onClose: () => void }) {
  return <><button type="button" aria-label="Đóng chi tiết rider" className="fixed inset-0 z-40 bg-slate-950/20" onClick={onClose} /><aside role="dialog" aria-modal="true" aria-labelledby="rider-details-title" className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Chi tiết rider</p><h2 id="rider-details-title" className="mt-1 text-xl font-bold text-slate-950">{rider.name}</h2><p className="text-sm text-slate-500">{rider.driver_id} · {rider.kv}</p></div><Button type="button" variant="secondary" aria-label="Đóng" className="size-9 px-0" onClick={onClose}><X size={17} /></Button></div><div className="mt-6"><StatusBadge status={rider.status} /></div><dl className="mt-6 divide-y divide-slate-100 border-y border-slate-100">{[["Khu vực", `${rider.ward}, ${rider.district}`], ["Đơn được phân", rider.total_assigned], ["Đã giao", rider.delivered], ["Đang giao", rider.delivering], ["Giao lỗi", rider.failed], ["Tỷ lệ giao lỗi", formatFailureRate(rider)], ["Tiến độ", `${rider.progress}%`], ["Thời gian chờ", formatDuration(rider.idle_delivery_seconds)], ["Giao đầu tiên", formatDateTime(rider.first_delivery_at)]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 py-3"><dt className="text-sm text-slate-500">{label}</dt><dd className="text-right text-sm font-semibold text-slate-900">{value}</dd></div>)}</dl></aside></>;
}

function SortableHeader({ label, sortKey, current, onSort, align, className }: { label: string; sortKey: SortKey; current: { key: SortKey; direction: "asc" | "desc" }; onSort: (key: SortKey) => void; align?: "right"; className?: string }) { const Icon = current.key !== sortKey ? ArrowUpDown : current.direction === "asc" ? ArrowUp : ArrowDown; return <th className={cn("px-4 py-3", className)}><button type="button" onClick={() => onSort(sortKey)} className={cn("flex items-center gap-1 font-semibold hover:text-slate-950", align === "right" && "ml-auto")}><span>{label}</span><Icon size={13} /></button></th>; }
function FilterField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1.5"><span className="block text-xs font-semibold text-slate-600">{label}</span>{children}</label>; }
function FilterChip({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{children}</span>; }
function getRiderStatus(row: RealtimeRider): RiderStatus { const failureRate = row.total_assigned > 0 ? row.failed / row.total_assigned : 0; if ((row.total_assigned > 0 && row.delivered === 0) || (row.delivering > 0 && row.idle_delivery_seconds > 3600) || failureRate >= HIGH_FAILURE_RATE) return "warning"; return row.delivering > 0 ? "delivering" : "completed"; }
function compareRiders(a: DisplayRider, b: DisplayRider, key: SortKey) { if (key === "name") return a.name.localeCompare(b.name, "vi", { numeric: true }); if (key === "status") return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]; if (key === "eta") return a.idle_delivery_seconds - b.idle_delivery_seconds; return a.delivered - b.delivered; }
function buildZoneMetrics(riders: DisplayRider[]) { const groups = new Map<string, DisplayRider[]>(); for (const rider of riders) groups.set(rider.district, [...(groups.get(rider.district) ?? []), rider]); return Array.from(groups, ([name, entries]) => { const assigned = entries.reduce((sum, rider) => sum + rider.total_assigned, 0); const delivered = entries.reduce((sum, rider) => sum + rider.delivered, 0); return { name, riders: entries.length, assigned, rate: assigned ? Math.round(delivered / assigned * 100) : 0 }; }).sort((a, b) => b.assigned - a.assigned); }
function statusLabel(status: RiderStatus) { return ({ delivering: "Đang giao", completed: "Đã giao xong", warning: "Cảnh báo" } as const)[status]; }
function isKv56(value: string | null) { return /^(?:kv|khu vuc)?\s*[56]$/i.test(normalize(value ?? "")); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim(); }
function formatDateTime(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); if (!Number.isFinite(date.getTime())) return "—"; return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(date); }
function formatAge(seconds: number) { if (seconds < 60) return `${seconds} giây trước`; if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`; return formatDateTime(new Date(Date.now() - seconds * 1000).toISOString()); }
function formatDuration(seconds: number) { if (!seconds) return "—"; const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours}g ${minutes}p` : `${minutes} phút`; }
function formatFailureRate(row: Pick<RealtimeRider, "failed" | "total_assigned">) { return row.total_assigned > 0 ? `${Math.round(row.failed / row.total_assigned * 100)}%` : "0%"; }
function todayInVietnam() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
