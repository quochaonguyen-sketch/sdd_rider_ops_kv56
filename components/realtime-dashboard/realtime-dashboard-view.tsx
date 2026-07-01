"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Clock3, PackageCheck, RefreshCcw, Search, Truck, Users, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type RealtimeRider = { id: string; driver_id: string; driver_name: string | null; total_assigned: number; delivered: number; delivering: number; failed: number; zone_id: string | null; first_delivery_at: string | null; idle_delivery_seconds: number; snapshot_id: string; snapshot_at: string };
type RiderProfile = { rider_code: string; full_name: string | null; kv: string | null; delivery_district: string | null; delivery_ward: string | null };
type DisplayRider = RealtimeRider & { name: string; kv: string; district: string; ward: string };
const PAGE_SIZE = 25;

export function RealtimeDashboardView() {
  const [date, setDate] = useState(todayInVietnam());
  const [rows, setRows] = useState<RealtimeRider[]>([]);
  const [profiles, setProfiles] = useState<RiderProfile[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    setLoading(true); setError(null);
    const [latest, riderResult] = await Promise.all([
      supabase.from("realtime_delivery_riders").select("snapshot_id,snapshot_at").eq("work_date", date).order("snapshot_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("riders").select("rider_code,full_name,kv,delivery_district,delivery_ward").eq("status", "active"),
    ]);
    if (latest.error || riderResult.error) {
      setError(latest.error?.message ?? riderResult.error?.message ?? "Không thể tải dữ liệu"); setRows([]); setLoading(false); return;
    }
    setProfiles((riderResult.data ?? []) as RiderProfile[]);
    if (!latest.data) { setRows([]); setSnapshotAt(null); setLoading(false); return; }
    const result = await supabase.from("realtime_delivery_riders").select("id,driver_id,driver_name,total_assigned,delivered,delivering,failed,zone_id,first_delivery_at,idle_delivery_seconds,snapshot_id,snapshot_at").eq("work_date", date).eq("snapshot_id", latest.data.snapshot_id);
    if (result.error) setError(result.error.message);
    setRows((result.data ?? []) as RealtimeRider[]); setSnapshotAt(latest.data.snapshot_at); setLoading(false);
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useSupabaseRealtime({ table: "realtime_delivery_riders", onChange: load });
  useSupabaseRealtime({ table: "riders", onChange: load });

  const kvRows = useMemo(() => {
    const profileMap = new Map(profiles.map((profile) => [normalize(profile.rider_code), profile]));
    return rows.flatMap((row): DisplayRider[] => {
      const profile = profileMap.get(normalize(row.driver_id));
      if (!profile || !isKv56(profile.kv)) return [];
      return [{ ...row, name: profile.full_name?.trim() || row.driver_name?.trim() || "Chưa có tên", kv: profile.kv?.trim() || "-", district: profile.delivery_district?.trim() || "Chưa xác định quận", ward: profile.delivery_ward?.trim() || "Chưa xác định phường" }];
    }).sort((a, b) => a.district.localeCompare(b.district, "vi", { numeric: true }) || a.ward.localeCompare(b.ward, "vi", { numeric: true }) || a.driver_id.localeCompare(b.driver_id, "vi", { numeric: true }));
  }, [profiles, rows]);
  const filtered = useMemo(() => { const q = normalize(query); return q ? kvRows.filter((row) => normalize(`${row.driver_id} ${row.name} ${row.kv} ${row.district} ${row.ward}`).includes(q)) : kvRows; }, [kvRows, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const grouped = useMemo(() => groupByDistrict(paginated), [paginated]);
  const totals = useMemo(() => kvRows.reduce((sum, row) => ({ assigned: sum.assigned + row.total_assigned, delivered: sum.delivered + row.delivered, delivering: sum.delivering + row.delivering, failed: sum.failed + row.failed }), { assigned: 0, delivered: 0, delivering: 0, failed: 0 }), [kvRows]);
  const progress = totals.assigned ? Math.round((totals.delivered / totals.assigned) * 100) : 0;

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">Live delivery KV5 & KV6</p><h1 className="mt-1 text-2xl font-black text-slate-950">Realtime Delivery theo quận/phường</h1><p className="mt-1 text-sm text-slate-500">{snapshotAt ? `Snapshot mới nhất: ${formatDateTime(snapshotAt)}` : "Chưa có snapshot trong ngày."}</p></div><div className="flex gap-2"><Input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} className="w-44" /><Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /> Làm mới</Button></div></header>
    {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-6"><Metric icon={Users} label="Rider KV5/6" value={kvRows.filter((row) => row.total_assigned > 0).length} tone="blue" /><Metric icon={Truck} label="Tổng đơn" value={totals.assigned} tone="slate" /><Metric icon={PackageCheck} label="Đã giao" value={totals.delivered} tone="green" /><Metric icon={Clock3} label="Đang giao" value={totals.delivering} tone="amber" /><Metric icon={XCircle} label="Thất bại" value={totals.failed} tone="red" /><Metric icon={Activity} label="Tiến độ" value={`${progress}%`} tone="blue" /></section>
    <Card className="p-0"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-950">Rider theo khu vực giao</h2><p className="text-xs text-slate-500">{filtered.length}/{kvRows.length} rider KV5/6</p></div><label className="relative w-full sm:w-96"><Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={17} /><Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Tìm ID, tên, quận hoặc phường" className="pl-9" /></label></div>
      <div className="space-y-5 p-4">{grouped.map((district) => <section key={district.district}><div className="mb-2 flex items-center justify-between rounded-md bg-slate-900 px-3 py-2 text-white"><h3 className="font-black">{district.district}</h3><span className="text-xs font-bold">{district.rows.length} rider</span></div><div className="overflow-hidden rounded-md border border-slate-200"><RiderTable rows={district.rows} /></div></section>)}{!loading && grouped.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">Không có rider KV5/KV6 phù hợp.</p> : null}</div>
      <div className="flex items-center justify-between border-t border-slate-100 p-4 text-sm"><span className="text-slate-500">Trang {safePage}/{pageCount}</span><div className="flex gap-2"><Button type="button" variant="secondary" disabled={safePage <= 1} onClick={() => setPage((value) => value - 1)}>Trước</Button><Button type="button" variant="secondary" disabled={safePage >= pageCount} onClick={() => setPage((value) => value + 1)}>Sau</Button></div></div>
    </Card>
  </div>;
}

function RiderTable({ rows }: { rows: DisplayRider[] }) { return <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr><th className="px-3 py-2">Rider</th><th className="px-3 py-2">Phường giao</th><th className="px-3 py-2">KV</th><th className="px-3 py-2 text-right">Tổng</th><th className="px-3 py-2 text-right">Đã giao</th><th className="px-3 py-2 text-right">Đang giao</th><th className="px-3 py-2 text-right">Lỗi</th><th className="px-3 py-2">Tiến độ</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => { const progress = row.total_assigned ? Math.round(row.delivered / row.total_assigned * 100) : 0; return <tr key={row.id}><td className="px-3 py-2"><p className="font-black text-slate-950">{row.name}</p><p className="text-xs text-slate-500">{row.driver_id}</p></td><td className="px-3 py-2 font-semibold text-slate-600">{row.ward}</td><td className="px-3 py-2 font-bold text-slate-600">{row.kv}</td><NumberCell value={row.total_assigned} /><NumberCell value={row.delivered} tone="green" /><NumberCell value={row.delivering} tone="amber" /><NumberCell value={row.failed} tone="red" /><td className="px-3 py-2 font-bold text-slate-600">{progress}%</td></tr>; })}</tbody></table></div>; }
function groupByDistrict(rows: DisplayRider[]) { const districts = new Map<string, DisplayRider[]>(); for (const row of rows) districts.set(row.district, [...(districts.get(row.district) ?? []), row]); return Array.from(districts, ([district, districtRows]) => ({ district, rows: districtRows })); }
function isKv56(value: string | null) { return /^(?:kv|khu vuc)?\s*[56]$/i.test(normalize(value ?? "")); }
function Metric({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number | string; tone: "blue" | "green" | "amber" | "red" | "slate" }) { const colors = { blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", slate: "bg-slate-100 text-slate-700" }; return <Card><div className={`grid size-9 place-items-center rounded-lg ${colors[tone]}`}><Icon size={18} /></div><p className="mt-3 text-xs font-bold uppercase text-slate-500">{label}</p><p className="mt-1 text-2xl font-black text-slate-950">{value}</p></Card>; }
function NumberCell({ value, tone }: { value: number; tone?: "green" | "amber" | "red" }) { const color = tone === "green" ? "text-emerald-700" : tone === "amber" ? "text-amber-700" : tone === "red" ? "text-red-700" : "text-slate-950"; return <td className={`px-3 py-2 text-right font-black ${color}`}>{value.toLocaleString("vi-VN")}</td>; }
function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim(); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }
function todayInVietnam() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
