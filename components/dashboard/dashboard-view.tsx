"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ChevronRight, CircleAlert, Clock3, MapPin, PackageCheck, PackageOpen, PackageX, RefreshCcw, Truck } from "lucide-react";
import { format, subDays } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import type { ActivityLog, Rider } from "@/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/utils/cn";
import { compactZoneName, MAP_DISTRICTS } from "@/components/zones/zone-map-types";

type RangeKey = "today" | "yesterday" | "7d";
type VolumeMode = "delivery" | "pickup" | "all";
type VolumeGrouping = "week" | "month";
type VolumeRow = { report_date: string | null; district: string | null; area: string | null; total_orders: number | null };
type DailyVolumeRecord = { date: string; volume: number; type: "delivery" | "pickup" };
type RealtimeRow = { work_date: string; driver_id: string; total_assigned: number; delivered: number; delivering: number; failed: number; idle_delivery_seconds: number; snapshot_id: string; snapshot_at: string };
type DashboardState = { riders: Rider[]; activity: ActivityLog[]; delivery: VolumeRow[]; pickup: VolumeRow[]; realtime: RealtimeRow[] };
type FailedLeader = { riderCode: string; riderName: string; district: string; failed: number; assigned: number };
const emptyState: DashboardState = { riders: [], activity: [], delivery: [], pickup: [], realtime: [] };

