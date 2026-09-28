/* LMHub Inventory · sheet-style KV5/KV6 boards with COT heat colors */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCcw, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

type Area = "KV5" | "KV6";
type InventoryRow = {
  snapshot_id: string;
  snapshot_at: string | null;
  shipment_id: string;
  create_time: string | null;
  received_time: string | null;
  report_date: string | null;
  ward: string;
  district: string;
  area: Area | string;
  zone_id: string;
  status: string;
  order_type: string;
  cot_group: string;
};
type CotBucket = "cot1" | "cot2";
type Counts = { cot1: number; cot2: number; total: number };
type WardAgg = { ward: string; district: string; area: Area } & Counts;
type DistrictAgg = { district: string; area: Area; wards: WardAgg[]; totals: Counts };

const PAGE_SIZE = 40;
const PAGE_ROWS = 1000;
const RELOAD_DEBOUNCE_MS = 1500;
const COLUMNS =
  "snapshot_id,snapshot_at,shipment_id,create_time,received_time,report_date,ward,district,area,zone_id,status,order_type,cot_group";
const UNKNOWN_WARD = "Chưa xác định phường";
const UNKNOWN_DISTRICT = "Chưa xác định quận";

export function LmhubInventoryView() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ area: Area; district: string; ward: string } | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  useReportInitialDataLoading("lmhub-inventory", loading);

  const requestRef = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const supabase = createClient();
    setLoading(true);
    setError(null);
    const latest = await supabase.from("lmhub_inventory_rows").select("snapshot_id,snapshot_at").order("snapshot_at", { ascending: false }).limit(1).maybeSingle();
    if (requestId !== requestRef.current) return;
    if (latest.error) { setError(latest.error.message); setRows([]); setSnapshotAt(null); setLoading(false); return; }
    if (!latest.data) { setRows([]); setSnapshotAt(null); setLoading(false); return; }
    const snapshotId = (latest.data as { snapshot_id: string }).snapshot_id;
    const collected: InventoryRow[] = [];
    let from = 0;
    while (true) {
      const result = await supabase.from("lmhub_inventory_rows").select(COLUMNS).eq("snapshot_id", snapshotId).order("shipment_id", { ascending: true }).range(from, from + PAGE_ROWS - 1);
      if (requestId !== requestRef.current) return;
      if (result.error) { setError(result.error.message); setLoading(false); return; }
      const chunk = ((result.data ?? []) as InventoryRow[]).map(normalizeRow);
      collected.push(...chunk);
      if (chunk.length < PAGE_ROWS) break;
      from += PAGE_ROWS;
      if (from > 100000) break;
    }
    setRows(collected);
    setSnapshotAt((latest.data as { snapshot_at: string | null }).snapshot_at ?? null);
    setLoading(false);
  }, []);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLoad = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void load(), RELOAD_DEBOUNCE_MS);
  }, [load]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  useEffect(() => { void load(); }, [load]);
  useSupabaseRealtime({ table: "lmhub_inventory_rows", onChange: scheduleLoad, debounceMs: 800 });

  const boards = useMemo(() => {
    const kvRows = rows.filter((row) => row.area === "KV5" || row.area === "KV6");
    return { kv5: buildBoard(kvRows, "KV5"), kv6: buildBoard(kvRows, "KV6"), all: kvRows.length };
  }, [rows]);

  const selectedOrders = useMemo(() => {
    if (!selected) return [];
    const q = normalize(query);
    return rows.filter((row) => row.area === selected.area && (row.district || UNKNOWN_DISTRICT) === selected.district && (row.ward || UNKNOWN_WARD) === selected.ward && (!q || normalize(`${row.shipment_id} ${row.zone_id} ${row.cot_group} ${row.order_type}`).includes(q))).sort((a, b) => toTime(b.received_time) - toTime(a.received_time) || a.shipment_id.localeCompare(b.shipment_id));
  }, [rows, selected, query]);

  const pageCount = Math.max(1, Math.ceil(selectedOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageOrders = selectedOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const openWard = (area: Area, district: string, ward: string) => { setSelected({ area, district, ward }); setQuery(""); setPage(1); };

  return (
    <div className="dashboard-control mx-auto max-w-[1680px] space-y-4">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Tồn LMHub · COT 1 / COT 2 · nhiệt độ tồn</div>
          <h1>Tồn khu vực</h1>
          <p>Hai bảng KV5 / KV6 giống sheet. Xanh = ít tồn, vàng = vừa, cam = cao, đỏ = nguy hiểm. Bấm phường để xem đơn.</p>
        </div>
        <div className="dashboard-command-actions">
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /><span>Làm mới</span></Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="font-semibold text-slate-500">Last update: {formatDateTime(snapshotAt)}</span>
        <span className="font-semibold text-slate-700">{boards.all.toLocaleString("vi-VN")} đơn</span>
        <HeatLegend />
      </div>
      {error ? <div role="alert" className="dashboard-error">{error}</div> : null}
      {loading && !rows.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2"><div className="h-[480px] animate-pulse rounded-xl bg-slate-100" /><div className="h-[480px] animate-pulse rounded-xl bg-slate-100" /></div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <AreaBoard title="KHU VỰC 5" tone="navy" districts={boards.kv5} onWard={openWard} />
          <AreaBoard title="KHU VỰC 6" tone="sky" districts={boards.kv6} onWard={openWard} />
        </div>
      )}
      {selected ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div>
              <h2 className="text-base font-bold text-slate-950">Đơn tồn · {selected.ward}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{selected.area} · {selected.district} · {selectedOrders.length.toLocaleString("vi-VN")} đơn</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative block w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Mã đơn, zone, COT" className="pl-9" />
              </span>
              <Button type="button" variant="secondary" onClick={() => setSelected(null)}><X size={16} /> Đóng</Button>
            </div>
          </div>
          <div className="max-h-[520px] overflow-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600">
                <tr><th className="px-3 py-2">Mã vận đơn</th><th className="px-3 py-2">Zone</th><th className="px-3 py-2">Loại</th><th className="px-3 py-2">COT</th><th className="px-3 py-2">Trạng thái</th><th className="px-3 py-2 text-right">Về hub</th></tr>
              </thead>
              <tbody>
                {!pageOrders.length ? <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Không có đơn.</td></tr> : pageOrders.map((row) => (
                  <tr key={row.shipment_id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-[13px] font-semibold">{row.shipment_id}</td>
                    <td className="px-3 py-2 text-slate-600">{row.zone_id || "—"}</td>
                    <td className="px-3 py-2">{row.order_type || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{row.cot_group || "—"}</td>
                    <td className="px-3 py-2">{row.status || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{formatDateTime(row.received_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">Trang {safePage}/{pageCount}</span>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" disabled={safePage <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}><ChevronLeft size={16} /> Trước</Button>
              <Button type="button" variant="secondary" disabled={safePage >= pageCount} onClick={() => setPage((v) => Math.min(pageCount, v + 1))}>Sau <ChevronRight size={16} /></Button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AreaBoard({ title, tone, districts, onWard }: { title: string; tone: "navy" | "sky"; districts: DistrictAgg[]; onWard: (area: Area, district: string, ward: string) => void }) {
  const head = tone === "navy" ? "bg-[#123a8a]" : "bg-[#3b82c4]";
  const districtBar = tone === "navy" ? "bg-[#dbe7ff] text-[#123a8a]" : "bg-[#d7efff] text-[#0f4c81]";
  const grand = districts.reduce((sum, item) => addCounts(sum, item.totals), emptyCounts());
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className={cn("px-4 py-2.5 text-center text-sm font-black tracking-wide text-white", head)}>{title}</div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={cn("text-xs font-bold text-white", head)}>
              <th className="px-3 py-2 text-left">Quận / Phường</th>
              <th className="w-20 px-2 py-2 text-center">COT 1</th>
              <th className="w-20 px-2 py-2 text-center">COT 2</th>
              <th className="w-20 px-2 py-2 text-center">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {districts.map((district) => <DistrictBlock key={`${district.area}-${district.district}`} district={district} barClass={districtBar} onWard={onWard} />)}
            {!districts.length ? <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">Chưa có tồn.</td></tr> : (
              <tr className="bg-slate-900 text-white">
                <td className="px-3 py-2 font-black">Tổng {title}</td>
                <td className="px-2 py-2 text-center font-mono font-bold">{grand.cot1.toLocaleString("vi-VN")}</td>
                <td className="px-2 py-2 text-center font-mono font-bold">{grand.cot2.toLocaleString("vi-VN")}</td>
                <HeatCell value={grand.total} strong />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DistrictBlock({ district, barClass, onWard }: { district: DistrictAgg; barClass: string; onWard: (area: Area, district: string, ward: string) => void }) {
  return (
    <>
      <tr className={barClass}>
        <td className="px-3 py-1.5 font-black">{district.district}</td>
        <td className="px-2 py-1.5 text-center font-mono font-bold">{district.totals.cot1.toLocaleString("vi-VN")}</td>
        <td className="px-2 py-1.5 text-center font-mono font-bold">{district.totals.cot2.toLocaleString("vi-VN")}</td>
        <HeatCell value={district.totals.total} strong />
      </tr>
      {district.wards.map((ward) => (
        <tr key={ward.ward} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => onWard(ward.area, ward.district, ward.ward)}>
          <td className="px-3 py-1.5 pl-6 text-slate-800">{ward.ward}</td>
          <td className="px-2 py-1.5 text-center font-mono text-slate-700">{ward.cot1 || 0}</td>
          <td className="px-2 py-1.5 text-center font-mono text-slate-700">{ward.cot2 || 0}</td>
          <HeatCell value={ward.total} />
        </tr>
      ))}
      <tr className="bg-slate-100 font-bold">
        <td className="px-3 py-1.5">Tổng {district.district}</td>
        <td className="px-2 py-1.5 text-center font-mono">{district.totals.cot1.toLocaleString("vi-VN")}</td>
        <td className="px-2 py-1.5 text-center font-mono">{district.totals.cot2.toLocaleString("vi-VN")}</td>
        <HeatCell value={district.totals.total} strong />
      </tr>
    </>
  );
}

function HeatCell({ value, strong }: { value: number; strong?: boolean }) {
  return <td className={cn("px-2 py-1.5 text-center font-mono", heatClass(value), strong && "font-black")}>{value.toLocaleString("vi-VN")}</td>;
}

function HeatLegend() {
  return (
    <div className="ml-auto flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-900">1–5 ít</span>
      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-950">6–20 vừa</span>
      <span className="rounded-full bg-orange-300 px-2 py-0.5 text-[11px] font-bold text-orange-950">21–35 cao</span>
      <span className="rounded-full bg-rose-400 px-2 py-0.5 text-[11px] font-bold text-rose-950">36+ nguy hiểm</span>
    </div>
  );
}

function heatClass(value: number) {
  if (value <= 0) return "bg-white text-slate-400";
  if (value <= 5) return "bg-emerald-200 text-emerald-950";
  if (value <= 20) return "bg-amber-200 text-amber-950";
  if (value <= 35) return "bg-orange-300 text-orange-950";
  return "bg-rose-400 text-rose-950";
}

function buildBoard(rows: InventoryRow[], area: Area): DistrictAgg[] {
  const map = new Map<string, Map<string, Counts>>();
  for (const row of rows) {
    if (row.area !== area) continue;
    const district = row.district || UNKNOWN_DISTRICT;
    const ward = row.ward || UNKNOWN_WARD;
    if (!map.has(district)) map.set(district, new Map());
    const wards = map.get(district)!;
    const current = wards.get(ward) ?? emptyCounts();
    current[cotBucket(row.cot_group)] += 1;
    current.total += 1;
    wards.set(ward, current);
  }
  return [...map.entries()].map(([district, wards]) => {
    const wardList: WardAgg[] = [...wards.entries()].map(([ward, counts]) => ({ ward, district, area, ...counts })).sort((a, b) => a.ward.localeCompare(b.ward, "vi", { numeric: true }));
    const totals = wardList.reduce((sum, item) => addCounts(sum, item), emptyCounts());
    return { district, area, wards: wardList, totals };
  }).sort((a, b) => b.totals.total - a.totals.total || a.district.localeCompare(b.district, "vi"));
}

function cotBucket(value: string): CotBucket {
  const text = normalize(value);
  if (text.includes("cot 1") || text.endsWith("cot1") || /\bcot\s*1\b/.test(text)) return "cot1";
  return "cot2";
}
function emptyCounts(): Counts { return { cot1: 0, cot2: 0, total: 0 }; }
function addCounts(a: Counts, b: Counts): Counts { return { cot1: a.cot1 + b.cot1, cot2: a.cot2 + b.cot2, total: a.total + b.total }; }
function normalizeArea(value: string): Area | string {
  const raw = String(value ?? "").trim();
  const key = normalize(raw).replace(/\s+/g, " ");
  if (key === "kv5" || key === "khu vuc 5" || key === "khuvuc5" || key === "area 5") return "KV5";
  if (key === "kv6" || key === "khu vuc 6" || key === "khuvuc6" || key === "area 6") return "KV6";
  return raw;
}
function normalizeRow(row: InventoryRow): InventoryRow {
  return { ...row, shipment_id: String(row.shipment_id ?? "").trim(), ward: String(row.ward ?? "").trim(), district: String(row.district ?? "").trim(), area: normalizeArea(String(row.area ?? "")), zone_id: String(row.zone_id ?? "").trim(), status: String(row.status ?? "").trim(), order_type: String(row.order_type ?? "").trim(), cot_group: String(row.cot_group ?? "").trim() };
}
function toTime(value: string | null): number { if (!value) return 0; const t = new Date(value).getTime(); return Number.isFinite(t) ? t : 0; }
function normalize(value: string): string { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim(); }
function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}
