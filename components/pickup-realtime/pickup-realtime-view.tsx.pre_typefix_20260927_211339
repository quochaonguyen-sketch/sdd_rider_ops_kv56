/* Hallmark · macrostructure: Control Ledger · theme: Cobalt adapted
 * brief: Pickup realtime control for KV5/KV6, with a 48-hour operational summary.
 * data state: live Supabase snapshots, filtered to KV5/KV6.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUp, Clock3, PackageCheck, Radio, RefreshCcw, Search, UsersRound } from "lucide-react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import styles from "./pickup-realtime-view.module.css";

type Area = "KV5" | "KV6";
type Status = "on_track" | "watch" | "urgent";
type Tab = "realtime" | "summary";

type PickupRider = {
  id: string;
  name: string;
  code: string;
  area: Area;
  route: string;
  districts: string[];
  wards: string[];
  assigned: number;
  picked: number;
  pending: number;
  waitMinutes: number | null;
  status: Status;
};

type SummaryBucket = {
  id: string;
  label: string;
  area: Area | null;
  district: string;
  ward: string;
  assigned_count: number;
  picked_count: number;
  pending_count: number;
  rider_count: number;
};

type GeographyMetric = {
  name: string;
  assigned: number;
  picked: number;
  pending: number;
};

const WARD_DISTRICTS: Record<string, string> = {
  "ANLAC": "Quận Bình Tân", "BINHPHU": "Quận Bình Tân", "TANTAO": "Quận Bình Tân", "PHULAM": "Quận Bình Tân", "BINHHUNGHOA": "Quận Bình Tân", "BINHTRIDONG": "Quận Bình Tân", "BINHTAN": "Quận Bình Tân",
  "GOVAP": "Quận Gò Vấp", "HANHTHONG": "Quận Gò Vấp", "THONGTAYHOI": "Quận Gò Vấp", "ANHOIDONG": "Quận Gò Vấp", "ANHOITAY": "Quận Gò Vấp", "TANSON": "Quận Gò Vấp", "ANNHON": "Quận Gò Vấp",
  "GIADINH": "Quận Bình Thạnh", "BINHLOITRUNG": "Quận Bình Thạnh", "BINHTHANH": "Quận Bình Thạnh", "THANHMYTAY": "Quận Bình Thạnh", "BINHQUOI": "Quận Bình Thạnh",
  "CAUKIEU": "Quận Phú Nhuận", "DUCNGHUAN": "Quận Phú Nhuận", "PHUNHUAN": "Quận Phú Nhuận",
  "SAIGON": "Quận 1", "BENTHANH": "Quận 1", "CAUONGLANH": "Quận 1", "TANDINH": "Quận 1",
  "VUONLAI": "Quận 10", "HOAHUNG": "Quận 10", "DIENHONG": "Quận 10",
  "MINHPHUNG": "Quận 11", "BINHTHOI": "Quận 11", "HOABINH": "Quận 11", "PHUTHO": "Quận 11",
  "TANTHOIHIEP": "Quận 12", "DONGHUNGTHUAN": "Quận 12", "TRUNGMYTAY": "Quận 12",
  "VINHHOI": "Quận 4", "KHANHHOI": "Quận 4", "XOMCHIEU": "Quận 4",
  "CHOQUAN": "Quận 5", "ANDONG": "Quận 5", "CHOLON": "Quận 5",
  "BINHTIEN": "Quận 6", "BINHTAY": "Quận 6", "PHUDINH": "Quận 6",
  "CHANHHUNG": "Quận 8", "BINHDONG": "Quận 8",
  "TANSONHOA": "Quận Tân Bình", "TANSONNHAT": "Quận Tân Bình", "TANHOA": "Quận Tân Bình", "BAYHIEN": "Quận Tân Bình", "TANBINH": "Quận Tân Bình", "PHUTHANH": "Quận Tân Bình",
  "TANNHUT": "Huyện Bình Chánh",
};

export function PickupRealtimeView() {
  const [tab, setTab] = useState<Tab>("realtime");
  const [area, setArea] = useState<Area | "all">("all");
  const [district, setDistrict] = useState("all");
  const [ward, setWard] = useState("all");
  const [query, setQuery] = useState("");
  const [riders, setRiders] = useState<PickupRider[]>([]);
  const [summary, setSummary] = useState<SummaryBucket[]>([]);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useReportInitialDataLoading("pickup-realtime", loading);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    setError(null);
    const snapshotResult = await supabase.from("pickup_48h_realtime_riders").select("snapshot_id,snapshot_at").order("snapshot_at", { ascending: false }).limit(1).maybeSingle();
    if (snapshotResult.error) {
      setError(snapshotResult.error.message);
      setRiders([]);
      setSummary([]);
      setLoading(false);
      return;
    }
    if (!snapshotResult.data) {
      setRiders([]);
      setRefreshedAt(null);
      setLoading(false);
      return;
    }
    const [riderResult, profileResult, summaryResult, historyResult] = await Promise.all([
      supabase.from("pickup_48h_realtime_riders").select("snapshot_id,snapshot_at,driver_id,driver_name,zones,total_pickup_quantity,pickup_point_count,assigned_orders,onhold_orders").eq("snapshot_id", snapshotResult.data.snapshot_id),
      supabase.from("riders").select("rider_code,full_name,kv"),
      supabase.from("pickup_48h_summary_groups").select("snapshot_id,khu_vuc,quan,phuong,cot,assign_orders,picked_orders,onhold_orders").eq("snapshot_id", snapshotResult.data.snapshot_id),
      supabase.from("pickup_48h_realtime_riders").select("driver_id,snapshot_at,total_pickup_quantity").order("snapshot_at", { ascending: false }).limit(10000),
    ]);
    if (riderResult.error || profileResult.error || summaryResult.error || historyResult.error) {
      setError(riderResult.error?.message ?? profileResult.error?.message ?? summaryResult.error?.message ?? historyResult.error?.message ?? "Không thể tải dữ liệu Pickup.");
      setRiders([]);
      setSummary([]);
    } else {
      const profiles = new Map((profileResult.data ?? []).map((profile) => [normalizeCode(profile.rider_code), profile]));
      const lastPickedAt = new Map<string, string>();
      const previousPicked = new Map<string, number>();
      for (const row of [...(historyResult.data ?? [])].reverse()) {
        const driverCode = normalizeCode(row.driver_id);
        const picked = Number(row.total_pickup_quantity ?? 0);
        const previous = previousPicked.get(driverCode);
        if (picked > 0 && (previous === undefined || picked > previous)) lastPickedAt.set(driverCode, row.snapshot_at);
        previousPicked.set(driverCode, picked);
      }
      const zoneAreas = new Map<string, Set<Area>>();
      const zoneScopes = new Map<string, { districts: Set<string>; wards: Set<string> }>();
      for (const row of summaryResult.data ?? []) {
        const zone = normalizeZone(row.khu_vuc);
        if (!zone) continue;
        const scope = zoneScopes.get(zone) ?? { districts: new Set<string>(), wards: new Set<string>() };
        scope.districts.add(resolveDistrict(row.quan, row.phuong));
        scope.wards.add(scopeLabel(row.phuong, "Chưa rõ phường"));
        zoneScopes.set(zone, scope);
      }
      const activeRiders = (riderResult.data ?? []).flatMap((row): PickupRider[] => {
        const profile = profiles.get(normalizeCode(row.driver_id));
        const riderArea = normalizeArea(profile?.kv);
        if (!riderArea) return [];
        for (const zone of splitZones(row.zones)) {
          const areas = zoneAreas.get(zone) ?? new Set<Area>();
          areas.add(riderArea);
          zoneAreas.set(zone, areas);
        }
        const picked = Number(row.total_pickup_quantity ?? 0);
        const pending = Number(row.assigned_orders ?? 0) + Number(row.onhold_orders ?? 0);
        const scopes = splitZones(row.zones).map((zone) => zoneScopes.get(zone)).filter(Boolean);
        const districts = Array.from(new Set(scopes.flatMap((scope) => Array.from(scope!.districts))));
        const wards = Array.from(new Set(scopes.flatMap((scope) => Array.from(scope!.wards))));
        const lastPickup = lastPickedAt.get(normalizeCode(row.driver_id));
        const waitMinutes = lastPickup ? Math.max(0, Math.floor((Date.now() - new Date(lastPickup).getTime()) / 60_000)) : null;
        return [{ id: `${row.snapshot_id}:${row.driver_id}`, name: profile?.full_name?.trim() || row.driver_name?.trim() || "Chưa có tên", code: row.driver_id, area: riderArea, route: row.zones?.trim() || "Chưa có tuyến", districts, wards, assigned: picked + pending, picked, pending, waitMinutes, status: pending === 0 ? "on_track" : waitMinutes !== null && waitMinutes > 60 ? "urgent" : "watch" }];
      });
      const groupedSummary = new Map<string, SummaryBucket>();
      for (const row of summaryResult.data ?? []) {
        const areaSet = zoneAreas.get(normalizeZone(row.khu_vuc));
        const summaryArea = areaSet?.size === 1 ? Array.from(areaSet)[0] : null;
        const label = row.cot?.trim() || "Chưa có COT";
        const district = resolveDistrict(row.quan, row.phuong);
        const ward = scopeLabel(row.phuong, "Chưa rõ phường");
        const key = `${summaryArea ?? "all"}:${district}:${ward}:${label}`;
        const current = groupedSummary.get(key) ?? { id: key, label, area: summaryArea, district, ward, assigned_count: 0, picked_count: 0, pending_count: 0, rider_count: 0 };
        current.assigned_count += Number(row.assign_orders ?? 0);
        current.picked_count += Number(row.picked_orders ?? 0);
        current.pending_count += Number(row.onhold_orders ?? 0);
        groupedSummary.set(key, current);
      }
      setRiders(activeRiders);
      setSummary(Array.from(groupedSummary.values()));
      setRefreshedAt(snapshotResult.data.snapshot_at);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useSupabaseRealtime({ table: "pickup_48h_realtime_riders", onChange: () => void load() });
  useSupabaseRealtime({ table: "pickup_48h_summary_groups", onChange: () => void load() });

  const visibleRiders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return riders.filter((rider) =>
      (area === "all" || rider.area === area) &&
      (district === "all" || rider.districts.includes(district)) &&
      (ward === "all" || rider.wards.includes(ward)) &&
      (!normalized || `${rider.name} ${rider.code} ${rider.route}`.toLocaleLowerCase("vi").includes(normalized)),
    ).sort(sortRiders);
  }, [area, district, query, riders, ward]);

  const total = useMemo(() => visibleRiders.reduce((sum, rider) => ({
    assigned: sum.assigned + rider.assigned,
    picked: sum.picked + rider.picked,
    pending: sum.pending + rider.pending,
    urgent: sum.urgent + (rider.status === "urgent" ? 1 : 0),
  }), { assigned: 0, picked: 0, pending: 0, urgent: 0 }), [visibleRiders]);

  const selectedAreas: Area[] = area === "all" ? ["KV5", "KV6"] : [area];
  const districtOptions = useMemo(() => Array.from(new Set(summary.filter((item) => item.area !== null && (area === "all" || item.area === area)).map((item) => item.district))).sort(compareVietnamese), [area, summary]);
  const wardOptions = useMemo(() => Array.from(new Set(summary.filter((item) => item.area !== null && (area === "all" || item.area === area) && (district === "all" || item.district === district)).map((item) => item.ward))).sort(compareVietnamese), [area, district, summary]);
  const scopedSummary = useMemo(() => summary.filter((item) => item.area !== null && (area === "all" || item.area === area) && (district === "all" || item.district === district) && (ward === "all" || item.ward === ward)), [area, district, summary, ward]);
  const bars = useMemo(() => {
    const grouped = new Map<string, SummaryBucket & { hour: string }>();
    for (const item of scopedSummary) {
      const key = `${item.area}:${item.label}`;
      const current = grouped.get(key) ?? { ...item, id: key, hour: item.label, assigned_count: 0, picked_count: 0, pending_count: 0 };
      current.assigned_count += item.assigned_count;
      current.picked_count += item.picked_count;
      current.pending_count += item.pending_count;
      grouped.set(key, current);
    }
    return Array.from(grouped.values()).sort((left, right) => compareVietnamese(left.hour, right.hour));
  }, [scopedSummary]);
  const summaryTotals = scopedSummary.reduce((totals, item) => ({ assigned: totals.assigned + item.assigned_count, pending: totals.pending + item.pending_count }), { assigned: 0, pending: 0 });
  const districtBreakdown = useMemo(() => buildGeographyBreakdown(scopedSummary, "district"), [scopedSummary]);
  const wardBreakdown = useMemo(() => buildGeographyBreakdown(scopedSummary, "ward"), [scopedSummary]);
  const maxOrders = Math.max(...bars.map((bucket) => bucket.assigned_count), 1);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}><Radio size={13} /> Pickup control · KV5 + KV6</p>
          <h1>Pickup Realtime</h1>
          <p className={styles.lede}>Theo dõi tiến độ lấy hàng theo rider và nhận diện tuyến cần xử lý ngay.</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.live}><i /> {refreshedAt ? `Cập nhật ${formatTime(refreshedAt)}` : "Chưa có snapshot"}</span>
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /> Làm mới</Button>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Chế độ Pickup">
        <button role="tab" aria-selected={tab === "realtime"} className={cn(styles.tab, tab === "realtime" && styles.activeTab)} onClick={() => setTab("realtime")}>Realtime Pickup</button>
        <button role="tab" aria-selected={tab === "summary"} className={cn(styles.tab, tab === "summary" && styles.activeTab)} onClick={() => setTab("summary")}>Tổng hợp 48 giờ</button>
        <span>Dữ liệu từ <strong>pickup_48h_summary_groups</strong></span>
      </div>

      <section className={styles.toolbar} aria-label="Bộ lọc Pickup">
        <div className={styles.areaSwitch}>
          {(["all", "KV5", "KV6"] as const).map((item) => <button key={item} type="button" onClick={() => { setArea(item); setDistrict("all"); setWard("all"); }} className={cn(area === item && styles.activeArea)}>{item === "all" ? "KV5 + KV6" : item}</button>)}
        </div>
        <div className={styles.scopeFilters}>
          <label>Quận<select value={district} onChange={(event) => { setDistrict(event.target.value); setWard("all"); }}><option value="all">Tất cả quận</option>{districtOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>Phường<select value={ward} onChange={(event) => setWard(event.target.value)}><option value="all">Tất cả phường</option>{wardOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>
        <label className={styles.search}><Search size={16} /><span className="sr-only">Tìm rider hoặc tuyến</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm rider, mã hoặc tuyến" /></label>
      </section>

      {error ? <p className={styles.empty}>{error}</p> : null}
      {tab === "realtime" ? <RealtimeTab rows={visibleRiders} total={total} summaryTotals={summaryTotals} loading={loading} /> : <SummaryTab bars={bars} maxOrders={maxOrders} areas={selectedAreas} riders={visibleRiders} districts={districtBreakdown} wards={wardBreakdown} loading={loading} />}
    </div>
  );
}

function RealtimeTab({ rows, total, summaryTotals, loading }: { rows: PickupRider[]; total: { assigned: number; picked: number; pending: number; urgent: number }; summaryTotals: { assigned: number; pending: number }; loading: boolean }) {
  const pickupRate = total.assigned ? Math.round(total.picked / total.assigned * 100) : 0;
  return <>
    <section className={styles.metrics} aria-label="Chỉ số Pickup realtime">
      <Metric icon={<UsersRound />} label="Rider đang theo dõi" value={rows.length} helper="Chỉ gồm KV5 và KV6" />
      <Metric icon={<PackageCheck />} label="Đã lấy hàng" value={total.picked.toLocaleString("vi-VN")} helper={`${pickupRate}% trên số đơn đã phân`} tone="success" />
      <Metric icon={<Clock3 />} label="Đơn chờ lấy" value={summaryTotals.pending.toLocaleString("vi-VN")} helper={`${summaryTotals.assigned.toLocaleString("vi-VN")} đơn phân từ summary`} tone="accent" />
      <Metric icon={<AlertTriangle />} label="Cần can thiệp" value={total.urgent} helper="Chờ trên 60 phút" tone={total.urgent ? "danger" : "success"} />
    </section>
    <section className={styles.ledger}>
      <div className={styles.sectionHead}><div><p className={styles.index}>01 — LIVE LEDGER</p><h2>Tiến độ theo rider</h2></div><p>{rows.length} rider · ưu tiên cần xử lý, rồi đơn chờ giảm dần</p></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Rider</th><th>Khu vực</th><th>Tuyến phụ trách</th><th className={styles.numeric}>Đã lấy</th><th className={styles.numeric}>Đơn chờ</th><th>Trạng thái</th><th className={styles.numeric}>Thời gian chờ</th></tr></thead><tbody>{rows.map((rider) => <tr key={rider.id}><td><strong>{rider.name}</strong><small>{rider.code}</small></td><td><span className={cn(styles.areaBadge, rider.area === "KV5" ? styles.areaKv5 : styles.areaKv6)}>{rider.area}</span></td><td><RouteList route={rider.route} area={rider.area} /></td><td className={cn(styles.numeric, styles.pickCell)}><strong>{rider.picked}/{rider.assigned}</strong><div className={styles.progress}><i style={{ width: `${rider.assigned ? Math.round(rider.picked / rider.assigned * 100) : 0}%` }} /></div></td><td className={cn(styles.numeric, styles.pendingCell)}>{rider.pending}</td><td><Status status={rider.status} /></td><td className={cn(styles.numeric, styles.waitCell, rider.status === "urgent" ? styles.waitUrgent : rider.status === "watch" ? styles.waitWatch : styles.waitStable)}>{formatWaitMinutes(rider.waitMinutes)}</td></tr>)}</tbody></table></div>
      {!loading && !rows.length ? <p className={styles.empty}>Chưa có rider trong snapshot Pickup mới nhất.</p> : null}
    </section>
  </>;
}

function SummaryTab({ bars, maxOrders, areas, riders, districts, wards, loading }: { bars: Array<SummaryBucket & { hour: string }>; maxOrders: number; areas: Area[]; riders: PickupRider[]; districts: GeographyMetric[]; wards: GeographyMetric[]; loading: boolean }) {
  const totalAssigned = bars.reduce((sum, bar) => sum + bar.assigned_count, 0);
  const totalPicked = bars.reduce((sum, bar) => sum + bar.picked_count, 0);
  const rate = totalAssigned ? Math.round(totalPicked / totalAssigned * 100) : 0;
  const byArea = (metric: "assigned_count" | "picked_count") => (area: Area) => bars.filter((bar) => bar.area === area).reduce((sum, bar) => sum + bar[metric], 0);
  const kv5Assigned = byArea("assigned_count")("KV5");
  const kv6Assigned = byArea("assigned_count")("KV6");
  const kv5Picked = byArea("picked_count")("KV5");
  const kv6Picked = byArea("picked_count")("KV6");
  const kv5Rate = kv5Assigned ? Math.round(kv5Picked / kv5Assigned * 100) : 0;
  const kv6Rate = kv6Assigned ? Math.round(kv6Picked / kv6Assigned * 100) : 0;
  const warnings = riders.filter((rider) => rider.status !== "on_track").sort((a, b) => b.pending - a.pending).slice(0, 3);
  return <section className={styles.summary}>
    <div className={styles.sectionHead}><div><p className={styles.index}>02 — 48H SUMMARY</p><h2>Nhịp pickup trong 48 giờ</h2><p>Tổng hợp trực tiếp từ bảng <strong>pickup_48h_summary_groups</strong>.</p></div><span className={styles.summaryScope}>{areas.join(" + ")} · 48 giờ</span></div>
    <div className={styles.summaryGrid}>
      <article className={styles.chartCard}><div className={styles.chartHead}><div><h3>Đơn phân và đã lấy theo khung giờ</h3><p>Cột cao: đơn được phân · cột sáng: đã lấy</p></div><span>{rate}% hoàn tất</span></div><div className={styles.chart}>{bars.map((bar, index) => <div key={bar.id} className={styles.barGroup}><div className={styles.bars}><i title={`${bar.assigned_count} đơn phân`} style={{ height: `${bar.assigned_count / maxOrders * 100}%` }} /><b title={`${bar.picked_count} đơn đã lấy`} style={{ height: `${bar.picked_count / maxOrders * 100}%` }} /></div><small>{index % 6 === 0 ? `${bar.area} ${bar.hour}` : bar.hour}</small></div>)}</div><div className={styles.legend}><span><i /> Đơn phân</span><span><b /> Đã lấy</span></div>{!loading && !bars.length ? <p className={styles.empty}>Chưa có dữ liệu tổng hợp 48 giờ.</p> : null}</article>
      <aside className={styles.actionCard}><p className={styles.index}>ĐIỂM CẦN XỬ LÝ</p><h3>Ưu tiên trong ca</h3>{warnings.map((rider) => <Action key={rider.id} title={`${rider.area} · ${rider.route}`} note={`${rider.pending} đơn chờ, chờ ${formatWaitMinutes(rider.waitMinutes)}`} severity={rider.status === "urgent" ? "urgent" : "watch"} />)}{!loading && !warnings.length ? <p className={styles.empty}>Chưa có rider cần theo dõi.</p> : null}</aside>
    </div>
    <section className={styles.geoSection} aria-label="Phân tích theo quận và phường">
      <div className={styles.geoHeading}><div><p className={styles.index}>03 — LOCALITY VIEW</p><h2>Theo quận và phường</h2><p>Ưu tiên địa bàn có nhiều đơn chờ lấy nhất trong phạm vi đang lọc.</p></div><span>Đơn chờ lấy</span></div>
      <div className={styles.geoGrid}>
        <GeoBreakdown title="Quận cần theo dõi" subtitle="Xếp theo đơn chờ lấy" items={districts} emptyText="Chưa có dữ liệu quận phù hợp bộ lọc." />
        <GeoBreakdown title="Phường cần theo dõi" subtitle="Xếp theo đơn chờ lấy" items={wards} emptyText="Chưa có dữ liệu phường phù hợp bộ lọc." />
      </div>
    </section>
    <div className={styles.summaryTable}><div><span>Chỉ số</span><span>KV5</span><span>KV6</span><span>Tổng</span></div><SummaryRow label="Đơn đã phân" values={[kv5Assigned, kv6Assigned]} /><SummaryRow label="Đơn đã lấy" values={[kv5Picked, kv6Picked]} /><SummaryRow label="Tỷ lệ hoàn tất" values={[kv5Rate, kv6Rate]} percentage /><SummaryRow label="Rider cảnh báo" values={[riders.filter((rider) => rider.area === "KV5" && rider.status !== "on_track").length, riders.filter((rider) => rider.area === "KV6" && rider.status !== "on_track").length]} /></div>
  </section>;
}

function GeoBreakdown({ title, subtitle, items, emptyText }: { title: string; subtitle: string; items: GeographyMetric[]; emptyText: string }) {
  const maxPending = Math.max(...items.map((item) => item.pending), 1);
  return <article className={styles.geoCard}><div className={styles.geoCardHead}><div><h3>{title}</h3><p>{subtitle}</p></div><span>{items.length} địa bàn</span></div><div className={styles.geoLegend}><span>Địa bàn</span><span>Đơn phân</span><span>Đã lấy</span><span>Chờ lấy</span></div><div className={styles.geoRows}>{items.slice(0, 8).map((item, index) => <div key={item.name} className={styles.geoRow}><strong><i>{String(index + 1).padStart(2, "0")}</i>{item.name}</strong><span>{item.assigned.toLocaleString("vi-VN")}</span><span>{item.picked.toLocaleString("vi-VN")}</span><b>{item.pending.toLocaleString("vi-VN")}</b><div className={styles.geoBar}><i style={{ width: `${item.pending / maxPending * 100}%` }} /></div></div>)}</div>{!items.length ? <p className={styles.empty}>{emptyText}</p> : null}</article>;
}

function Metric({ icon, label, value, helper, tone = "default" }: { icon: React.ReactNode; label: string; value: string | number; helper: string; tone?: "default" | "accent" | "success" | "danger" }) { return <article className={cn(styles.metric, styles[`metric_${tone}`])}><span>{icon}</span><p>{label}</p><strong>{value}</strong><small>{helper}</small></article>; }
function Status({ status }: { status: Status }) { const text = { on_track: "Ổn định", watch: "Theo dõi", urgent: "Cần xử lý" }[status]; return <span className={cn(styles.status, styles[`status_${status}`])}>{status === "urgent" ? <AlertTriangle size={13} /> : status === "watch" ? <Clock3 size={13} /> : <PackageCheck size={13} />}{text}</span>; }
function RouteList({ route, area }: { route: string; area: Area }) { const routes = route.split(",").map((item) => item.trim()).filter(Boolean); return <div className={cn(styles.routeList, area === "KV5" ? styles.routesKv5 : styles.routesKv6)}>{routes.map((item) => <span key={item}>{item}</span>)}</div>; }
function Action({ title, note, severity }: { title: string; note: string; severity: "urgent" | "watch" }) { return <div className={styles.action}><span className={cn(styles.actionDot, styles[`action_${severity}`])} /><div><strong>{title}</strong><p>{note}</p></div><ArrowUp size={15} /></div>; }
function SummaryRow({ label, values, percentage = false }: { label: string; values: [number, number]; percentage?: boolean }) { const total = percentage ? Math.round((values[0] + values[1]) / 2) : values[0] + values[1]; const format = (value: number) => percentage ? `${value}%` : value.toLocaleString("vi-VN"); return <div><strong>{label}</strong><span>{format(values[0])}</span><span>{format(values[1])}</span><span>{format(total)}</span></div>; }
function formatTime(value: string) { return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }
function formatWaitMinutes(value: number | null) { return value === null ? "Chưa ghi nhận" : `${value.toLocaleString("vi-VN")} phút`; }
function normalizeArea(value: string | null | undefined): Area | null { const normalized = value?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, "") ?? ""; return normalized === "KV5" || normalized === "5" ? "KV5" : normalized === "KV6" || normalized === "6" ? "KV6" : null; }
function normalizeCode(value: string | null | undefined) { return value?.trim().toUpperCase() ?? ""; }
function normalizeZone(value: string | null | undefined) { return value?.trim().toUpperCase() ?? ""; }
function splitZones(value: string | null | undefined) { return (value ?? "").split(",").map(normalizeZone).filter(Boolean); }
function scopeLabel(value: string | null | undefined, fallback: string) { return value?.trim() || fallback; }
function resolveDistrict(rawDistrict: string | null | undefined, ward: string | null | undefined) {
  const direct = rawDistrict?.match(/(?:quận|huyện)\s+[^,]+/i)?.[0];
  if (direct) return direct.replace(/^quận/i, "Quận").replace(/^huyện/i, "Huyện").trim();
  const mapped = WARD_DISTRICTS[normalizePlace(ward)];
  if (mapped) return mapped;
  return rawDistrict && !/thành phố hồ chí minh|tp\. hồ chí minh|phường|xã/i.test(rawDistrict) ? rawDistrict.trim() : "Chưa rõ quận";
}
function normalizePlace(value: string | null | undefined) { return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/^(PHUONG|XA)\s+/, "").replace(/[^A-Z0-9]/g, ""); }
function compareVietnamese(left: string, right: string) { return left.localeCompare(right, "vi"); }
function sortRiders(left: PickupRider, right: PickupRider) { const priority = { urgent: 0, watch: 1, on_track: 2 }; return priority[left.status] - priority[right.status] || right.pending - left.pending || compareVietnamese(left.name, right.name); }
function buildGeographyBreakdown(items: SummaryBucket[], field: "district" | "ward") {
  const grouped = new Map<string, GeographyMetric>();
  for (const item of items) {
    const current = grouped.get(item[field]) ?? { name: item[field], assigned: 0, picked: 0, pending: 0 };
    current.assigned += item.assigned_count;
    current.picked += item.picked_count;
    current.pending += item.pending_count;
    grouped.set(item[field], current);
  }
  return Array.from(grouped.values()).sort((left, right) => right.pending - left.pending || right.assigned - left.assigned || compareVietnamese(left.name, right.name));
}