export function DashboardView() {
  const [state, setState] = useState<DashboardState>(emptyState);
  const [range, setRange] = useState<RangeKey>("today");
  const [volumeMode, setVolumeMode] = useState<VolumeMode>("all");
  const [volumeGrouping, setVolumeGrouping] = useState<VolumeGrouping>("week");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dateRange = useMemo(() => getDateRange(range), [range]);

  const loadDashboard = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    setError(null);
    const historyStart = monthStartOffset(dateRange.end, -11);
    const [riders, activity, delivery, pickup, realtime] = await Promise.all([
      supabase.from("riders").select("*, zones(id,name,area,hub)").order("updated_at", { ascending: false }),
      supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(10),
      fetchVolumeRows(supabase, "delivery_order", historyStart, dateRange.end),
      fetchVolumeRows(supabase, "pickup_volume", historyStart, dateRange.end),
      fetchRealtimeHistory(supabase, dateRange.end),
    ]);
    const results = [riders, activity, delivery, pickup, realtime];
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) setError(firstError.message ?? "Không thể tải dữ liệu dashboard");
    else {
      setState({ riders: (riders.data ?? []) as Rider[], activity: (activity.data ?? []) as ActivityLog[], delivery: (delivery.data ?? []) as VolumeRow[], pickup: (pickup.data ?? []) as VolumeRow[], realtime: (realtime.data ?? []) as RealtimeRow[] });
      setLastUpdated(new Date());
    }
    setLoading(false);
  }, [dateRange.end]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard]);
  const refresh = useCallback(() => { void loadDashboard(); }, [loadDashboard]);
  useSupabaseRealtime({ table: "riders", onChange: refresh });
  useSupabaseRealtime({ table: "activity_logs", onChange: refresh });
  useSupabaseRealtime({ table: "delivery_order", onChange: refresh });
  useSupabaseRealtime({ table: "pickup_volume", onChange: refresh });
  useSupabaseRealtime({ table: "realtime_delivery_riders", onChange: refresh });

  const kv56Delivery = useMemo(() => state.delivery.filter(isKv56VolumeRow), [state.delivery]);
  const kv56Pickup = useMemo(() => state.pickup.filter(isKv56VolumeRow), [state.pickup]);
  const summary = useMemo(() => buildSummary({ ...state, delivery: kv56Delivery, pickup: kv56Pickup }, dateRange), [dateRange, kv56Delivery, kv56Pickup, state]);
  const volumeAnalytics = useMemo(() => buildVolumeAnalytics(kv56Delivery, kv56Pickup, volumeMode, volumeGrouping), [kv56Delivery, kv56Pickup, volumeGrouping, volumeMode]);
  const volumeDailyData = useMemo(() => buildDailyVolumeRecords(kv56Delivery, kv56Pickup, volumeMode), [kv56Delivery, kv56Pickup, volumeMode]);
  const districtAverages = useMemo(() => ({ delivery: buildDistrictAverages(kv56Delivery, dateRange.end), pickup: buildDistrictAverages(kv56Pickup, dateRange.end) }), [dateRange.end, kv56Delivery, kv56Pickup]);
  const failedLeaders = useMemo(() => buildFailedLeaders(state, dateRange.end), [dateRange.end, state]);
  const alerts = useMemo(() => buildAlerts(state, summary), [state, summary]);

  return <div className="dashboard-control mx-auto max-w-[1600px] space-y-6">
    <header className="dashboard-command-header">
      <div className="min-w-0">
        <div className="dashboard-kicker"><span className="dashboard-live-dot" />Operations control · KV5 + KV6</div>
        <h1>Volume & Delivery Control</h1>
        <p>Volume, delivery status và Failed rider trong đúng phạm vi Khu vực 5–6.</p>
      </div>
      <div className="dashboard-command-actions">
        <Select value={range} onChange={(event) => setRange(event.target.value as RangeKey)} aria-label="Khoảng thời gian"><option value="today">Hôm nay</option><option value="yesterday">Hôm qua</option><option value="7d">7 ngày gần nhất</option></Select>
        <Button type="button" variant="secondary" onClick={refresh} disabled={loading}><RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /><span>Làm mới</span></Button>
      </div>
    </header>

    <div className="dashboard-readout-strip"><Clock3 size={14} /><strong>{rangeLabel(range)}</strong><span>KV5 + KV6 only</span><span className="dashboard-readout-time">{lastUpdated ? `Updated ${format(lastUpdated, "HH:mm:ss")}` : "Loading data"}</span></div>
    {error ? <p role="alert" className="dashboard-error">Không thể tải dashboard: {error}</p> : null}

    <section aria-labelledby="current-state" className="space-y-3">
      <DashboardSectionHeading id="current-state" index="01" title="Volume & current snapshot" description="Volume theo khoảng đã chọn; delivery status lấy snapshot cuối ngày." />
      <div className="grid grid-cols-12 gap-3">
        <KpiCard className="col-span-6 lg:col-span-4 xl:col-span-2" href="/volume/delivery" icon={PackageOpen} label="Total Volume" value={summary.totalVolume} context={`${rangeLabel(range)} · KV5 + KV6`} tone="blue" loading={loading} />
        <KpiCard className="col-span-6 lg:col-span-4 xl:col-span-2" href="/volume/delivery" icon={Truck} label="Delivery Volume" value={summary.deliveryVolume} context={`${volumeShare(summary.deliveryVolume, summary.totalVolume)} of total`} tone="blue" loading={loading} />
        <KpiCard className="col-span-6 lg:col-span-4 xl:col-span-2" href="/volume/pickup" icon={PackageCheck} label="Pickup Volume" value={summary.pickupVolume} context={`${volumeShare(summary.pickupVolume, summary.totalVolume)} of total`} tone="slate" loading={loading} />
        <KpiCard className="col-span-6 lg:col-span-4 xl:col-span-2" href="/realtime-dashboard" icon={Activity} label="Delivering" value={summary.delivering} context={`${summary.assigned.toLocaleString("vi-VN")} assigned`} tone="blue" loading={loading} />
        <KpiCard className="col-span-6 lg:col-span-4 xl:col-span-2" href="/realtime-dashboard" icon={PackageCheck} label="Delivered" value={summary.delivered} context={`${summary.deliveryRate}% completion`} tone="green" loading={loading} />
        <KpiCard className="col-span-6 lg:col-span-4 xl:col-span-2" href="/realtime-dashboard" icon={PackageX} label="Failed" value={summary.failed} context="Latest daily snapshot" tone={summary.failed ? "red" : "green"} loading={loading} />
      </div>
    </section>

    <section aria-labelledby="volume-trend" className="space-y-3">
      <div className="dashboard-section-row">
        <DashboardSectionHeading id="volume-trend" index="02" title="Volume trend" description="Chỉ gồm các dòng có area KV5/KV6 hoặc quận thuộc phạm vi vận hành." />
        <div className="dashboard-chart-filters"><Select value={volumeMode} onChange={(event) => setVolumeMode(event.target.value as VolumeMode)} aria-label="Chế độ volume"><option value="all">Delivery + Pickup</option><option value="delivery">Delivery</option><option value="pickup">Pickup</option></Select><Select value={volumeGrouping} onChange={(event) => setVolumeGrouping(event.target.value as VolumeGrouping)} aria-label="Nhóm volume"><option value="week">Theo tuần</option><option value="month">Theo tháng</option></Select></div>
      </div>
      <div className="grid grid-cols-12 gap-3">
        {volumeGrouping === "week" ? <WeeklyVolumeTrendWithDailyBars className="col-span-12 xl:col-span-8" data={volumeDailyData} defaultWeeksRange={4} loading={loading} /> : <VolumeAnalyticsChart className="col-span-12 xl:col-span-8" analytics={volumeAnalytics} grouping={volumeGrouping} loading={loading} />}
        <div className="col-span-12 grid gap-3 sm:grid-cols-2 xl:col-span-4 xl:grid-cols-1"><VolumeComparisonCard analytics={volumeAnalytics} /><ProgressChart delivered={summary.delivered} delivering={summary.delivering} failed={summary.failed} /></div>
      </div>
    </section>

    <section aria-labelledby="district-average" className="space-y-3">
      <DashboardSectionHeading id="district-average" index="03" title="Monthly daily average by district" description="Tổng volume trong tháng chia cho số ngày thực tế có dữ liệu, tách riêng Delivery và Pickup." />
      <div className="grid gap-3 lg:grid-cols-2"><DistrictDonutCard title="Delivery average" icon={Truck} data={districtAverages.delivery} loading={loading} /><DistrictDonutCard title="Pickup average" icon={PackageOpen} data={districtAverages.pickup} loading={loading} /></div>
    </section>

    <section aria-labelledby="failed-ranking" className="space-y-3">
      <DashboardSectionHeading id="failed-ranking" index="04" title="Top rider Failed (On Hold)" description="Xếp hạng rider KV5/KV6 theo số đơn Failed; mỗi ngày chỉ lấy snapshot cuối ngày để không đếm trùng." />
      <div className="grid gap-3 lg:grid-cols-2"><FailedLeaderboard title="Selected day" subtitle={formatDate(dateRange.end)} rows={failedLeaders.day} loading={loading} /><FailedLeaderboard title="Last 7 days" subtitle={`${formatDate(shiftDate(dateRange.end, -6))}–${formatDate(dateRange.end)}`} rows={failedLeaders.week} loading={loading} /></div>
    </section>

    <section id="alerts" className="grid grid-cols-12 gap-3"><AlertsList className="col-span-12 xl:col-span-7" alerts={alerts} /><SectionCard className="col-span-12 xl:col-span-5" title="Lối tắt vận hành" description="Đi nhanh đến màn hình chuyên sâu" href="/realtime-dashboard" linkLabel="Mở realtime"><div className="grid grid-cols-2 gap-2">{[["Morning Dispatch", "/morning-delivery"], ["Delivery Volume", "/volume/delivery"], ["Pickup Volume", "/volume/pickup"], ["Riders", "/riders"]].map(([label, href]) => <Link key={href} href={href} className="dashboard-shortcut">{label}</Link>)}</div><div className="mt-4 border-t border-slate-100 pt-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cập nhật gần đây</p>{state.activity.slice(0, 3).map((item) => <p key={item.id} className="mt-2 line-clamp-1 text-sm text-slate-600">{item.message}</p>)}</div></SectionCard></section>
  </div>;
}

