/* LMHub Inventory · ops board, not a sheet clone */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCcw, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

type Area = "KV5" | "KV6";
type CotFilter = "all" | "cot1" | "cot2";
type HeatFilter = "all" | "hot";
type InventoryRow = {
  snapshot_id: string;
  snapshot_at: string | null;
  shipment_id: string;
  received_time: string | null;
  ward: string;
  district: string;
  area: Area | string;
  zone_id: string;
  status: string;
  order_type: string;
  cot_group: string;
};
type Counts = { cot1: number; cot2: number; total: number };
type WardAgg = { ward: string; district: string; area: Area } & Counts;
type DistrictAgg = { district: string; area: Area; wards: WardAgg[]; totals: Counts };

const PAGE_SIZE = 40;
const PAGE_ROWS = 1000;
const RELOAD_DEBOUNCE_MS = 1500;
const COLUMNS = "snapshot_id,snapshot_at,shipment_id,received_time,ward,district,area,zone_id,status,order_type,cot_group";
const UNKNOWN_WARD = "Chưa xác định phường";
const UNKNOWN_DISTRICT = "Chưa xác định quận";

export function LmhubInventoryView() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cot, setCot] = useState<CotFilter>("all");
  const [heat, setHeat] = useState<HeatFilter>("hot");
  const [openDistricts, setOpenDistricts] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<WardAgg | null>(null);
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
    return {
      kv5: buildBoard(kvRows, "KV5"),
      kv6: buildBoard(kvRows, "KV6"),
      all: kvRows.length,
      kv5n: kvRows.filter((r) => r.area === "KV5").length,
      kv6n: kvRows.filter((r) => r.area === "KV6").length,
    };
  }, [rows]);

  const filteredBoards = useMemo(() => ({
    kv5: filterBoard(boards.kv5, query, cot, heat),
    kv6: filterBoard(boards.kv6, query, cot, heat),
  }), [boards, query, cot, heat]);

  const selectedOrders = useMemo(() => {
    if (!selected) return [];
    const q = normalize(query);
    return rows
      .filter((row) =>
        row.area === selected.area &&
        (row.district || UNKNOWN_DISTRICT) === selected.district &&
        (row.ward || UNKNOWN_WARD) === selected.ward &&
        (cot === "all" || cotBucket(row.cot_group) === cot) &&
        (!q || normalize(`${row.shipment_id} ${row.zone_id} ${row.cot_group} ${row.order_type}`).includes(q)),
      )
      .sort((a, b) => toTime(b.received_time) - toTime(a.received_time));
  }, [rows, selected, query, cot]);

  const pageCount = Math.max(1, Math.ceil(selectedOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageOrders = selectedOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const hotCount = [...boards.kv5, ...boards.kv6].reduce((n, d) => n + d.wards.filter((w) => heatLevel(visibleTotal(w, "all")) === "red").length, 0);

  const toggleDistrict = (key: string) => {
    setOpenDistricts((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="dashboard-control mx-auto max-w-[1680px] space-y-4">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Tồn LMHub · ưu tiên phường nóng</div>
          <h1>Tồn khu vực</h1>
          <p>Nhìn quận trước, bung phường khi cần. Mặc định chỉ hiện phường đỏ. Bấm phường là ra đơn.</p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /><span>Làm mới</span>
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Tổng tồn" value={boards.all} hint={formatDateTime(snapshotAt)} />
        <Stat label="KV5" value={boards.kv5n} hint={`${boards.kv5.length} quận`} />
        <Stat label="KV6" value={boards.kv6n} hint={`${boards.kv6.length} quận`} />
        <Stat label="Phường đỏ" value={hotCount} hint="≥ 36 đơn" danger />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Tìm quận, phường, mã đơn…" className="pl-9" />
        </span>
        <ToggleGroup value={cot} onChange={setCot} options={[{ id: "all", label: "Cả COT" }, { id: "cot1", label: "COT 1" }, { id: "cot2", label: "COT 2" }]} />
        <ToggleGroup value={heat} onChange={setHeat} options={[{ id: "hot", label: "Chỉ phường đỏ" }, { id: "all", label: "Tất cả phường" }]} />
        <HeatLegend />
      </div>
      {error ? <div role="alert" className="dashboard-error">{error}</div> : null}

      {loading && !rows.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
          <div className="h-80 animate-pulse rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <AreaColumn title="Khu vực 5" tone="navy" districts={filteredBoards.kv5} openDistricts={openDistricts} onToggle={toggleDistrict} selected={selected} onSelect={(ward) => { setSelected(ward); setPage(1); }} cot={cot} />
          <AreaColumn title="Khu vực 6" tone="sky" districts={filteredBoards.kv6} openDistricts={openDistricts} onToggle={toggleDistrict} selected={selected} onSelect={(ward) => { setSelected(ward); setPage(1); }} cot={cot} />
        </div>
      )}

      {selected ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-base font-bold text-slate-950">{selected.ward}</h2>
              <p className="text-sm text-slate-500">{selected.area} · {selected.district} · {selectedOrders.length.toLocaleString("vi-VN")} đơn</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setSelected(null)}><X size={16} /> Đóng</Button>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[840px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2">Mã vận đơn</th>
                  <th className="px-3 py-2">Zone</th>
                  <th className="px-3 py-2">Loại</th>
                  <th className="px-3 py-2">COT</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2 text-right">Về hub</th>
                </tr>
              </thead>
              <tbody>
                {!pageOrders.length ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Không có đơn khớp lọc.</td></tr>
                ) : pageOrders.map((row) => (
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

function AreaColumn({ title, tone, districts, openDistricts, onToggle, selected, onSelect, cot }: {
  title: string; tone: "navy" | "sky"; districts: DistrictAgg[]; openDistricts: Set<string>; onToggle: (key: string) => void; selected: WardAgg | null; onSelect: (ward: WardAgg) => void; cot: CotFilter;
}) {
  const head = tone === "navy" ? "bg-[#123a8a]" : "bg-[#2f7eb8]";
  const total = districts.reduce((n, d) => n + visibleTotal(d.totals, cot), 0);
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className={cn("flex items-center justify-between px-4 py-3 text-white", head)}>
        <h2 className="text-sm font-black tracking-wide">{title}</h2>
        <span className="font-mono text-sm font-bold">{total.toLocaleString("vi-VN")} đơn</span>
      </div>
      <div className="divide-y divide-slate-100">
        {!districts.length ? <p className="px-4 py-8 text-center text-sm text-slate-500">Không còn dòng khớp lọc.</p> : null}
        {districts.map((district) => {
          const key = `${district.area}::${district.district}`;
          const open = openDistricts.has(key) || Boolean(querySafe(district));
          return (
            <article key={key}>
              <button type="button" onClick={() => onToggle(key)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50">
                <ChevronDown size={16} className={cn("shrink-0 text-slate-400 transition", open && "rotate-180")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-slate-900">{district.district}</span>
                  <span className="text-xs text-slate-500">{district.wards.length} phường · COT1 {visibleCount(district.totals, "cot1", cot)} · COT2 {visibleCount(district.totals, "cot2", cot)}</span>
                </span>
                <HeatBadge value={visibleTotal(district.totals, cot)} />
              </button>
              {open ? (
                <ul className="bg-slate-50/70 px-2 pb-2">
                  {district.wards.map((ward) => {
                    const active = selected?.area === ward.area && selected.district === ward.district && selected.ward === ward.ward;
                    return (
                      <li key={ward.ward}>
                        <button type="button" onClick={() => onSelect(ward)} className={cn("mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-white", active && "bg-white ring-2 ring-blue-500")}>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{ward.ward}</span>
                          <span className="hidden text-[11px] text-slate-500 sm:inline">C1 {visibleCount(ward, "cot1", cot)}</span>
                          <span className="hidden text-[11px] text-slate-500 sm:inline">C2 {visibleCount(ward, "cot2", cot)}</span>
                          <HeatBadge value={visibleTotal(ward, cot)} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function querySafe(_district: DistrictAgg) { return false; }
function Stat({ label, value, hint, danger }: { label: string; value: number; hint: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-black tabular-nums", danger ? "text-rose-600" : "text-slate-950")}>{value.toLocaleString("vi-VN")}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}
function HeatBadge({ value }: { value: number }) {
  return <span className={cn("min-w-12 rounded-full px-2 py-0.5 text-center font-mono text-xs font-black", heatClass(value))}>{value.toLocaleString("vi-VN")}</span>;
}
function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-950">1–5</span>
      <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[11px] font-bold text-amber-950">6–20</span>
      <span className="rounded-full bg-orange-300 px-2 py-0.5 text-[11px] font-bold text-orange-950">21–35</span>
      <span className="rounded-full bg-rose-400 px-2 py-0.5 text-[11px] font-bold text-rose-950">36+</span>
    </div>
  );
}
function ToggleGroup<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex rounded-xl border border-slate-200 bg-white p-1">
      {options.map((option) => (
        <button key={option.id} type="button" onClick={() => onChange(option.id)} className={cn("rounded-lg px-2.5 py-1 text-xs font-bold", value === option.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50")}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
function filterBoard(districts: DistrictAgg[], query: string, cot: CotFilter, heat: HeatFilter): DistrictAgg[] {
  const q = normalize(query);
  return districts.map((district) => {
    const wards = district.wards.filter((ward) => visibleTotal(ward, cot) > 0).filter((ward) => heat === "all" || heatLevel(visibleTotal(ward, cot)) === "red").filter((ward) => !q || normalize(`${ward.district} ${ward.ward}`).includes(q)).sort((a, b) => visibleTotal(b, cot) - visibleTotal(a, cot));
    const totals = wards.reduce((sum, ward) => addCounts(sum, ward), emptyCounts());
    return { ...district, wards, totals };
  }).filter((district) => district.wards.length > 0).sort((a, b) => visibleTotal(b.totals, cot) - visibleTotal(a.totals, cot));
}
function visibleTotal(counts: Counts, cot: CotFilter) {
  if (cot === "cot1") return counts.cot1;
  if (cot === "cot2") return counts.cot2;
  return counts.total;
}
function visibleCount(counts: Counts, key: "cot1" | "cot2", cot: CotFilter) {
  if (cot !== "all" && cot !== key) return 0;
  return counts[key];
}
function heatLevel(value: number) {
  if (value <= 0) return "none";
  if (value <= 5) return "green";
  if (value <= 20) return "yellow";
  if (value <= 35) return "orange";
  return "red";
}
function heatClass(value: number) {
  const level = heatLevel(value);
  if (level === "green") return "bg-emerald-200 text-emerald-950";
  if (level === "yellow") return "bg-amber-200 text-amber-950";
  if (level === "orange") return "bg-orange-300 text-orange-950";
  if (level === "red") return "bg-rose-400 text-rose-950";
  return "bg-slate-100 text-slate-400";
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
    const wardList: WardAgg[] = [...wards.entries()].map(([ward, counts]) => ({ ward, district, area, ...counts }));
    const totals = wardList.reduce((sum, item) => addCounts(sum, item), emptyCounts());
    return { district, area, wards: wardList, totals };
  });
}
function cotBucket(value: string): "cot1" | "cot2" {
  const text = normalize(value);
  if (text.includes("cot 1") || /\bcot\s*1\b/.test(text)) return "cot1";
  return "cot2";
}
function emptyCounts(): Counts { return { cot1: 0, cot2: 0, total: 0 }; }
function addCounts(a: Counts, b: Counts): Counts { return { cot1: a.cot1 + b.cot1, cot2: a.cot2 + b.cot2, total: a.total + b.total }; }
function normalizeArea(value: string): Area | string {
  const key = normalize(String(value ?? "")).replace(/\s+/g, " ");
  if (key === "kv5" || key === "khu vuc 5" || key === "khuvuc5" || key === "area 5") return "KV5";
  if (key === "kv6" || key === "khu vuc 6" || key === "khuvuc6" || key === "area 6") return "KV6";
  return String(value ?? "").trim();
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
