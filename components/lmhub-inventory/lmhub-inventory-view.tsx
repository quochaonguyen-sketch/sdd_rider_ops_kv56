/* LMHub Inventory · Ton khu vuc KV5 + KV6
 * Nguon: SPX_Launcher jobs/order_tracking_lmhub_received.py -> build_output_legacy()
 *   14 cot: shipment_id, create_time, delivering_time, received_time, report_date,
 *   ward, district, area, zone, status, driver_id, driver_name, order_type, cot_group.
 *   + snapshot_id/snapshot_at do job tu sinh moi vong (REPLACE = chi doc snapshot moi nhat).
 * Ton KV5/KV6 = rows co area in ('KV5','KV6'). `area`/`ward`/`district`/`zone` da map
 * qua Coverage SA theo zone_id trong file (zone uu tien, ward-based chi de detect ward moi).
 */
"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  PackageCheck,
  RefreshCcw,
  Search,
  Truck,
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

type InventoryRow = {
  snapshot_id: string;
  snapshot_at: string | null;
  shipment_id: string;
  create_time: string | null;
  delivering_time: string | null;
  received_time: string | null;
  report_date: string | null;
  ward: string;
  district: string;
  area: string;
  zone_id: string;
  status: string;
  driver_id: string;
  driver_name: string;
  order_type: string;
  cot_group: string;
};

type Filters = { area: AreaFilter; ward: string; district: string; status: string };
type SortKey = "received" | "shipment" | "ward" | "district" | "status";
type Sort = { key: SortKey; direction: "asc" | "desc" };

const AREAS: readonly Area[] = ["KV5", "KV6"];
const PAGE_SIZE = 20;
const FETCH_LIMIT = 20000;
const RELOAD_DEBOUNCE_MS = 1500;
const COLUMNS =
  "snapshot_id,snapshot_at,shipment_id,create_time,delivering_time,received_time,report_date,ward,district,area,zone_id,status,driver_id,driver_name,order_type,cot_group";
const UNKNOWN = "Chưa xác định";