async function fetchVolumeRows(
  supabase: ReturnType<typeof createClient>,
  table: "delivery_order" | "pickup_volume",
  startDate: string,
  endDate: string,
) {
  const pageSize = 1000;
  const rows: VolumeRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select("report_date,district,area,total_orders")
      .gte("report_date", startDate)
      .lte("report_date", endDate)
      .order("report_date", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) return { data: null, error };

    const page = (data ?? []) as VolumeRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return { data: rows, error: null };
}

async function fetchRealtimeHistory(supabase: ReturnType<typeof createClient>, endDate: string) {
  const dates = dateSequence(shiftDate(endDate, -6), endDate);
  const dailyResults = await Promise.all(dates.map(async (workDate) => {
    const latest = await supabase
      .from("realtime_delivery_riders")
      .select("snapshot_id")
      .eq("work_date", workDate)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest.error || !latest.data?.snapshot_id) return { data: [] as RealtimeRow[], error: latest.error };

    const rows = await supabase
      .from("realtime_delivery_riders")
      .select("work_date,driver_id,total_assigned,delivered,delivering,failed,idle_delivery_seconds,snapshot_id,snapshot_at")
      .eq("work_date", workDate)
      .eq("snapshot_id", latest.data.snapshot_id)
      .limit(1000);

    return { data: (rows.data ?? []) as RealtimeRow[], error: rows.error };
  }));

  const error = dailyResults.find((result) => result.error)?.error ?? null;
  return { data: dailyResults.flatMap((result) => result.data), error };
}

export const KpiCard = memo(function KpiCard({ href, icon: Icon, label, value, context, tone, loading, className }: { href: string; icon: typeof Activity; label: string; value: number | string; context: string; tone: "blue" | "green" | "red" | "slate"; loading: boolean; className?: string }) { return <Link href={href} className={cn("dashboard-kpi-card", `is-${tone}`, className)}><div className="dashboard-kpi-heading"><p>{label}</p><Icon size={17} /></div><p className="dashboard-kpi-value">{loading ? "—" : typeof value === "number" ? value.toLocaleString("vi-VN") : value}</p><p className="dashboard-kpi-context">{context}</p></Link>; });

function DashboardSectionHeading({ id, index, title, description }: { id: string; index: string; title: string; description: string }) {
  return <div className="dashboard-section-heading"><span>{index}</span><div><h2 id={id}>{title}</h2><p>{description}</p></div></div>;
}

function DistrictDonutCard({ title, icon: Icon, data, loading }: { title: string; icon: typeof Truck; data: ReturnType<typeof buildDistrictAverages>; loading: boolean }) {
  const total = data.rows.reduce((sum, item) => sum + item.average, 0);
  const circumference = 263.89;
  let offset = 0;

  return <article className="dashboard-donut-card">
    <div className="dashboard-card-title"><span><Icon size={17} /></span><div><h3>{title}</h3><p>{data.monthLabel} · {data.dayCount} ngày có dữ liệu</p></div></div>
    <div className={cn("dashboard-donut-layout", loading && "is-loading")}>
      <div className="dashboard-donut-figure">
        <svg viewBox="0 0 120 120" role="img" aria-label={`${title}: ${Math.round(total)} đơn trung bình mỗi ngày`}>
          <circle cx="60" cy="60" r="42" className="dashboard-donut-track" />
          {total > 0 ? data.rows.map((item, index) => {
            const length = item.average / total * circumference;
            const currentOffset = offset;
            offset += length;
            return <circle key={item.district} cx="60" cy="60" r="42" className="dashboard-donut-segment" style={{ stroke: `var(--color-chart-${index % 7 + 1})`, strokeDasharray: `${length} ${circumference - length}`, strokeDashoffset: -currentOffset }} />;
          }) : null}
        </svg>
        <div><strong>{loading ? "—" : Math.round(total).toLocaleString("vi-VN")}</strong><span>avg/day</span></div>
      </div>
      <div className="dashboard-donut-legend">{data.rows.map((item, index) => <div key={item.district}><span className="dashboard-legend-dot" style={{ background: `var(--color-chart-${index % 7 + 1})` }} /><p>{item.shortName}</p><strong>{loading ? "—" : Math.round(item.average).toLocaleString("vi-VN")}</strong></div>)}</div>
    </div>
  </article>;
}

