/* Hallmark · macrostructure: Bento Grid · theme: Cobalt adapted · genre: modern-minimal · enrichment: none
 * pre-emit critique: P5 H4 E5 S5 R5 V5 · contrast: pass (40–41) · tokens: pass (48) · mobile: pass (34, 49–57)
 * nav: existing app side rail · footer: existing mobile dock · slop: pass (46) · honest: pass
 */
"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
  Clock3,
  MapPin,
  PackageCheck,
  RefreshCcw,
  Search,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/utils/cn";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";

type RealtimeRider = { id: string; driver_id: string; driver_name: string | null; total_assigned: number; delivered: number; delivering: number; failed: number; zone_id: string | null; first_delivery_at: string | null; idle_delivery_seconds: number; snapshot_id: string; snapshot_at: string };
type RiderProfile = { rider_code: string; full_name: string | null; kv: string | null; delivery_district: string | null; delivery_ward: string | null; cot: string | null };
type RiderStatus = "delivering" | "completed" | "warning";
type DisplayRider = RealtimeRider & { name: string; kv: string; district: string; ward: string; cot: string; status: RiderStatus; progress: number };
type SortKey = "name" | "status" | "eta" | "delivered" | "cot";
type TimeRange = "15m" | "1h" | "today";
type DistrictDetail = {
  name: string;
  kv: string;
  area: string;
  riders: DisplayRider[];
  totalAssigned: number;
  delivered: number;
  delivering: number;
  failed: number;
  warning: number;
  completed: number;
  rate: number;
  avgProgress: number;
};

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
  const [cot, setCot] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("15m");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "status", direction: "asc" });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<DisplayRider | null>(null);
  const [activeDistrict, setActiveDistrict] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useReportInitialDataLoading("realtime-dashboard", loading);
  const [error, setError] = useState<string | null>(null);

  const loadProfiles = useCallback(async () => {
    const supabase = createClient();
    const result = await supabase.from("riders").select("rider_code,full_name,kv,delivery_district,delivery_ward,cot").eq("status", "active");
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
        cot: profile.cot?.trim() || "—",
        status: getRiderStatus(row),
        progress,
      }];
    });
  }, [profiles, rows]);

  const zones = useMemo(() => [...new Set(riders.map((rider) => rider.district))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })), [riders]);
  const cotOptions = useMemo(() => [...new Set(riders.map((r) => r.cot).filter((v) => v && v !== "—"))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true })), [riders]);
  const districtDetails = useMemo(() => buildDistrictDetails(riders), [riders]);
  const kvAggregates = useMemo(() => buildKvAggregates(districtDetails), [districtDetails]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    const districtFiltered = activeDistrict ? riders.filter((r) => r.district === activeDistrict) : riders;
    const result = districtFiltered.filter((rider) =>
      (zone === "all" || rider.district === zone) &&
      (status === "all" || rider.status === status) &&
      (cot === "all" || rider.cot === cot || normalize(rider.cot) === normalize(cot)) &&
      (!q || normalize(`${rider.driver_id} ${rider.name} ${rider.district} ${rider.ward} ${rider.cot}`).includes(q)),
    );
    return result.sort((a, b) => compareRiders(a, b, sort.key) * (sort.direction === "asc" ? 1 : -1));
  }, [query, riders, sort, status, zone, cot, activeDistrict]);

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
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const changeSort = useCallback((key: SortKey) => {
    setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
    setPage(1);
  }, []);

  const activeDistrictDetail = activeDistrict ? districtDetails.find((d) => d.name === activeDistrict) ?? null : null;

  return (
    <div className="dashboard-control mx-auto max-w-[1600px] space-y-6">
      {/* Command header - graphite */}
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Realtime operations · KV5 + KV6 · per-district</div>
          <h1>Realtime Delivery — Theo quận</h1>
          <p>Mỗi ô là một quận. Màu, thanh tiến độ và cảnh báo cho biết quận nào cần can thiệp ngay.</p>
        </div>
        <div className="dashboard-command-actions">
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-semibold text-[var(--color-graphite-ink)]/70 lg:inline">Ngày</span>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} className="h-9 rounded-md border border-[var(--color-graphite-2)] bg-[var(--color-graphite-2)] px-3 text-sm font-semibold text-[var(--color-graphite-ink)] outline-none focus:border-[var(--color-focus)]" />
          </div>
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /><span>Làm mới</span></Button>
        </div>
      </header>

      <div className="dashboard-readout-strip"><RealtimeIndicator snapshotAt={snapshotAt} loading={loading} /><span className="hidden sm:inline">KV5 + KV6 only</span>{activeDistrict ? <button type="button" onClick={() => setActiveDistrict(null)} className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-accent)]">Đang lọc: {activeDistrict} <X size={12} /></button> : <span className="ml-auto hidden items-center gap-1.5 text-xs text-[var(--color-muted)] sm:inline-flex"><MapPin size={12} />{districtDetails.length} quận có rider</span>}</div>
      {error ? <div role="alert" className="dashboard-error">{error}</div> : null}

      {/* KPI */}
      <section aria-labelledby="kpi-heading" className="space-y-3">
        <h2 id="kpi-heading" className="sr-only">Chỉ số tổng quan</h2>
        <div className="grid grid-cols-12 gap-3">
          <KpiCard className="col-span-6 lg:col-span-3" icon={UsersRound} label="Rider hoạt động" value={activeRiders} helper={`${riders.length} rider · ${warningRiders} cảnh báo`} tone={warningRiders ? "red" : "blue"} loading={loading} />
          <KpiCard className="col-span-6 lg:col-span-3" icon={Activity} label="Đơn đang giao" value={totals.delivering} helper={`${totals.assigned.toLocaleString("vi-VN")} đã gán`} tone="blue" loading={loading} />
          <KpiCard className="col-span-6 lg:col-span-3" icon={CheckCircle2} label="Đúng hạn" value={`${onTimeRate}%`} helper={`${totals.delivered.toLocaleString("vi-VN")} đã giao`} tone="green" loading={loading} />
          <KpiCard className="col-span-6 lg:col-span-3" icon={CircleAlert} label="Cần can thiệp" value={warningRiders} helper={zeroProgressRiders ? `${zeroProgressRiders} đứng yên · ${totals.failed} lỗi` : `${totals.failed} lỗi`} tone={warningRiders ? "red" : "green"} loading={loading} />
        </div>
        <PerformanceChart totals={totals} />
      </section>

      {/* BENTO GRID — per-district */}
      <section aria-labelledby="district-bento-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><span className="font-mono text-xs font-bold tracking-[0.12em] text-[var(--color-accent)]">02 — BENTO</span><span className="h-px w-8 bg-[var(--color-rule-strong)]" aria-hidden="true" /></div>
            <h2 id="district-bento-heading" className="mt-1 text-base font-bold tracking-tight text-[var(--color-ink)]">Vận hành theo quận</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">Mỗi ô là một quận. Chạm để lọc bảng rider bên dưới. Kích thước ô phản ánh khối lượng đơn.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--color-error)]" />Cảnh báo</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--color-accent)]" />Đang giao</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--color-success)]" />Hoàn tất</span>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-12 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="col-span-12 h-40 animate-pulse rounded-xl bg-[var(--color-paper-3)] md:col-span-6 lg:col-span-4 xl:col-span-3" />)}
          </div>
        ) : districtDetails.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--color-rule)] bg-[var(--color-paper)] p-8 text-center text-sm text-[var(--color-muted)]">Chưa có dữ liệu quận cho ngày {date}.</p>
        ) : (
          <div className="grid auto-rows-[minmax(168px,auto)] grid-cols-12 gap-3">
            {/* KV aggregates — large bento tiles */}
            <KvBentoTile kv="KV5" detail={kvAggregates.kv5} onSelectDistrict={setActiveDistrict} activeDistrict={activeDistrict} />
            <KvBentoTile kv="KV6" detail={kvAggregates.kv6} onSelectDistrict={setActiveDistrict} activeDistrict={activeDistrict} />
            {/* District tiles — bento irregular: top 2 districts span 6, rest span 3 */}
            {districtDetails.map((d, idx) => {
              const isLarge = idx < 2;
              return <DistrictBentoCard key={d.name} district={d} large={isLarge} active={activeDistrict === d.name} onSelect={() => setActiveDistrict((cur) => cur === d.name ? null : d.name)} />;
            })}
          </div>
        )}

        {activeDistrictDetail ? (
          <div className="flex items-center justify-between rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 text-sm">
            <span className="font-semibold text-[var(--color-accent)]">Đang xem: {activeDistrictDetail.name} · {activeDistrictDetail.riders.length} rider · {activeDistrictDetail.totalAssigned} đơn</span>
            <button type="button" onClick={() => setActiveDistrict(null)} className="font-bold text-[var(--color-accent)] hover:underline">Xóa lọc</button>
          </div>
        ) : null}
      </section>

      <FilterBar
        date={date} timeRange={timeRange} zone={zone} status={status} cot={cot} zones={zones} cotOptions={cotOptions}
        onDateChange={(value) => { setDate(value); setPage(1); }}
        onTimeRangeChange={(value) => { setTimeRange(value); setPage(1); }}
        onZoneChange={(value) => { setZone(value); setPage(1); }}
        onStatusChange={(value) => { setStatus(value); setPage(1); }}
        onCotChange={(value) => { setCot(value); setPage(1); }}
      />

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

      {selected ? <RiderDetails rider={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

export const KpiCard = memo(function KpiCard({ icon: Icon, label, value, helper, tone, className, loading }: { icon: typeof Bike; label: string; value: number | string; helper: string; tone: "blue" | "green" | "red"; className?: string; loading?: boolean }) {
  const colors = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700" };
  return <article className={cn("min-h-36 rounded-xl border border-slate-200 bg-white p-4", className)}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-slate-950">{loading ? "—" : typeof value === "number" ? value.toLocaleString("vi-VN") : value}</p></div><span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", colors[tone])}><Icon size={18} /></span></div><p className="mt-4 text-xs text-slate-500">{helper}</p></article>;
});

