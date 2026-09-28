/* LMHub Inventory · site tokens, side-by-side KV boards */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, PackageCheck, RefreshCcw, Search, Truck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { KpiCard } from "@/components/realtime-dashboard/realtime-dashboard-view";
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
  const [heat, setHeat] = useState<HeatFilter>("all");
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
      collected.push(...((result.data ?? []) as InventoryRow[]).map(normalizeRow));
      if ((result.data ?? []).length < PAGE_ROWS) break;
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
    return { kv5: buildBoard(kvRows, "KV5"), kv6: buildBoard(kvRows, "KV6"), all: kvRows.length, kv5n: kvRows.filter((row) => row.area === "KV5").length, kv6n: kvRows.filter((row) => row.area === "KV6").length };
  }, [rows]);

  const filtered = useMemo(() => ({ kv5: filterBoard(boards.kv5, query, cot, heat), kv6: filterBoard(boards.kv6, query, cot, heat) }), [boards, query, cot, heat]);

  const selectedOrders = useMemo(() => {
    if (!selected) return [];
    const q = normalize(query);
    return rows.filter((row) => row.area === selected.area && (row.district || UNKNOWN_DISTRICT) === selected.district && (row.ward || UNKNOWN_WARD) === selected.ward && (cot === "all" || cotBucket(row.cot_group) === cot) && (!q || normalize(`${row.shipment_id} ${row.zone_id} ${row.cot_group} ${row.order_type}`).includes(q))).sort((a, b) => toTime(b.received_time) - toTime(a.received_time));
  }, [rows, selected, query, cot]);

  const pageCount = Math.max(1, Math.ceil(selectedOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageOrders = selectedOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const hotCount = [...boards.kv5, ...boards.kv6].reduce((n, d) => n + d.wards.filter((w) => heatLevel(visibleTotal(w, "all")) === "red").length, 0);

  return (
    <div className="dashboard-control mx-auto max-w-[1600px] space-y-6">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Tồn LMHub · KV5 | KV6</div>
          <h1>Tồn khu vực</h1>
          <p>Hai bảng song song. Bấm phường để xem đơn. Thời gian lấy từ snapshot tồn mới nhất.</p>
        </div>
        <div className="dashboard-command-actions">
          <div className="rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-2 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">Cập nhật gần nhất</p>
            <p className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatDateTime(snapshotAt)}</p>
            <p className="text-xs text-[var(--color-muted)]">{formatRelative(snapshotAt)}</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /><span>Làm mới</span></Button>
        </div>
      </header>
      <div className="dashboard-readout-strip">
        <span className="dashboard-live-dot" />
        Cập nhật gần nhất: {formatDateTime(snapshotAt)} · {formatRelative(snapshotAt)}
      </div>
      <section className="grid grid-cols-12 gap-3">
        <div className="col-span-6 lg:col-span-3"><KpiCard icon={PackageCheck} label="Tồn KV5 + KV6" value={boards.all} helper={formatDateTime(snapshotAt)} tone="blue" loading={loading} /></div>
        <div className="col-span-6 lg:col-span-3"><KpiCard icon={Truck} label="Tồn KV5" value={boards.kv5n} helper={`${boards.kv5.length} quận`} tone="blue" loading={loading} /></div>
        <div className="col-span-6 lg:col-span-3"><KpiCard icon={Truck} label="Tồn KV6" value={boards.kv6n} helper={`${boards.kv6.length} quận`} tone="blue" loading={loading} /></div>
        <div className="col-span-6 lg:col-span-3"><KpiCard icon={MapPin} label="Phường đỏ" value={hotCount} helper="≥ 36 đơn" tone={hotCount ? "red" : "green"} loading={loading} /></div>
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" size={16} />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Tìm quận, phường, mã đơn" className="pl-9" />
        </span>
        <Seg value={cot} onChange={setCot} options={[{ id: "all", label: "Cả COT" }, { id: "cot1", label: "COT 1" }, { id: "cot2", label: "COT 2" }]} />
        <Seg value={heat} onChange={setHeat} options={[{ id: "all", label: "Tất cả phường" }, { id: "hot", label: "Chỉ phường đỏ" }]} />
        <HeatLegend />
      </div>
      {error ? <div role="alert" className="dashboard-error">{error}</div> : null}
      {loading && !rows.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="h-[32rem] animate-pulse rounded-xl bg-[var(--color-paper-3)]" />
          <div className="h-[32rem] animate-pulse rounded-xl bg-[var(--color-paper-3)]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <AreaBoard title="Khu vực 5" districts={filtered.kv5} cot={cot} selected={selected} updatedAt={snapshotAt} onSelect={(ward) => { setSelected(ward); setPage(1); }} />
          <AreaBoard title="Khu vực 6" districts={filtered.kv6} cot={cot} selected={selected} updatedAt={snapshotAt} onSelect={(ward) => { setSelected(ward); setPage(1); }} />
        </div>
      )}
      {selected ? (
        <section className="overflow-hidden rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] px-4 py-3">
            <div>
              <h2 className="text-base font-bold text-[var(--color-ink)]">{selected.ward}</h2>
              <p className="text-sm text-[var(--color-muted)]">{selected.area} · {selected.district} · {selectedOrders.length.toLocaleString("vi-VN")} đơn</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setSelected(null)}><X size={16} /> Đóng</Button>
          </div>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="sticky top-0 bg-[var(--color-paper-2)] text-xs text-[var(--color-muted)]">
                <tr><th className="px-4 py-3">Mã vận đơn</th><th className="px-4 py-3">Zone</th><th className="px-4 py-3">Loại</th><th className="px-4 py-3">COT</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3 text-right">Về hub</th></tr>
              </thead>
              <tbody>
                {!pageOrders.length ? <tr><td colSpan={6} className="px-4 py-10 text-center text-[var(--color-muted)]">Không có đơn khớp lọc.</td></tr> : pageOrders.map((row) => (
                  <tr key={row.shipment_id} className="border-t border-[var(--color-rule)]">
                    <td className="px-4 py-3 font-mono text-[13px] font-semibold text-[var(--color-ink)]">{row.shipment_id}</td>
                    <td className="px-4 py-3 text-[var(--color-ink-2)]">{row.zone_id || "—"}</td>
                    <td className="px-4 py-3">{row.order_type || "—"}</td>
                    <td className="px-4 py-3 text-[var(--color-ink-2)]">{row.cot_group || "—"}</td>
                    <td className="px-4 py-3">{row.status || "—"}</td>
                    <td className="px-4 py-3 text-right font-mono text-xs">{formatDateTime(row.received_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-[var(--color-rule)] px-4 py-3 text-sm">
            <span className="text-[var(--color-muted)]">Trang {safePage}/{pageCount}</span>
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

function AreaBoard({ title, districts, cot, selected, onSelect, updatedAt }: { title: string; districts: DistrictAgg[]; cot: CotFilter; selected: WardAgg | null; onSelect: (ward: WardAgg) => void; updatedAt: string | null }) {
  const grand = districts.reduce((sum, item) => addCounts(sum, item.totals), emptyCounts());
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className="flex items-center justify-between bg-[var(--color-graphite)] px-4 py-3 text-[var(--color-graphite-ink)]">
        <div>
          <h2 className="text-sm font-bold tracking-tight">{title}</h2>
          <p className="text-[11px] font-medium text-[var(--color-graphite-ink)]/70">Cập nhật {formatDateTime(updatedAt)}</p>
        </div>
        <span className="font-mono text-sm font-semibold">{visibleTotal(grand, cot).toLocaleString("vi-VN")} đơn</span>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--color-paper-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Quận / Phường</th>
              <th className="w-20 px-3 py-2.5 text-right font-semibold">COT 1</th>
              <th className="w-20 px-3 py-2.5 text-right font-semibold">COT 2</th>
              <th className="w-24 px-3 py-2.5 text-right font-semibold">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {!districts.length ? <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">Không có dòng khớp lọc.</td></tr> : districts.map((district) => <DistrictRows key={`${district.area}-${district.district}`} district={district} cot={cot} selected={selected} onSelect={onSelect} />)}
            {districts.length ? (
              <tr className="border-t border-[var(--color-rule-strong)] bg-[var(--color-paper-3)]">
                <td className="px-4 py-3 font-bold text-[var(--color-ink)]">Tổng {title}</td>
                <td className="px-3 py-3 text-right font-mono font-bold">{visibleCount(grand, "cot1", cot).toLocaleString("vi-VN")}</td>
                <td className="px-3 py-3 text-right font-mono font-bold">{visibleCount(grand, "cot2", cot).toLocaleString("vi-VN")}</td>
                <HeatCell value={visibleTotal(grand, cot)} strong />
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DistrictRows({ district, cot, selected, onSelect }: { district: DistrictAgg; cot: CotFilter; selected: WardAgg | null; onSelect: (ward: WardAgg) => void }) {
  return (
    <>
      <tr className="border-t border-[var(--color-rule)] bg-[var(--color-accent-soft)]">
        <td className="px-4 py-2.5 font-bold text-[var(--color-accent)]">{district.district}</td>
        <td className="px-3 py-2.5 text-right font-mono font-semibold text-[var(--color-ink)]">{visibleCount(district.totals, "cot1", cot).toLocaleString("vi-VN")}</td>
        <td className="px-3 py-2.5 text-right font-mono font-semibold text-[var(--color-ink)]">{visibleCount(district.totals, "cot2", cot).toLocaleString("vi-VN")}</td>
        <HeatCell value={visibleTotal(district.totals, cot)} strong />
      </tr>
      {district.wards.map((ward) => {
        const active = selected?.area === ward.area && selected.district === ward.district && selected.ward === ward.ward;
        return (
          <tr key={ward.ward} onClick={() => onSelect(ward)} className={cn("cursor-pointer border-t border-[var(--color-rule)] hover:bg-[var(--color-paper-2)]", active && "bg-[var(--color-accent-soft)]")}>
            <td className="px-4 py-2.5 pl-8 text-[var(--color-ink)]">{ward.ward}</td>
            <td className="px-3 py-2.5 text-right font-mono text-[var(--color-ink-2)]">{visibleCount(ward, "cot1", cot).toLocaleString("vi-VN")}</td>
            <td className="px-3 py-2.5 text-right font-mono text-[var(--color-ink-2)]">{visibleCount(ward, "cot2", cot).toLocaleString("vi-VN")}</td>
            <HeatCell value={visibleTotal(ward, cot)} />
          </tr>
        );
      })}
    </>
  );
}
function HeatCell({ value, strong }: { value: number; strong?: boolean }) {
  return <td className={cn("px-3 py-2.5 text-right font-mono", heatClass(value), strong && "font-bold")}>{value.toLocaleString("vi-VN")}</td>;
}
function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
      <span className="rounded-md bg-[var(--color-success-soft)] px-2 py-1 text-[var(--color-success)]">1–5 ít</span>
      <span className="rounded-md bg-[var(--color-warning-soft)] px-2 py-1 text-[var(--color-warning)]">6–20 vừa</span>
      <span className="rounded-md bg-[var(--color-warning-soft)] px-2 py-1 text-[var(--color-warning)]">21–35 cao</span>
      <span className="rounded-md bg-[var(--color-error-soft)] px-2 py-1 text-[var(--color-error)]">36+ đỏ</span>
    </div>
  );
}
function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper)] p-1">
      {options.map((option) => (
        <button key={option.id} type="button" onClick={() => onChange(option.id)} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", value === option.id ? "bg-[var(--color-graphite)] text-[var(--color-graphite-ink)]" : "text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)]")}>
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
    return { ...district, wards, totals: wards.reduce((sum, ward) => addCounts(sum, ward), emptyCounts()) };
  }).filter((district) => district.wards.length > 0).sort((a, b) => visibleTotal(b.totals, cot) - visibleTotal(a.totals, cot));
}
function visibleTotal(counts: Counts, cot: CotFilter) { if (cot === "cot1") return counts.cot1; if (cot === "cot2") return counts.cot2; return counts.total; }
function visibleCount(counts: Counts, key: "cot1" | "cot2", cot: CotFilter) { if (cot !== "all" && cot !== key) return 0; return counts[key]; }
function heatLevel(value: number) { if (value <= 0) return "none"; if (value <= 5) return "green"; if (value <= 20) return "yellow"; if (value <= 35) return "orange"; return "red"; }
function heatClass(value: number) {
  const level = heatLevel(value);
  if (level === "green") return "bg-[var(--color-success-soft)] text-[var(--color-success)]";
  if (level === "yellow") return "bg-[var(--color-warning-soft)] text-[var(--color-warning)]";
  if (level === "orange") return "bg-[var(--color-warning-soft)] text-[var(--color-warning)]";
  if (level === "red") return "bg-[var(--color-error-soft)] text-[var(--color-error)]";
  return "text-[var(--color-muted)]";
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
    return { district, area, wards: wardList, totals: wardList.reduce((sum, item) => addCounts(sum, item), emptyCounts()) };
  });
}
function cotBucket(value: string): "cot1" | "cot2" { const text = normalize(value); return text.includes("cot 1") || /\bcot\s*1\b/.test(text) ? "cot1" : "cot2"; }
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
function formatRelative(value: string | null): string {
  if (!value) return "Chưa có snapshot";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Chưa có snapshot";
  const diff = Date.now() - date.getTime();
  if (diff < 30_000) return "vừa xong";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}