function FailedLeaderboard({ title, subtitle, rows, loading }: { title: string; subtitle: string; rows: FailedLeader[]; loading: boolean }) {
  return <article className="dashboard-hold-card">
    <div className="dashboard-card-title"><span><PackageX size={17} /></span><div><h3>{title}</h3><p>{subtitle}</p></div></div>
    <div className="dashboard-hold-list">
      {loading ? Array.from({ length: 5 }, (_, index) => <div key={index} className="dashboard-hold-row is-loading" />) : rows.map((row, index) => <Link href="/realtime-dashboard" key={row.riderCode} className="dashboard-hold-row"><span className="dashboard-hold-rank">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0"><strong>{row.riderName}</strong><p><MapPin size={11} />{row.riderCode} · {row.district}</p></div><div className="dashboard-hold-value"><strong>{row.failed.toLocaleString("vi-VN")} Failed</strong><span>{row.assigned.toLocaleString("vi-VN")} assigned</span></div></Link>)}
      {!loading && rows.length === 0 ? <Empty text="Không có đơn Failed trong snapshot." /> : null}
    </div>
  </article>;
}

export function TrendChart({ points, loading, className }: { points: ReturnType<typeof buildVolumeTrend>; loading: boolean; className?: string }) { const max = Math.max(1, ...points.flatMap((point) => [point.delivery, point.pickup])); const delivery = points.map((point, index) => `${points.length > 1 ? index / (points.length - 1) * 100 : 0},${92 - point.delivery / max * 78}`).join(" "); const pickup = points.map((point, index) => `${points.length > 1 ? index / (points.length - 1) * 100 : 0},${92 - point.pickup / max * 78}`).join(" "); const firstDate = points[0]?.date; const lastDate = points[points.length - 1]?.date; return <article className={cn("min-h-72 rounded-xl border border-slate-200 bg-white p-4", className)}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-950">Volume theo ngày</h3><p className="mt-1 text-sm text-slate-500">Tổng đơn từ dữ liệu volume đã import.</p></div><div className="flex gap-3 text-xs text-slate-600"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-600" />Delivery</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-violet-500" />Pickup</span></div></div><div className={cn("mt-6 h-44", loading && "animate-pulse rounded bg-slate-50")}><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Xu hướng volume delivery và pickup"><line x1="0" y1="92" x2="100" y2="92" stroke="var(--color-rule)" /><polyline points={delivery} fill="none" stroke="var(--color-chart-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" /><polyline points={pickup} fill="none" stroke="var(--color-chart-7)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></div><div className="flex justify-between text-xs text-slate-400"><span>{firstDate ? formatDate(firstDate) : ""}</span><span>{lastDate ? formatDate(lastDate) : ""}</span></div></article>; }

export function WeeklyVolumeTrendWithDailyBars({ data, defaultWeeksRange = 4, loading, className }: { data: DailyVolumeRecord[]; defaultWeeksRange?: number; loading: boolean; className?: string }) {
  const [weeksRange, setWeeksRange] = useState(defaultWeeksRange);
  const [showBars, setShowBars] = useState(true);
  const [showLine, setShowLine] = useState(true);
  const [hovered, setHovered] = useState<{ kind: "day" | "week"; x: number; title: string; value: number; detail: string } | null>(null);
  const chart = useMemo(() => aggregateDailyWeeks(data, weeksRange), [data, weeksRange]);
  const width = 1000;
  const plotLeft = 42;
  const plotRight = 984;
  const plotTop = 20;
  const plotBottom = 238;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const dayStep = plotWidth / Math.max(1, chart.days.length);
  const barWidth = Math.max(3, dayStep * 0.62);
  const dailyMax = Math.max(1, ...chart.days.map((day) => day.total));
  const weeklyMax = Math.max(1, ...chart.weeks.map((week) => week.total));
  const weeklyLine = chart.weeks.map((week, index) => `${plotLeft + (index * 7 + 3.5) * dayStep},${plotBottom - week.total / weeklyMax * plotHeight}`).join(" ");

  return <article className={cn("min-h-[430px] rounded-xl border border-slate-200 bg-white p-4", className)}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold text-slate-950">Weekly Volume Trend (with Daily Breakdown)</h3><p className="mt-1 text-sm text-slate-500">Mỗi cột là một ngày; đường biểu diễn tổng volume của tuần.</p></div><div className="inline-flex self-start rounded-lg bg-slate-100 p-1"><button type="button" aria-pressed={weeksRange === 4} onClick={() => setWeeksRange(4)} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600", weeksRange === 4 && "bg-white text-blue-700 shadow-sm")}>4 tuần</button><button type="button" aria-pressed={weeksRange === 8} onClick={() => setWeeksRange(8)} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600", weeksRange === 8 && "bg-white text-blue-700 shadow-sm")}>8 tuần</button></div></div>
    <div className="mt-4 flex flex-wrap items-center gap-2"><button type="button" aria-pressed={showBars} onClick={() => setShowBars((value) => !value)} className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", showBars ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-400")}><span className="size-2 rounded-sm bg-blue-500" />Daily volume</button><button type="button" aria-pressed={showLine} onClick={() => setShowLine((value) => !value)} className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", showLine ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400")}><span className="h-0.5 w-3 bg-current" />Weekly total</button><span className="ml-auto text-[11px] text-slate-400">Cột: trục trái · Đường: trục phải</span></div>
    <div className={cn("relative mt-4 overflow-hidden", loading && "animate-pulse rounded bg-slate-50")} onMouseLeave={() => setHovered(null)}>
      <svg viewBox={`0 0 ${width} 300`} className="h-[300px] w-full" role="img" aria-label="Biểu đồ volume ngày và tổng tuần">
        {[0, 0.5, 1].map((ratio) => <g key={ratio}><line x1={plotLeft} y1={plotBottom - ratio * plotHeight} x2={plotRight} y2={plotBottom - ratio * plotHeight} stroke="var(--color-rule)" strokeDasharray={ratio === 0 ? undefined : "3 4"} /><text x={plotLeft - 6} y={plotBottom - ratio * plotHeight + 4} textAnchor="end" fontSize="10" fill="var(--color-muted)">{compactVolume(Math.round(dailyMax * ratio))}</text><text x={plotRight + 6} y={plotBottom - ratio * plotHeight + 4} fontSize="10" fill="var(--color-muted)">{compactVolume(Math.round(weeklyMax * ratio))}</text></g>)}
        {chart.weeks.map((week, index) => { const x = plotLeft + index * 7 * dayStep; const highlighted = week.isCurrent || week.isPeak; return <g key={week.key}><rect x={x} y={plotTop} width={dayStep * 7} height={plotHeight} fill={highlighted ? "var(--color-accent-soft)" : index % 2 ? "var(--color-paper-2)" : "transparent"} opacity={highlighted ? 0.9 : 0.65} />{index > 0 ? <line x1={x} y1={plotTop} x2={x} y2={plotBottom + 28} stroke="var(--color-rule-strong)" strokeDasharray="3 4" /> : null}<text x={x + dayStep * 3.5} y={plotBottom + 38} textAnchor="middle" fontSize="11" fontWeight="600" fill={highlighted ? "var(--color-accent)" : "var(--color-muted)"}>{week.label}</text>{week.change !== null ? <text x={x + dayStep * 3.5} y={plotTop + 12} textAnchor="middle" fontSize="9" fontWeight="600" fill={week.change >= 0 ? "var(--color-success)" : "var(--color-error)"}>{week.change >= 0 ? "+" : ""}{week.change.toFixed(0)}%</text> : null}</g>; })}
        {showBars ? chart.days.map((day, index) => { const x = plotLeft + index * dayStep + (dayStep - barWidth) / 2; const deliveryHeight = day.delivery / dailyMax * plotHeight; const pickupHeight = day.pickup / dailyMax * plotHeight; return <g key={day.date} tabIndex={0} role="img" aria-label={`${formatFullDate(day.date)}: ${day.total} đơn`} onFocus={() => setHovered({ kind: "day", x: (x + barWidth / 2) / width * 100, title: formatFullDate(day.date), value: day.total, detail: `${day.weekLabel} · Delivery ${day.delivery.toLocaleString("vi-VN")} · Pickup ${day.pickup.toLocaleString("vi-VN")}` })} onBlur={() => setHovered(null)} onMouseEnter={() => setHovered({ kind: "day", x: (x + barWidth / 2) / width * 100, title: formatFullDate(day.date), value: day.total, detail: `${day.weekLabel} · Delivery ${day.delivery.toLocaleString("vi-VN")} · Pickup ${day.pickup.toLocaleString("vi-VN")}` })}><rect x={x} y={plotBottom - deliveryHeight} width={barWidth} height={deliveryHeight} rx="2" fill="var(--color-chart-1)" /><rect x={x} y={plotBottom - deliveryHeight - pickupHeight} width={barWidth} height={pickupHeight} rx="2" fill="var(--color-chart-7)" /><rect x={x - dayStep * 0.18} y={plotTop} width={dayStep * 1.36} height={plotHeight} fill="transparent" /></g>; }) : null}
        {showLine && chart.weeks.length ? <><polyline points={weeklyLine} fill="none" stroke="var(--color-ink)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />{chart.weeks.map((week, index) => { const x = plotLeft + (index * 7 + 3.5) * dayStep; const y = plotBottom - week.total / weeklyMax * plotHeight; return <circle key={week.key} cx={x} cy={y} r={week.isPeak ? 5 : 4} fill="var(--color-paper)" stroke="var(--color-ink)" strokeWidth="2.5" tabIndex={0} role="img" aria-label={`${week.label}: ${week.total} đơn`} onFocus={() => setHovered({ kind: "week", x: x / width * 100, title: week.label, value: week.total, detail: week.change === null ? "Tuần đầu trong phạm vi" : `${week.change >= 0 ? "+" : ""}${week.change.toFixed(1)}% so với tuần trước` })} onBlur={() => setHovered(null)} onMouseEnter={() => setHovered({ kind: "week", x: x / width * 100, title: week.label, value: week.total, detail: week.change === null ? "Tuần đầu trong phạm vi" : `${week.change >= 0 ? "+" : ""}${week.change.toFixed(1)}% so với tuần trước` })} />})}</> : null}
        {chart.days.map((day, index) => index % (weeksRange === 8 ? 7 : 3) === 0 ? <text key={`label-${day.date}`} x={plotLeft + (index + 0.5) * dayStep} y={plotBottom + 16} textAnchor="middle" fontSize="9" fill="var(--color-muted)">{day.date.slice(8, 10)}</text> : null)}
      </svg>
      {hovered ? <div className="pointer-events-none absolute top-3 z-10 w-52 -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-3 shadow-lg" style={{ left: `${Math.min(88, Math.max(12, hovered.x))}%` }}><p className="text-xs font-semibold text-slate-500">{hovered.kind === "day" ? "Daily volume" : "Weekly total"}</p><p className="mt-1 text-sm font-bold text-slate-950">{hovered.title} · {hovered.value.toLocaleString("vi-VN")}</p><p className="mt-1 text-xs leading-5 text-slate-500">{hovered.detail}</p></div> : null}
    </div>
  </article>;
}