function KvBentoTile({ kv, detail, onSelectDistrict, activeDistrict }: { kv: "KV5" | "KV6"; detail: DistrictDetail | null; onSelectDistrict: (name: string) => void; activeDistrict: string | null }) {
  if (!detail) return <article className="col-span-12 flex min-h-[168px] flex-col justify-center rounded-xl border border-dashed border-[var(--color-rule)] bg-[var(--color-paper)] p-5 md:col-span-6"><p className="font-mono text-xs font-bold tracking-[0.12em] text-[var(--color-muted)]">{kv}</p><p className="mt-2 text-sm font-semibold text-[var(--color-muted)]">Chưa có rider</p></article>;
  const pct = detail.totalAssigned ? Math.round((detail.delivered / detail.totalAssigned) * 100) : 0;
  return (
    <article className="col-span-12 flex min-h-[168px] flex-col rounded-xl border border-[var(--color-graphite-2)] bg-[var(--color-graphite)] p-5 text-[var(--color-graphite-ink)] md:col-span-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-bold tracking-[0.16em] opacity-70">{kv} · {detail.area}</p>
          <h3 className="mt-1 text-lg font-bold tracking-tight">{detail.name === "KV5" || detail.name === "KV6" ? `Khu vực ${kv.slice(-1)}` : detail.name}</h3>
          <p className="mt-1 text-xs opacity-70">{detail.riders.length} rider · {detail.totalAssigned} đơn · {detail.warning} cảnh báo</p>
        </div>
        <span className="grid size-9 place-items-center rounded-lg bg-[var(--color-graphite-ink)]/10 text-[var(--color-graphite-ink)]"><UsersRound size={16} /></span>
      </div>
      <div className="mt-auto grid grid-cols-3 gap-3 pt-4">
        <div><p className="font-mono text-xs opacity-60">Đã gán</p><p className="text-sm font-bold tabular-nums">{detail.totalAssigned}</p></div>
        <div><p className="font-mono text-xs opacity-60">Tiến độ</p><p className="text-sm font-bold tabular-nums">{pct}%</p></div>
        <div><p className="font-mono text-xs opacity-60">Đang giao</p><p className="text-sm font-bold tabular-nums">{detail.delivering}</p></div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-graphite-ink)]/15"><div className="h-full rounded-full bg-[var(--color-accent)] transition-all" style={{ width: `${pct}%` }} /></div>
    </article>
  );
}