export function LmhubInventoryView() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ area: "all", ward: "all", district: "all", status: "all" });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "received", direction: "desc" });
  const [page, setPage] = useState(1);
  useReportInitialDataLoading("lmhub-inventory", loading);

  const requestRef = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const supabase = createClient();
    setLoading(true);
    setError(null);
    // REPLACE snapshot: lay snapshot moi nhat roi doc rows cua no (KV5/KV6 + ton chung de doi area).
    const latest = await supabase
      .from("lmhub_inventory_rows")
      .select("snapshot_id,snapshot_at")
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (requestId !== requestRef.current) return;
    if (latest.error) {
      setError(latest.error.message);
      setRows([]);
      setSnapshotAt(null);
      setLoading(false);
      return;
    }
    if (!latest.data) {
      setRows([]);
      setSnapshotAt(null);
      setLoading(false);
      return;
    }
    const snapshotId = (latest.data as { snapshot_id: string }).snapshot_id;
    const result = await supabase
      .from("lmhub_inventory_rows")
      .select(COLUMNS)
      .eq("snapshot_id", snapshotId)
      .limit(FETCH_LIMIT);
    if (requestId !== requestRef.current) return;
    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    setRows(((result.data ?? []) as InventoryRow[]).map(normalizeRow));
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

  const updateFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === "area") { next.ward = "all"; next.district = "all"; }
      return next;
    });
    setPage(1);
  }, []);
  const resetFilters = useCallback(() => {
    setFilters({ area: "all", ward: "all", district: "all", status: "all" });
    setQuery("");
    setPage(1);
  }, []);

  const kvRows = useMemo(() => rows.filter((row) => row.area === "KV5" || row.area === "KV6"), [rows]);
  const options = useMemo(() => {
    const inArea = (row: InventoryRow) => filters.area === "all" || row.area === filters.area;
    const wards = new Set<string>();
    const districts = new Set<string>();
    const statuses = new Set<string>();
    for (const row of kvRows) {
      if (!inArea(row)) continue;
      if (row.ward) wards.add(row.ward);
      if (row.district) districts.add(row.district);
      if (row.status) statuses.add(row.status);
    }
    const sorted = (set: Set<string>) => [...set].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
    return { wards: sorted(wards), districts: sorted(districts), statuses: sorted(statuses) };
  }, [kvRows, filters.area]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    const out = kvRows.filter((row) =>
      (filters.area === "all" || row.area === filters.area) &&
      (filters.ward === "all" || row.ward === filters.ward) &&
      (filters.district === "all" || row.district === filters.district) &&
      (filters.status === "all" || row.status === filters.status) &&
      (!q || normalize(`${row.shipment_id} ${row.driver_id} ${row.driver_name} ${row.zone_id} ${row.ward} ${row.district}`).includes(q)),
    );
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...out].sort((a, b) => {
      if (sort.key === "shipment") return a.shipment_id.localeCompare(b.shipment_id, "vi", { numeric: true }) * dir;
      if (sort.key === "ward") return a.ward.localeCompare(b.ward, "vi") * dir || a.shipment_id.localeCompare(b.shipment_id) * dir;
      if (sort.key === "district") return a.district.localeCompare(b.district, "vi") * dir || a.shipment_id.localeCompare(b.shipment_id) * dir;
      if (sort.key === "status") return a.status.localeCompare(b.status, "vi") * dir || a.shipment_id.localeCompare(b.shipment_id) * dir;
      return (toTime(b.received_time) - toTime(a.received_time)) * (sort.direction === "asc" ? -1 : 1) || a.shipment_id.localeCompare(b.shipment_id);
    });
  }, [kvRows, filters, query, sort]);

  const totals = useMemo(() => ({
    all: kvRows.length,
    kv5: kvRows.filter((row) => row.area === "KV5").length,
    kv6: kvRows.filter((row) => row.area === "KV6").length,
    assigned: kvRows.filter((row) => row.driver_id !== "").length,
  }), [kvRows]);

  const wardTotals = useMemo(() => {
    const map = new Map<string, { ward: string; area: string; count: number }>();
    for (const row of filtered) {
      const key = row.ward || UNKNOWN;
      const entry = map.get(key) ?? { ward: key, area: row.area, count: 0 };
      entry.count += 1;
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.ward.localeCompare(b.ward, "vi"));
  }, [filtered]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage]);
  const hasFilter = filters.area !== "all" || filters.ward !== "all" || filters.district !== "all" || filters.status !== "all" || query.trim() !== "";

  const toggleSort = useCallback((key: SortKey) => {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "received" ? "desc" : "asc" });
    setPage(1);
  }, []);

  return (
    <div className="dashboard-control mx-auto max-w-[1600px] space-y-6">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Tồn LMHub · KV5 + KV6 · theo phường / quận</div>
          <h1>Tồn khu vực</h1>
          <p>Hàng đã về LMHub (có received_time) từ job order_tracking_lmhub_received · REPLACE theo snapshot mới nhất · area map từ Coverage SA.</p>
        </div>
        <div className="dashboard-command-actions">
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /><span>Làm mới</span>
          </Button>
        </div>
      </header>

      <div className="dashboard-readout-strip">
        <RealtimeIndicator snapshotAt={snapshotAt} loading={loading} />
        <span className="hidden sm:inline">Snapshot lúc {formatDateTime(snapshotAt)} · {rows.length.toLocaleString("vi-VN")} dòng snapshot</span>
      </div>
      {error ? <div role="alert" className="dashboard-error">{error}</div> : null}

      <section aria-label="Chỉ số tồn" className="grid grid-cols-12 gap-3">
        <KpiCard className="col-span-6 lg:col-span-3" icon={PackageCheck} label="Tồn KV5 + KV6" value={totals.all} helper={`${totals.kv5} KV5 · ${totals.kv6} KV6`} tone="blue" loading={loading} />
        <KpiCard className="col-span-6 lg:col-span-3" icon={Truck} label="Tồn KV5" value={totals.kv5} helper="Lọc nhanh KV5" tone="blue" loading={loading} />
        <KpiCard className="col-span-6 lg:col-span-3" icon={Truck} label="Tồn KV6" value={totals.kv6} helper="Lọc nhanh KV6" tone="blue" loading={loading} />
        <KpiCard className="col-span-6 lg:col-span-3" icon={MapPin} label="Đã gán rider" value={totals.assigned} helper={`${totals.all - totals.assigned} chưa gán`} tone={totals.all - totals.assigned ? "red" : "green"} loading={loading} />
      </section>

      <FilterPanel
        filters={filters} query={query} options={options} hasFilter={hasFilter}
        onArea={(value) => updateFilter("area", value)}
        onWard={(value) => updateFilter("ward", value)}
        onDistrict={(value) => updateFilter("district", value)}
        onStatus={(value) => updateFilter("status", value)}
        onQuery={(value) => { setQuery(value); setPage(1); }}
        onReset={resetFilters}
      />

      <div className="grid grid-cols-12 gap-6">
        <section aria-label="Tồn theo phường" className="col-span-12 xl:col-span-5">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <h2 className="text-base font-bold text-slate-950">Tồn theo phường</h2>
              <p className="mt-0.5 text-sm text-slate-500">{wardTotals.length} phường · chọn để lọc</p>
            </div>
            <div className="max-h-[560px] min-h-[280px] flex-1 divide-y divide-slate-100 overflow-auto">
              {loading && !wardTotals.length
                ? Array.from({ length: 6 }, (_, i) => <div key={i} className="m-4 h-10 animate-pulse rounded bg-slate-100" />)
                : !wardTotals.length
                  ? <p className="p-8 text-center text-sm text-slate-500">Chưa có dữ liệu tồn KV5/KV6.</p>
                  : wardTotals.map((item) => (
                    <button
                      key={item.ward} type="button" aria-pressed={filters.ward === item.ward}
                      onClick={() => updateFilter("ward", filters.ward === item.ward ? "all" : item.ward)}
                      className={cn("block w-full px-4 py-3 text-left transition-colors hover:bg-blue-50/50", filters.ward === item.ward && "bg-blue-50")}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">{item.ward}</span>
                        <span className="font-mono text-xs tabular-nums text-slate-600">{item.count} đơn</span>
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">{item.area || "—"}</div>
                    </button>
                  ))}
            </div>
          </div>
        </section>

        <section aria-label="Chi tiết tồn" className="col-span-12 xl:col-span-7">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 p-4">
              <h2 className="text-base font-bold text-slate-950">Chi tiết tồn</h2>
              <p className="mt-0.5 text-sm text-slate-500">Hiển thị {filtered.length}/{totals.all} đơn KV5 + KV6 theo bộ lọc</p>
            </div>
            <div className="max-h-[560px] min-h-[280px] overflow-auto">
              <table className="w-full min-w-[860px] table-fixed text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-600 shadow-[0_1px_0_#e2e8f0]">
                  <tr>
                    <SortHeader label="Mã vận đơn" sortKey="shipment" current={sort} onSort={toggleSort} className="w-[24%]" />
                    <SortHeader label="Phường" sortKey="ward" current={sort} onSort={toggleSort} className="w-[20%]" />
                    <SortHeader label="Quận" sortKey="district" current={sort} onSort={toggleSort} className="w-[18%]" />
                    <SortHeader label="Trạng thái" sortKey="status" current={sort} onSort={toggleSort} className="w-[18%]" />
                    <SortHeader label="Về hub" sortKey="received" current={sort} onSort={toggleSort} align="right" className="w-[20%]" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && !pageRows.length
                    ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">Đang tải…</td></tr>
                    : !pageRows.length
                      ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">Không có đơn tồn khớp bộ lọc. Job Supabase đã chạy chưa?</td></tr>
                      : pageRows.map((row) => (
                        <tr key={row.shipment_id} className="h-14">
                          <td className="px-4">
                            <div className="truncate font-mono text-[13px] font-semibold text-slate-900" title={row.shipment_id}>{row.shipment_id}</div>
                            <div className="truncate text-xs text-slate-500">{row.driver_name || row.driver_id || "Chưa gán"} · {row.zone_id}</div>
                          </td>
                          <td className="px-4"><div className="truncate text-slate-700">{row.ward || "—"}</div><div className="text-xs text-slate-500">{row.area}</div></td>
                          <td className="truncate px-4 text-slate-700">{row.district || "—"}</td>
                          <td className="truncate px-4 text-slate-700">{row.status || "—"}</td>
                          <td className="px-4 text-right font-mono text-xs tabular-nums text-slate-600">{formatDateTime(row.received_time)}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
              <span className="text-slate-500">Trang {safePage}/{pageCount} · {filtered.length} đơn</span>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={safePage <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}><ChevronLeft size={16} /> Trước</Button>
                <Button type="button" variant="secondary" disabled={safePage >= pageCount} onClick={() => setPage((v) => Math.min(pageCount, v + 1))}>Sau <ChevronRight size={16} /></Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

const FilterPanel = memo(function FilterPanel({ filters, query, options, hasFilter, onArea, onWard, onDistrict, onStatus, onQuery, onReset }: {
  filters: Filters; query: string; options: { wards: string[]; districts: string[]; statuses: string[] }; hasFilter: boolean;
  onArea: (value: AreaFilter) => void; onWard: (value: string) => void; onDistrict: (value: string) => void;
  onStatus: (value: string) => void; onQuery: (value: string) => void; onReset: () => void;
}) {
  return (
    <section aria-label="Bộ lọc" className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <FilterField label="Khu vực">
          <Select value={filters.area} onChange={(event) => onArea(event.target.value as AreaFilter)}>
            <option value="all">KV5 + KV6</option>
            {AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Phường">
          <Select value={filters.ward} onChange={(event) => onWard(event.target.value)}>
            <option value="all">Tất cả phường</option>
            {options.wards.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Quận">
          <Select value={filters.district} onChange={(event) => onDistrict(event.target.value)}>
            <option value="all">Tất cả quận</option>
            {options.districts.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Trạng thái">
          <Select value={filters.status} onChange={(event) => onStatus(event.target.value)}>
            <option value="all">Tất cả trạng thái</option>
            {options.statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
        </FilterField>
        <FilterField label="Tìm đơn">
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <Input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Mã đơn, rider, zone" className="pl-9" />
          </span>
        </FilterField>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs font-semibold text-slate-500">Đang lọc:</span>
        <FilterChip>{filters.area === "all" ? "KV5 + KV6" : filters.area}</FilterChip>
        <FilterChip>{filters.ward === "all" ? "Mọi phường" : filters.ward}</FilterChip>
        <FilterChip>{filters.district === "all" ? "Mọi quận" : filters.district}</FilterChip>
        <FilterChip>{filters.status === "all" ? "Mọi trạng thái" : filters.status}</FilterChip>
        {hasFilter ? <button type="button" onClick={onReset} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:underline"><X size={12} />Xóa lọc</button> : null}
      </div>
    </section>
  );
});

function SortHeader({ label, sortKey, current, onSort, align, className }: {
  label: string; sortKey: SortKey; current: Sort; onSort: (key: SortKey) => void; align?: "right"; className?: string;
}) {
  const Icon = current.key !== sortKey ? ArrowUpDown : current.direction === "asc" ? ArrowUp : ArrowDown;
  return <th className={cn("px-4 py-3", className)}><button type="button" onClick={() => onSort(sortKey)} className={cn("flex items-center gap-1 font-semibold hover:text-slate-950", align === "right" && "ml-auto")}><span>{label}</span><Icon size={13} /></button></th>;
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1.5"><span className="block text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}
function FilterChip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{children}</span>;
}

function normalizeRow(row: InventoryRow): InventoryRow {
  return {
    ...row,
    shipment_id: String(row.shipment_id ?? "").trim(),
    ward: String(row.ward ?? "").trim(),
    district: String(row.district ?? "").trim(),
    area: String(row.area ?? "").trim(),
    zone_id: String(row.zone_id ?? "").trim(),
    status: String(row.status ?? "").trim(),
    driver_id: String(row.driver_id ?? "").trim(),
    driver_name: String(row.driver_name ?? "").trim(),
    order_type: String(row.order_type ?? "").trim(),
    cot_group: String(row.cot_group ?? "").trim(),
  };
}

function toTime(value: string | null): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim();
}
function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "medium", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}