function VolumeAnalyticsChart({ analytics, grouping, loading, className }: { analytics: ReturnType<typeof buildVolumeAnalytics>; grouping: VolumeGrouping; loading: boolean; className?: string }) { const points = analytics.points; const max = Math.max(1, ...points.flatMap((point) => [point.delivery, point.pickup])); const delivery = points.map((point, index) => `${points.length > 1 ? index / (points.length - 1) * 100 : 0},${92 - point.delivery / max * 78}`).join(" "); const pickup = points.map((point, index) => `${points.length > 1 ? index / (points.length - 1) * 100 : 0},${92 - point.pickup / max * 78}`).join(" "); return <article className={cn("min-h-80 rounded-xl border border-slate-200 bg-white p-4", className)}><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-950">Xu hướng theo {grouping === "week" ? "tuần" : "tháng"}</h3><p className="mt-1 text-sm text-slate-500">Tổng volume và cơ cấu theo nguồn đơn.</p></div><div className="flex gap-3 text-xs text-slate-600"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-blue-600" />Delivery</span><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-violet-500" />Pickup</span></div></div><div className={cn("mt-6 h-52", loading && "animate-pulse rounded bg-slate-50")}><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Xu hướng volume theo thời gian"><line x1="0" y1="92" x2="100" y2="92" stroke="var(--color-rule)" /><line x1="0" y1="52" x2="100" y2="52" stroke="var(--color-rule)" strokeDasharray="2 2" /><polyline points={delivery} fill="none" stroke="var(--color-chart-1)" strokeWidth="2" vectorEffect="non-scaling-stroke" /><polyline points={pickup} fill="none" stroke="var(--color-chart-7)" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></div><div className="mt-2 flex justify-between text-xs text-slate-400"><span>{points[0]?.label ?? ""}</span><span>{points[points.length - 1]?.label ?? ""}</span></div></article>; }