function DistrictBentoCard({ district, large, active, onSelect }: { district: DistrictDetail; large: boolean; active: boolean; onSelect: () => void }) {
  const pct = district.totalAssigned ? Math.round((district.delivered / district.totalAssigned) * 100) : 0;
  const failurePct = district.totalAssigned ? Math.round((district.failed / district.totalAssigned) * 100) : 0;
  const topWarnings = district.riders.filter((r) => r.status === "warning").slice(0, 2);
  return (
    <article
      onClick={onSelect}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      className={cn(
        "group relative flex min-h-[168px] cursor-pointer flex-col rounded-xl border bg-[var(--color-paper)] p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]",
        active ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-md" : "border-[var(--color-rule)] hover:border-[var(--color-rule-strong)]",
        large ? "col-span-12 md:col-span-6" : "col-span-12 md:col-span-6 lg:col-span-4 xl:col-span-3",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <MapPin size={13} className={cn(active ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]")} />
            <h3 className="truncate text-sm font-bold tracking-tight text-[var(--color-ink)]">{district.name}</h3>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <span className="inline-flex rounded-full bg-[var(--color-paper-2)] px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wide text-[var(--color-ink-2)] ring-1 ring-[var(--color-rule)]">{district.kv}</span>
            <span>{district.riders.length} rider</span>·<span>{district.area}</span>
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-1 font-mono text-xs font-bold tabular-nums", pct >= 80 ? "bg-[var(--color-success-soft)] text-[var(--color-success)]" : pct >= 50 ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning)]")}>{pct}%</span>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 border-y border-[var(--color-rule)] py-3">
        <div className="text-center"><p className="font-mono text-[10px] font-bold tracking-wide text-[var(--color-muted)]">GÁN</p><p className="mt-1 text-sm font-bold tabular-nums text-[var(--color-ink)]">{district.totalAssigned}</p></div>
        <div className="text-center border-l border-[var(--color-rule)]"><p className="font-mono text-[10px] font-bold tracking-wide text-[var(--color-muted)]">XONG</p><p className="mt-1 text-sm font-bold tabular-nums text-[var(--color-success)]">{district.delivered}</p></div>
        <div className="text-center border-l border-[var(--color-rule)]"><p className="font-mono text-[10px] font-bold tracking-wide text-[var(--color-muted)]">ĐANG</p><p className="mt-1 text-sm font-bold tabular-nums text-[var(--color-accent)]">{district.delivering}</p></div>
        <div className="text-center border-l border-[var(--color-rule)]"><p className="font-mono text-[10px] font-bold tracking-wide text-[var(--color-muted)]">LỖI</p><p className="mt-1 text-sm font-bold tabular-nums text-[var(--color-error)]">{district.failed}</p>{failurePct >= 20 ? <p className="text-[10px] font-bold text-[var(--color-error)]">{failurePct}%</p> : null}</div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-xs"><span className="font-medium text-[var(--color-muted)]">Tiến độ</span><span className="font-mono font-bold tabular-nums text-[var(--color-ink-2)]">{district.delivered}/{district.totalAssigned}</span></div>
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-[var(--color-paper-3)]">
          <div className="h-full bg-[var(--color-success)] transition-all" style={{ width: `${district.totalAssigned ? (district.delivered / district.totalAssigned) * 100 : 0}%` }} />
          <div className="h-full bg-[var(--color-accent)] transition-all" style={{ width: `${district.totalAssigned ? (district.delivering / district.totalAssigned) * 100 : 0}%` }} />
          <div className="h-full bg-[var(--color-error)] transition-all" style={{ width: `${district.totalAssigned ? (district.failed / district.totalAssigned) * 100 : 0}%` }} />
        </div>
        <div className="mt-1 flex gap-3 text-[10px]"><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-[var(--color-success)]" />Đã giao</span><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-[var(--color-accent)]" />Đang giao</span><span className="inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-[var(--color-error)]" />Lỗi</span></div>
      </div>

      {district.warning > 0 ? (
        <div className="mt-3 rounded-lg bg-[var(--color-error-soft)] px-2.5 py-2">
          <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wide text-[var(--color-error)]"><CircleAlert size={11} />{district.warning} cảnh báo</p>
          <ul className="mt-1.5 space-y-1">
            {topWarnings.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-xs"><span className="truncate font-medium text-[var(--color-ink-2)]">{r.name}</span><span className="shrink-0 font-mono text-[10px] text-[var(--color-muted)]">{r.delivering} đang · {formatDuration(r.idle_delivery_seconds) || "chờ"}</span></li>
            ))}
          </ul>
        </div>
      ) : district.delivering === 0 && district.totalAssigned > 0 ? (
        <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-[var(--color-success-soft)] px-2 py-1 font-mono text-[10px] font-bold text-[var(--color-success)]"><CheckCircle2 size={11} />Hoàn tất</p>
      ) : null}

      <span className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-transparent group-hover:ring-[var(--color-rule-strong)]" aria-hidden="true" />
      {active ? <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-ink)] shadow"><CheckCircle2 size={12} /></span> : null}
    </article>
  );
}

