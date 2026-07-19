"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bike, CalendarDays, CheckCircle2, MapPin, PackageCheck, RefreshCcw, Truck } from "lucide-react";
import type { DriverPerformanceDaily, Rider } from "@/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/utils/cn";

type RiderProfile = Pick<Rider, "id" | "rider_code" | "full_name" | "avatar_url" | "kv" | "cot" | "status" | "pickup_district" | "pickup_ward" | "delivery_district" | "delivery_ward">;
type PerformanceResponse = { success: boolean; rider?: RiderProfile; days?: number; performance?: DriverPerformanceDaily[]; error?: string };
type DailyProduction = {
  date: string;
  deliveryAssigned: number;
  deliveryDelivered: number;
  pickupAssigned: number;
  pickupPicked: number;
  contractTypes: string[];
};

const rangeOptions = [30, 45, 60, 90, 180];

export function RiderPerformanceView({ riderId }: { riderId: string }) {
  const [days, setDays] = useState(45);
  const [rider, setRider] = useState<RiderProfile | null>(null);
  const [performance, setPerformance] = useState<DriverPerformanceDaily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/riders/${riderId}/performance?days=${days}`, { cache: "no-store", signal });
      const result = (await response.json()) as PerformanceResponse;
      if (!response.ok || !result.success || !result.rider) throw new Error(result.error ?? "Không thể tải Rider Performance");
      setRider(result.rider);
      setPerformance(result.performance ?? []);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Không thể tải Rider Performance");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [days, riderId]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => load(controller.signal));
    return () => controller.abort();
  }, [load, refreshKey]);

  const daily = useMemo(() => aggregateDailyProduction(performance), [performance]);
  const summary = useMemo(() => buildSummary(daily), [daily]);
  const chartRows = useMemo(() => daily.slice(0, 30).reverse(), [daily]);

  return <div className="rider-performance-page">
    <header className="rider-performance-command">
      <div className="rider-performance-command-copy">
        <Link href="/riders" className="rider-performance-back"><ArrowLeft size={15} aria-hidden="true" />Riders</Link>
        <p>Daily production dossier</p>
        <h1>Rider Performance</h1>
        <span>Sản lượng Delivery và Pickup theo từng ngày chạy.</span>
      </div>
      <div className="rider-performance-controls">
        <label><span>Khoảng dữ liệu</span><Select value={String(days)} onChange={(event) => setDays(Number(event.target.value))}>{rangeOptions.map((value) => <option key={value} value={value}>{value} ngày</option>)}</Select></label>
        <Button type="button" variant="secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}><RefreshCcw size={16} />Tải lại</Button>
      </div>
    </header>

    {error ? <div role="alert" className="rider-performance-error"><strong>Không tải được dữ liệu</strong><span>{error}</span></div> : null}

    <section className={cn("rider-performance-profile", loading && "is-loading")} aria-label="Hồ sơ rider">
      <div className="rider-performance-avatar">{rider?.avatar_url ? <img src={rider.avatar_url} alt={`Ảnh ${rider.full_name ?? rider.rider_code}`} /> : <Bike size={25} aria-hidden="true" />}</div>{/* eslint-disable-line @next/next/no-img-element */}
      <div className="rider-performance-identity"><span>{rider?.rider_code ?? "Đang tải"}</span><h2>{rider?.full_name ?? "Rider Performance"}</h2><p>{[rider?.kv, rider?.cot, rider?.status].filter(Boolean).join(" · ") || "—"}</p></div>
      <div className="rider-performance-route"><div><MapPin size={14} aria-hidden="true" /><span>Pickup</span><strong>{joinLocation(rider?.pickup_district, rider?.pickup_ward)}</strong></div><div><MapPin size={14} aria-hidden="true" /><span>Delivery</span><strong>{joinLocation(rider?.delivery_district, rider?.delivery_ward)}</strong></div></div>
    </section>

    <section className="rider-performance-kpis" aria-label="Tổng hợp sản lượng">
      <PerformanceKpi icon={CalendarDays} label="Active days" value={summary.activeDays} context={`${daily.length} ngày có bản ghi`} loading={loading} />
      <PerformanceKpi icon={Truck} label="Delivery" value={summary.deliveryDelivered} context={`${formatNumber(summary.deliveryAssigned)} assigned · ${formatRate(summary.deliveryRate)}`} loading={loading} />
      <PerformanceKpi icon={PackageCheck} label="Pickup" value={summary.pickupPicked} context={`${formatNumber(summary.pickupAssigned)} assigned · ${formatRate(summary.pickupRate)}`} loading={loading} />
      <PerformanceKpi icon={CheckCircle2} label="Average output" value={summary.averageOutput} context="completed / active day" loading={loading} />
    </section>

    <section className="rider-performance-ledger">
      <div className="rider-performance-section-head"><div><span>01</span><h2>30 ngày gần nhất</h2><p>Cột xanh là Delivery hoàn tất; cột lục là Pickup hoàn tất.</p></div><strong>{formatNumber(summary.deliveryDelivered + summary.pickupPicked)} completed</strong></div>
      <DailyProductionChart rows={chartRows} loading={loading} />
    </section>

    <section className="rider-performance-ledger">
      <div className="rider-performance-section-head"><div><span>02</span><h2>Nhật ký sản lượng từng ngày</h2><p>Mỗi ngày chỉ có một dòng tổng hợp, kể cả khi nguồn có nhiều bản ghi.</p></div><strong>{daily.length} records</strong></div>
      <DailyProductionTable rows={daily} loading={loading} />
    </section>
  </div>;
}

function PerformanceKpi({ icon: Icon, label, value, context, loading }: { icon: typeof Bike; label: string; value: number; context: string; loading: boolean }) {
  return <article className={cn("rider-performance-kpi", loading && "is-loading")}><div><span>{label}</span><Icon size={17} aria-hidden="true" /></div><strong>{loading ? "—" : formatNumber(value)}</strong><p>{context}</p></article>;
}

function DailyProductionChart({ rows, loading }: { rows: DailyProduction[]; loading: boolean }) {
  const max = Math.max(1, ...rows.flatMap((row) => [row.deliveryDelivered, row.pickupPicked]));
  if (loading) return <div className="rider-performance-chart is-loading" />;
  if (rows.length === 0) return <EmptyPerformance />;
  return <div className="rider-performance-chart" role="img" aria-label="Biểu đồ sản lượng Delivery và Pickup theo ngày"><div className="rider-performance-chart-grid" aria-hidden="true">{rows.map((row, index) => <div key={row.date} className="rider-performance-day-column" title={`${formatDate(row.date)}: Delivery ${row.deliveryDelivered}, Pickup ${row.pickupPicked}`}><div><span className="is-delivery" style={{ height: `${barHeight(row.deliveryDelivered, max)}%` }} /><span className="is-pickup" style={{ height: `${barHeight(row.pickupPicked, max)}%` }} /></div><small>{index % 3 === 0 || index === rows.length - 1 ? row.date.slice(8, 10) : ""}</small></div>)}</div></div>;
}

function DailyProductionTable({ rows, loading }: { rows: DailyProduction[]; loading: boolean }) {
  if (loading) return <div className="rider-performance-table-loading">{Array.from({ length: 7 }, (_, index) => <span key={index} />)}</div>;
  if (rows.length === 0) return <EmptyPerformance />;
  return <div className="rider-performance-table-frame"><table><thead><tr><th>Ngày</th><th>Delivery</th><th>Pickup</th><th>Tổng hoàn tất</th></tr></thead><tbody>{rows.map((row) => { const deliveryRate = row.deliveryAssigned ? row.deliveryDelivered / row.deliveryAssigned * 100 : null; const pickupRate = row.pickupAssigned ? row.pickupPicked / row.pickupAssigned * 100 : null; return <tr key={row.date}><td><strong>{formatDate(row.date)}</strong><span>{row.contractTypes.join(" · ") || "Không có loại hợp đồng"}</span></td><td><strong>{formatNumber(row.deliveryDelivered)} / {formatNumber(row.deliveryAssigned)}</strong><span>{formatRate(deliveryRate)}</span></td><td><strong>{formatNumber(row.pickupPicked)} / {formatNumber(row.pickupAssigned)}</strong><span>{formatRate(pickupRate)}</span></td><td><strong>{formatNumber(row.deliveryDelivered + row.pickupPicked)}</strong><span>completed</span></td></tr>; })}</tbody></table></div>;
}

function EmptyPerformance() { return <div className="rider-performance-empty"><CalendarDays size={22} aria-hidden="true" /><strong>Chưa có dữ liệu sản lượng</strong><span>Rider này chưa có bản ghi trong khoảng ngày đã chọn.</span></div>; }

function aggregateDailyProduction(rows: DriverPerformanceDaily[]) {
  const byDate = new Map<string, DailyProduction>();
  for (const row of rows) {
    const date = row.report_date.slice(0, 10);
    const current = byDate.get(date) ?? { date, deliveryAssigned: 0, deliveryDelivered: 0, pickupAssigned: 0, pickupPicked: 0, contractTypes: [] };
    current.deliveryAssigned += row.delivery_assigned ?? 0;
    current.deliveryDelivered += row.delivery_delivered ?? 0;
    current.pickupAssigned += row.pickup_assigned ?? 0;
    current.pickupPicked += row.pickup_picked ?? 0;
    if (row.contract_type_name && !current.contractTypes.includes(row.contract_type_name)) current.contractTypes.push(row.contract_type_name);
    byDate.set(date, current);
  }
  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}

function buildSummary(rows: DailyProduction[]) {
  const totals = rows.reduce((sum, row) => ({ deliveryAssigned: sum.deliveryAssigned + row.deliveryAssigned, deliveryDelivered: sum.deliveryDelivered + row.deliveryDelivered, pickupAssigned: sum.pickupAssigned + row.pickupAssigned, pickupPicked: sum.pickupPicked + row.pickupPicked }), { deliveryAssigned: 0, deliveryDelivered: 0, pickupAssigned: 0, pickupPicked: 0 });
  const activeDays = rows.filter((row) => row.deliveryAssigned + row.pickupAssigned > 0).length;
  return { ...totals, activeDays, averageOutput: activeDays ? Math.round((totals.deliveryDelivered + totals.pickupPicked) / activeDays) : 0, deliveryRate: totals.deliveryAssigned ? totals.deliveryDelivered / totals.deliveryAssigned * 100 : null, pickupRate: totals.pickupAssigned ? totals.pickupPicked / totals.pickupAssigned * 100 : null };
}

function joinLocation(district: string | null | undefined, ward: string | null | undefined) { return [district, ward].filter(Boolean).join(" · ") || "Chưa xác định"; }
function barHeight(value: number, max: number) { return value > 0 ? Math.max(2, value / max * 100) : 0; }
function formatNumber(value: number) { return new Intl.NumberFormat("vi-VN").format(value); }
function formatRate(value: number | null) { return value === null ? "—" : `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(value)}%`; }
function formatDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(`${value}T00:00:00+07:00`)); }