function VolumeComparisonCard({ analytics }: { analytics: ReturnType<typeof buildVolumeAnalytics> }) { const positive = analytics.change >= 0; return <article className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm font-medium text-slate-600">So với kỳ trước</p><div className="mt-3 flex items-end justify-between gap-3"><p className={cn("text-2xl font-bold tabular-nums", positive ? "text-emerald-700" : "text-red-700")}>{positive ? "+" : ""}{analytics.change.toFixed(1)}%</p><span className={cn("rounded-full px-2 py-1 text-xs font-semibold", positive ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>{positive ? "Tăng" : "Giảm"}</span></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3"><div><p className="text-xs text-slate-500">Kỳ hiện tại</p><p className="mt-1 font-bold tabular-nums text-slate-900">{analytics.current.toLocaleString("vi-VN")}</p></div><div><p className="text-xs text-slate-500">Kỳ trước</p><p className="mt-1 font-bold tabular-nums text-slate-900">{analytics.previous.toLocaleString("vi-VN")}</p></div></div></article>; }

function ProgressChart({ delivered, delivering, failed, className }: { delivered: number; delivering: number; failed: number; className?: string }) { const values = [{ label: "Delivered", value: delivered, color: "bg-emerald-500" }, { label: "Delivering", value: delivering, color: "bg-blue-600" }, { label: "Failed", value: failed, color: "bg-red-500" }]; const max = Math.max(1, ...values.map((item) => item.value)); return <article className={cn("min-h-72 rounded-xl border border-slate-200 bg-white p-4", className)}><h3 className="font-semibold text-slate-950">Delivery status</h3><p className="mt-1 text-sm text-slate-500">Latest daily snapshot · KV5 + KV6.</p><div className="mt-7 space-y-5">{values.map((item) => <div key={item.label}><div className="mb-1.5 flex justify-between text-sm"><span className="text-slate-600">{item.label}</span><strong className="tabular-nums text-slate-900">{item.value.toLocaleString("vi-VN")}</strong></div><div className="h-2.5 rounded-full bg-slate-100"><div className={cn("h-full rounded-full", item.color)} style={{ width: `${item.value / max * 100}%` }} /></div></div>)}</div></article>; }