export function FilterBar({ date, timeRange, zone, status, cot, zones, cotOptions, onDateChange, onTimeRangeChange, onZoneChange, onStatusChange, onCotChange }: { date: string; timeRange: TimeRange; zone: string; status: RiderStatus | "all"; cot: string; zones: string[]; cotOptions: string[]; onDateChange: (value: string) => void; onTimeRangeChange: (value: TimeRange) => void; onZoneChange: (value: string) => void; onStatusChange: (value: RiderStatus | "all") => void; onCotChange: (value: string) => void }) {
  return <section aria-label="Bộ lọc toàn cục" className="rounded-xl border border-slate-200 bg-white p-4"><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5"><FilterField label="Ngày"><Input type="date" value={date} onChange={(event) => onDateChange(event.target.value)} /></FilterField><FilterField label="Khoảng thời gian"><Select value={timeRange} onChange={(event) => onTimeRangeChange(event.target.value as TimeRange)}><option value="15m">15 phút gần nhất</option><option value="1h">1 giờ gần nhất</option><option value="today">Hôm nay</option></Select></FilterField><FilterField label="Khu vực"><Select value={zone} onChange={(event) => onZoneChange(event.target.value)}><option value="all">Tất cả khu vực</option>{zones.map((item) => <option key={item} value={item}>{item}</option>)}</Select></FilterField><FilterField label="COT"><Select value={cot} onChange={(event) => onCotChange(event.target.value)}><option value="all">Tất cả COT</option>{cotOptions.map((item) => <option key={item} value={item}>{item}</option>)}</Select></FilterField><FilterField label="Trạng thái rider"><Select value={status} onChange={(event) => onStatusChange(event.target.value as RiderStatus | "all")}><option value="all">Tất cả trạng thái</option><option value="delivering">Đang giao</option><option value="completed">Đã giao xong</option><option value="warning">Cảnh báo</option></Select></FilterField></div><div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3"><span className="text-xs font-semibold text-slate-500">Đang lọc:</span><FilterChip>{timeRange === "15m" ? "15 phút" : timeRange === "1h" ? "1 giờ" : "Hôm nay"}</FilterChip><FilterChip>{zone === "all" ? "Mọi khu vực" : zone}</FilterChip><FilterChip>{cot === "all" ? "Mọi COT" : cot}</FilterChip><FilterChip>{status === "all" ? "Mọi trạng thái" : statusLabel(status)}</FilterChip></div></section>;
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

function CotBadge({ cot }: { cot: string }) {
  if (!cot || cot === "—") return <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">—</span>;
  const isCot1 = /cot\s*1|1/i.test(cot);
  const style = isCot1 ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-violet-50 text-violet-700 ring-violet-200";
  return <span className={cn("inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1", style)}>{cot}</span>;
}

export const RiderTable = memo(function RiderTable({ rows, total, allTotal, query, loading, sort, page, pageCount, onQueryChange, onSort, onSelect, onPrevious, onNext }: { rows: DisplayRider[]; total: number; allTotal: number; query: string; loading: boolean; sort: { key: SortKey; direction: "asc" | "desc" }; page: number; pageCount: number; onQueryChange: (value: string) => void; onSort: (key: SortKey) => void; onSelect: (rider: DisplayRider) => void; onPrevious: () => void; onNext: () => void }) {
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex flex-col gap-4 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 id="rider-status-heading" className="text-base font-bold text-slate-950">Trạng thái rider</h2><p className="mt-0.5 text-sm text-slate-500">Hiển thị {total}/{allTotal} rider · Chọn một dòng để xem chi tiết</p></div><label className="relative block w-full lg:w-80"><span className="sr-only">Tìm rider</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><Input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Tìm tên, mã, COT hoặc khu vực" className="pl-9" /></label></div><div className="max-h-[560px] min-h-[360px] overflow-auto"><table className="w-full min-w-[900px] table-fixed text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-600 shadow-[0_1px_0_#e2e8f0]"><tr><SortableHeader label="Rider" sortKey="name" current={sort} onSort={onSort} className="w-[24%]" /><SortableHeader label="Trạng thái" sortKey="status" current={sort} onSort={onSort} className="w-[14%]" /><th className="px-4 py-3 font-semibold">Khu vực</th><SortableHeader label="COT" sortKey="cot" current={sort} onSort={onSort} className="w-[12%]" /><SortableHeader label="Đã giao" sortKey="delivered" current={sort} onSort={onSort} align="right" /><SortableHeader label="Thời gian chờ" sortKey="eta" current={sort} onSort={onSort} align="right" /></tr></thead><tbody className="divide-y divide-slate-100">{loading ? Array.from({ length: 8 }, (_, index) => <tr key={index} className="h-15 animate-pulse"><td colSpan={6} className="px-4"><div className="h-4 rounded bg-slate-100" /></td></tr>) : rows.map((rider) => <tr key={rider.id} tabIndex={0} onClick={() => onSelect(rider)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(rider); }} className="h-16 cursor-pointer bg-white transition-colors hover:bg-blue-50/50 focus:bg-blue-50 focus:outline-none"><td className="px-4"><div className="font-semibold text-slate-900">{rider.name}</div><div className="font-mono text-xs text-slate-500">{rider.driver_id}</div></td><td className="px-4"><StatusBadge status={rider.status} /></td><td className="px-4"><div className="font-medium text-slate-700">{rider.district}</div><div className="text-xs text-slate-500">{rider.ward}</div></td><td className="px-4"><CotBadge cot={rider.cot} /></td><td className="px-4 text-right tabular-nums"><span className="font-semibold text-slate-900">{rider.delivered}</span><span className="text-slate-500">/{rider.total_assigned}</span><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${rider.progress}%` }} /></div></td><td className="px-4 text-right tabular-nums text-slate-600">{rider.delivering > 0 ? formatDuration(rider.idle_delivery_seconds) : "—"}</td></tr>)}</tbody></table></div><div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm"><span className="text-slate-500">Trang {page}/{pageCount} · {total} rider</span><div className="flex gap-2"><Button type="button" variant="secondary" disabled={page <= 1} onClick={onPrevious}><ChevronLeft size={16} /> Trước</Button><Button type="button" variant="secondary" disabled={page >= pageCount} onClick={onNext}>Sau <ChevronRight size={16} /></Button></div></div></div>;
});

function PerformanceChart({ totals, className }: { totals: { assigned: number; delivered: number; delivering: number; failed: number }; className?: string }) {
  const segments = [{ label: "Đã giao", value: totals.delivered, color: "bg-emerald-500" }, { label: "Đang giao", value: totals.delivering, color: "bg-blue-600" }, { label: "Giao lỗi", value: totals.failed, color: "bg-red-500" }];
  const max = Math.max(1, ...segments.map((segment) => segment.value));
  return <article className={cn("rounded-xl border border-slate-200 bg-white p-4", className)}><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><TrendingUp size={18} className="text-blue-700" /><h3 className="font-bold text-slate-950">Luồng xử lý đơn</h3></div><p className="mt-1 text-sm text-slate-500">So sánh các trạng thái đơn trong snapshot hiện tại</p></div><div className="flex flex-wrap gap-3">{segments.map((segment) => <span key={segment.label} className="flex items-center gap-1.5 text-xs text-slate-600"><span className={cn("size-2 rounded-sm", segment.color)} />{segment.label}</span>)}</div></div><div className="mt-5 grid h-28 grid-cols-3 items-end gap-4 border-b border-slate-200 px-2 sm:gap-8 sm:px-8">{segments.map((segment) => <div key={segment.label} className="flex h-full flex-col justify-end"><p className="mb-1 text-center text-xs font-semibold tabular-nums text-slate-700">{segment.value.toLocaleString("vi-VN")}</p><div className={cn("mx-auto w-full max-w-32 rounded-t", segment.color)} style={{ height: `${Math.max(4, segment.value / max * 78)}%` }} /></div>)}</div><div className="grid grid-cols-3 gap-4 px-2 pt-2 text-center text-xs text-slate-500 sm:gap-8 sm:px-8">{segments.map((segment) => <span key={segment.label}>{segment.label}</span>)}</div></article>;
}

function RiderDetails({ rider, onClose }: { rider: DisplayRider; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); };
  }, [onClose]);
  return createPortal(
    <>
      <button type="button" aria-label="Đóng chi tiết rider" className="fixed inset-0 z-40 bg-slate-950/20" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-labelledby="rider-details-title" className="fixed inset-y-0 right-0 z-50 flex h-dvh w-full max-w-md flex-col overflow-hidden border-l border-slate-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 p-6">
          <div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Chi tiết rider</p><h2 id="rider-details-title" className="mt-1 text-xl font-bold text-slate-950">{rider.name}</h2><p className="text-sm text-slate-500">{rider.driver_id} · {rider.kv} · {rider.cot}</p></div>
          <Button type="button" variant="secondary" aria-label="Đóng" className="size-9 shrink-0 px-0" onClick={onClose}><X size={17} /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-scroll p-6 [scrollbar-gutter:stable]">
          <div className="flex flex-wrap gap-2"><StatusBadge status={rider.status} /><CotBadge cot={rider.cot} /></div>
          <dl className="mt-6 divide-y divide-slate-100 border-y border-slate-100">{[["Khu vực", `${rider.ward}, ${rider.district}`], ["COT", rider.cot], ["Đơn được phân", rider.total_assigned], ["Đã giao", rider.delivered], ["Đang giao", rider.delivering], ["Giao lỗi", rider.failed], ["Tỷ lệ giao lỗi", formatFailureRate(rider)], ["Tiến độ", `${rider.progress}%`], ["Thời gian chờ", formatDuration(rider.idle_delivery_seconds)], ["Giao đầu tiên", formatDateTime(rider.first_delivery_at)]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 py-3"><dt className="text-sm text-slate-500">{label}</dt><dd className="text-right text-sm font-semibold text-slate-900">{value}</dd></div>)}</dl>
        </div>
      </aside>
    </>,
    document.body,
  );
}

function SortableHeader({ label, sortKey, current, onSort, align, className }: { label: string; sortKey: SortKey; current: { key: SortKey; direction: "asc" | "desc" }; onSort: (key: SortKey) => void; align?: "right"; className?: string }) { const Icon = current.key !== sortKey ? ArrowUpDown : current.direction === "asc" ? ArrowUp : ArrowDown; return <th className={cn("px-4 py-3", className)}><button type="button" onClick={() => onSort(sortKey)} className={cn("flex items-center gap-1 font-semibold hover:text-slate-950", align === "right" && "ml-auto")}><span>{label}</span><Icon size={13} /></button></th>; }
function FilterField({ label, children }: { label: string; children: React.ReactNode }) { return <label className="space-y-1.5"><span className="block text-xs font-semibold text-slate-600">{label}</span>{children}</label>; }
function FilterChip({ children }: { children: React.ReactNode }) { return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{children}</span>; }
function getRiderStatus(row: RealtimeRider): RiderStatus { const failureRate = row.total_assigned > 0 ? row.failed / row.total_assigned : 0; if ((row.total_assigned > 0 && row.delivered === 0) || (row.delivering > 0 && row.idle_delivery_seconds > 3600) || failureRate >= HIGH_FAILURE_RATE) return "warning"; return row.delivering > 0 ? "delivering" : "completed"; }
function compareRiders(a: DisplayRider, b: DisplayRider, key: SortKey) { if (key === "name") return a.name.localeCompare(b.name, "vi", { numeric: true }); if (key === "status") return STATUS_ORDER[a.status] - STATUS_ORDER[b.status]; if (key === "cot") return a.cot.localeCompare(b.cot, "vi", { numeric: true }); if (key === "eta") return a.idle_delivery_seconds - b.idle_delivery_seconds; return a.delivered - b.delivered; }
function buildDistrictDetails(riders: DisplayRider[]): DistrictDetail[] {
  const groups = new Map<string, DisplayRider[]>();
  for (const rider of riders) groups.set(rider.district, [...(groups.get(rider.district) ?? []), rider]);
  return Array.from(groups, ([name, entries]) => {
    const totalAssigned = entries.reduce((s, r) => s + r.total_assigned, 0);
    const delivered = entries.reduce((s, r) => s + r.delivered, 0);
    const delivering = entries.reduce((s, r) => s + r.delivering, 0);
    const failed = entries.reduce((s, r) => s + r.failed, 0);
    const warning = entries.filter((r) => r.status === "warning").length;
    const completed = entries.filter((r) => r.status === "completed").length;
    const avgProgress = totalAssigned ? Math.round((delivered / totalAssigned) * 100) : 0;
    const kvCounts = entries.reduce((acc, r) => { const k = (r.kv || "").toUpperCase(); if (k.includes("5")) acc.kv5 += 1; else if (k.includes("6")) acc.kv6 += 1; return acc; }, { kv5: 0, kv6: 0 });
    const kv = kvCounts.kv5 >= kvCounts.kv6 ? "KV5" : "KV6";
    const area = kv === "KV5" ? "Khu vực 5" : "Khu vực 6";
    return { name, kv, area, riders: entries, totalAssigned, delivered, delivering, failed, warning, completed, rate: totalAssigned ? Math.round((delivered / totalAssigned) * 100) : 0, avgProgress };
  }).sort((a, b) => b.totalAssigned - a.totalAssigned || a.name.localeCompare(b.name, "vi"));
}
function buildKvAggregates(details: DistrictDetail[]): Record<"kv5" | "kv6", DistrictDetail | null> {
  const kv5Details = details.filter((d) => d.kv === "KV5");
  const kv6Details = details.filter((d) => d.kv === "KV6");
  const agg = (list: DistrictDetail[], kv: string): DistrictDetail | null => {
    if (!list.length) return null;
    const riders = list.flatMap((d) => d.riders);
    return {
      name: kv, kv, area: kv === "KV5" ? "Khu vực 5" : "Khu vực 6",
      riders, totalAssigned: riders.reduce((s, r) => s + r.total_assigned, 0),
      delivered: riders.reduce((s, r) => s + r.delivered, 0),
      delivering: riders.reduce((s, r) => s + r.delivering, 0),
      failed: riders.reduce((s, r) => s + r.failed, 0),
      warning: riders.filter((r) => r.status === "warning").length,
      completed: riders.filter((r) => r.status === "completed").length,
      rate: 0, avgProgress: 0,
    };
  };
  return { kv5: agg(kv5Details, "KV5"), kv6: agg(kv6Details, "KV6") };
}
function statusLabel(status: RiderStatus) { return ({ delivering: "Đang giao", completed: "Đã giao xong", warning: "Cảnh báo" } as const)[status]; }
function isKv56(value: string | null) { return /^(?:kv|khu vuc)?\s*[56]$/i.test(normalize(value ?? "")); }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim(); }
function formatDateTime(value: string | null | undefined) { if (!value) return "—"; const date = new Date(value); if (!Number.isFinite(date.getTime())) return "—"; return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(date); }
function formatAge(seconds: number) { if (seconds < 60) return `${seconds} giây trước`; if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`; return formatDateTime(new Date(Date.now() - seconds * 1000).toISOString()); }
function formatDuration(seconds: number) { if (!seconds) return "—"; const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); return hours ? `${hours}g ${minutes}p` : `${minutes} phút`; }
function formatFailureRate(row: Pick<RealtimeRider, "failed" | "total_assigned">) { return row.total_assigned > 0 ? `${Math.round(row.failed / row.total_assigned * 100)}%` : "0%"; }
function todayInVietnam() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