export function SectionCard({ title, description, href, linkLabel, children, className }: { title: string; description: string; href: string; linkLabel: string; children: React.ReactNode; className?: string }) { return <article className={cn("rounded-xl border border-slate-200 bg-white p-4", className)}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-950">{title}</h3><p className="mt-1 text-sm text-slate-500">{description}</p></div><Link href={href} className="flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800">{linkLabel}<ChevronRight size={14} /></Link></div><div className="mt-5">{children}</div></article>; }

export function AlertsList({ alerts, className }: { alerts: ReturnType<typeof buildAlerts>; className?: string }) { return <article className={cn("rounded-xl border border-slate-200 bg-white p-4", className)}><div className="flex items-center gap-2"><CircleAlert size={18} className="text-red-600" /><h3 className="font-semibold text-slate-950">Rủi ro cần chú ý</h3></div><p className="mt-1 text-sm text-slate-500">Các tín hiệu cần được kiểm tra trong ca vận hành.</p><div className="mt-4 divide-y divide-slate-100">{alerts.map((alert) => <Link key={alert.title} href={alert.href} className="flex items-center gap-3 py-3 hover:bg-slate-50"><span className={cn("rounded-full px-2 py-1 text-[10px] font-bold uppercase", alert.severity === "critical" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>{alert.severity === "critical" ? "Cao" : "Vừa"}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800">{alert.title}</p><p className="truncate text-xs text-slate-500">{alert.description}</p></div><ChevronRight size={15} className="text-slate-400" /></Link>)}{alerts.length === 0 ? <Empty text="Không có cảnh báo nổi bật trong phạm vi này." /> : null}</div></article>; }

function Empty({ text }: { text: string }) { return <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">{text}</p>; }

function buildSummary(state: DashboardState, range: { start: string; end: string }) {
  const riderByCode = new Map(state.riders.map((rider) => [normalizeRiderCode(rider.rider_code), rider]));
  const kv56Realtime = state.realtime.filter((row) => row.work_date.slice(0, 10) === range.end && isKv56(riderByCode.get(normalizeRiderCode(row.driver_id))?.kv));
  const realtime = kv56Realtime.reduce((sum, row) => ({ assigned: sum.assigned + row.total_assigned, delivered: sum.delivered + row.delivered, delivering: sum.delivering + row.delivering, failed: sum.failed + row.failed }), { assigned: 0, delivered: 0, delivering: 0, failed: 0 });
  const volumeTotal = (rows: VolumeRow[]) => rows.filter((row) => { const date = row.report_date?.slice(0, 10); return date && date >= range.start && date <= range.end; }).reduce((sum, row) => sum + (row.total_orders ?? 1), 0);
  const deliveryVolume = volumeTotal(state.delivery);
  const pickupVolume = volumeTotal(state.pickup);
  return { ...realtime, deliveryRate: realtime.assigned ? Math.round(realtime.delivered / realtime.assigned * 100) : 0, idleRiders: kv56Realtime.filter((row) => row.delivering > 0 && row.idle_delivery_seconds > 3600).length, deliveryVolume, pickupVolume, totalVolume: deliveryVolume + pickupVolume };
}
// Retained as the daily trend shape consumed by the exported compact chart component.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildVolumeTrend(delivery: VolumeRow[], pickup: VolumeRow[], range: { start: string; end: string }) { const dates = dateSequence(range.start, range.end); const sumByDate = (rows: VolumeRow[]) => { const map = new Map<string, number>(); for (const row of rows) { const date = row.report_date?.slice(0, 10); if (date) map.set(date, (map.get(date) ?? 0) + (row.total_orders ?? 1)); } return map; }; const deliveryMap = sumByDate(delivery); const pickupMap = sumByDate(pickup); return dates.map((date) => ({ date, delivery: deliveryMap.get(date) ?? 0, pickup: pickupMap.get(date) ?? 0 })); }
function buildVolumeAnalytics(delivery: VolumeRow[], pickup: VolumeRow[], mode: VolumeMode, grouping: VolumeGrouping) { const groups = new Map<string, { delivery: number; pickup: number }>(); const addRows = (rows: VolumeRow[], source: "delivery" | "pickup") => { if (mode !== "all" && mode !== source) return; for (const row of rows) { const date = row.report_date?.slice(0, 10); if (!date) continue; const key = grouping === "month" ? date.slice(0, 7) : isoWeekKey(date); const item = groups.get(key) ?? { delivery: 0, pickup: 0 }; item[source] += row.total_orders ?? 1; groups.set(key, item); } }; addRows(delivery, "delivery"); addRows(pickup, "pickup"); const points = Array.from(groups, ([key, values]) => ({ key, label: grouping === "month" ? `T${Number(key.slice(5))}/${key.slice(0, 4)}` : key, ...values, total: values.delivery + values.pickup })).sort((a, b) => a.key.localeCompare(b.key)); const current = points[points.length - 1]?.total ?? 0; const previous = points[points.length - 2]?.total ?? 0; return { points, current, previous, change: previous ? (current - previous) / previous * 100 : 0 }; }
function buildDailyVolumeRecords(delivery: VolumeRow[], pickup: VolumeRow[], mode: VolumeMode): DailyVolumeRecord[] { const records: DailyVolumeRecord[] = []; const add = (rows: VolumeRow[], type: "delivery" | "pickup") => { if (mode !== "all" && mode !== type) return; for (const row of rows) { const date = row.report_date?.slice(0, 10); if (date) records.push({ date, volume: row.total_orders ?? 1, type }); } }; add(delivery, "delivery"); add(pickup, "pickup"); return records; }
function aggregateDailyWeeks(data: DailyVolumeRecord[], weeksRange: number) { const dailyMap = new Map<string, { delivery: number; pickup: number }>(); for (const record of data) { const item = dailyMap.get(record.date) ?? { delivery: 0, pickup: 0 }; item[record.type] += record.volume; dailyMap.set(record.date, item); } const latestDataDate = [...dailyMap.keys()].sort().at(-1) ?? todayInVietnamDate(); const latestMonday = startOfIsoWeek(latestDataDate); const start = shiftDate(latestMonday, -(weeksRange - 1) * 7); const days = Array.from({ length: weeksRange * 7 }, (_, index) => { const date = shiftDate(start, index); const values = dailyMap.get(date) ?? { delivery: 0, pickup: 0 }; return { date, ...values, total: values.delivery + values.pickup, weekKey: isoWeekKey(date), weekLabel: isoWeekKey(date).replace(/^\d{4}-/, "") }; }); const todayWeek = isoWeekKey(todayInVietnamDate()); const rawWeeks = Array.from({ length: weeksRange }, (_, index) => { const weekDays = days.slice(index * 7, index * 7 + 7); const total = weekDays.reduce((sum, day) => sum + day.total, 0); return { key: weekDays[0]?.weekKey ?? "", label: weekDays[0]?.weekLabel ?? "", total, isCurrent: weekDays[0]?.weekKey === todayWeek, isPeak: false, change: null as number | null }; }); const peak = Math.max(...rawWeeks.map((week) => week.total)); const weeks = rawWeeks.map((week, index) => ({ ...week, isPeak: week.total > 0 && week.total === peak, change: index > 0 && rawWeeks[index - 1]!.total > 0 ? (week.total - rawWeeks[index - 1]!.total) / rawWeeks[index - 1]!.total * 100 : null })); return { days, weeks }; }
function buildDistrictAverages(rows: VolumeRow[], endDate: string) {
  const monthStart = `${endDate.slice(0, 7)}-01`;
  const dataDates = new Set<string>();
  const totals = new Map<string, { shortName: string; area: string; total: number }>();
  for (const row of rows) {
    const date = row.report_date?.slice(0, 10);
    const district = volumeDistrictInfo(row);
    if (!date || date < monthStart || date > endDate || !district) continue;
    dataDates.add(date);
    const current = totals.get(district.name) ?? { shortName: district.shortName, area: district.area, total: 0 };
    current.total += row.total_orders ?? 1;
    totals.set(district.name, current);
  }
  const dayCount = dataDates.size;
  const rowsByDistrict = Array.from(totals, ([district, value]) => ({ district, shortName: value.shortName, area: value.area, average: dayCount ? value.total / dayCount : 0 })).sort((a, b) => a.area.localeCompare(b.area) || b.average - a.average || a.district.localeCompare(b.district, "vi"));
  return { rows: rowsByDistrict, dayCount, monthLabel: `Tháng ${endDate.slice(5, 7)}/${endDate.slice(0, 4)}` };
}

function buildFailedLeaders(state: DashboardState, endDate: string) {
  const riderByCode = new Map(state.riders.map((rider) => [normalizeRiderCode(rider.rider_code), rider]));
  const startDate = shiftDate(endDate, -6);
  const eligible = state.realtime.filter((row) => {
    const rider = riderByCode.get(normalizeRiderCode(row.driver_id));
    const date = row.work_date.slice(0, 10);
    return isKv56(rider?.kv) && date >= startDate && date <= endDate && row.failed > 0;
  });
  const rank = (rows: RealtimeRow[]) => {
    const totals = new Map<string, { failed: number; assigned: number }>();
    for (const row of rows) {
      const key = normalizeRiderCode(row.driver_id);
      const current = totals.get(key) ?? { failed: 0, assigned: 0 };
      current.failed += row.failed;
      current.assigned += row.total_assigned;
      totals.set(key, current);
    }
    return Array.from(totals, ([riderCode, value]) => {
      const rider = riderByCode.get(riderCode);
      return { riderCode, riderName: rider?.full_name ?? riderCode, district: rider?.delivery_district ?? "Chưa xác định", ...value };
    }).sort((a, b) => b.failed - a.failed || b.assigned - a.assigned).slice(0, 5);
  };
  return { day: rank(eligible.filter((row) => row.work_date.slice(0, 10) === endDate)), week: rank(eligible) };
}

function buildAlerts(_state: DashboardState, summary: ReturnType<typeof buildSummary>) { const alerts: Array<{ title: string; description: string; severity: "critical" | "warning"; href: string }> = []; if (summary.failed > 0) alerts.push({ title: `${summary.failed} Failed deliveries`, description: "Kiểm tra rider và quận trong snapshot KV5/KV6 mới nhất.", severity: "critical", href: "/realtime-dashboard" }); if (summary.idleRiders > 0) alerts.push({ title: `${summary.idleRiders} riders idle trên 1 giờ`, description: "Rider vẫn còn đơn Delivering nhưng không có tiến triển.", severity: "critical", href: "/realtime-dashboard" }); return alerts; }
function normalizeRiderCode(value: string) { return value.trim().toUpperCase(); }
function isKv56(value: string | null | undefined) { return /^(?:(?:kv|khu).*?)?[56]$/i.test(normalizeText(value ?? "").replace(/\s+/g, " ")); }
function normalizeText(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(); }
function resolveKvDistrict(value: string | null | undefined) { const key = compactZoneName(value ?? ""); if (!key) return null; return MAP_DISTRICTS.find((district) => [district.name, district.shortName, district.code, ...district.aliases].some((candidate) => compactZoneName(candidate) === key)) ?? null; }
function volumeDistrictInfo(row: VolumeRow) { const mapped = resolveKvDistrict(row.district); if (mapped) return { name: mapped.name, shortName: mapped.shortName, area: mapped.area }; const key = compactZoneName(row.district ?? ""); if (["thanhphothuduc", "thuduc", "tpthuduc"].includes(key)) return { name: "Thành phố Thủ Đức", shortName: "TP Thủ Đức", area: "KV5" }; const name = row.district?.trim(); return name && isKv56(row.area) ? { name, shortName: name.replace(/^Thành phố\s+/i, "TP ").replace(/^Quận\s+/i, "Q. ").replace(/^Huyện\s+/i, "H. "), area: normalizeText(row.area ?? "").endsWith("6") ? "KV6" : "KV5" } : null; }
function isKv56VolumeRow(row: VolumeRow) { return isKv56(row.area) || Boolean(resolveKvDistrict(row.district)); }
function volumeShare(value: number, total: number) { return total ? `${Math.round(value / total * 100)}%` : "0%"; }
function getDateRange(range: RangeKey) { const today = new Date(); if (range === "yesterday") { const date = format(subDays(today, 1), "yyyy-MM-dd"); return { start: date, end: date }; } if (range === "7d") return { start: format(subDays(today, 6), "yyyy-MM-dd"), end: format(today, "yyyy-MM-dd") }; const date = format(today, "yyyy-MM-dd"); return { start: date, end: date }; }
function dateSequence(start: string, end: string) { const dates: string[] = []; const current = new Date(`${start}T00:00:00Z`); const last = new Date(`${end}T00:00:00Z`); while (current <= last) { dates.push(current.toISOString().slice(0, 10)); current.setUTCDate(current.getUTCDate() + 1); } return dates; }
function rangeLabel(range: RangeKey) { return range === "today" ? "Hôm nay" : range === "yesterday" ? "Hôm qua" : "7 ngày gần nhất"; }
function formatDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" }).format(new Date(`${value}T00:00:00`)); }
function formatFullDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00`)); }
function compactVolume(value: number) { return new Intl.NumberFormat("vi-VN", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function monthStartOffset(value: string, months: number) { const date = new Date(`${value.slice(0, 7)}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + months); return date.toISOString().slice(0, 10); }
function isoWeekKey(value: string) { const date = new Date(`${value}T00:00:00Z`); const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() + 4 - day); const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1)); const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7); return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`; }
function startOfIsoWeek(value: string) { const date = new Date(`${value}T00:00:00Z`); const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - day + 1); return date.toISOString().slice(0, 10); }
function shiftDate(value: string, days: number) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function todayInVietnamDate() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
