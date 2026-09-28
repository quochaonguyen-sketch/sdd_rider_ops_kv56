/* LMHub Inventory · drill-down: khu vuc -> quan -> phuong -> don */
"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  PackageCheck,
  RefreshCcw,
  Search,
  Truck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { KpiCard, RealtimeIndicator } from "@/components/realtime-dashboard/realtime-dashboard-view";
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

type DistrictRow = { area: Area; district: string; count: number; wards: number };
type WardRow = { ward: string; district: string; area: Area; count: number };

const PAGE_SIZE = 30;
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
  const [selectedArea, setSelectedArea] = useState<Area | "all">("all");
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedWard, setSelectedWard] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  useReportInitialDataLoading("lmhub-inventory", loading);

  const requestRef = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const supabase = createClient();
    setLoading(true);
    setError(null);

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
    const collected: InventoryRow[] = [];
    let from = 0;
    while (true) {
      const result = await supabase
        .from("lmhub_inventory_rows")
        .select(COLUMNS)
        .eq("snapshot_id", snapshotId)
        .order("shipment_id", { ascending: true })
        .range(from, from + PAGE_ROWS - 1);
      if (requestId !== requestRef.current) return;
      if (result.error) {
        setError(result.error.message);
        setLoading(false);
        return;
      }
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

  const kvRows = useMemo(
    () => rows.filter((row) => row.area === "KV5" || row.area === "KV6"),
    [rows],
  );

  const scoped = useMemo(() => {
    return kvRows.filter((row) => selectedArea === "all" || row.area === selectedArea);
  }, [kvRows, selectedArea]);

  const districtRows = useMemo<DistrictRow[]>(() => {
    const map = new Map<string, { area: Area; district: string; count: number; wards: Set<string> }>();
    for (const row of scoped) {
      const district = row.district || UNKNOWN_DISTRICT;
      const area = row.area as Area;
      const key = `${area}::${district}`;
      const entry = map.get(key) ?? { area, district, count: 0, wards: new Set<string>() };
      entry.count += 1;
      entry.wards.add(row.ward || UNKNOWN_WARD);
      map.set(key, entry);
    }
    return [...map.values()]
      .map((item) => ({ area: item.area, district: item.district, count: item.count, wards: item.wards.size }))
      .sort((a, b) => b.count - a.count || a.district.localeCompare(b.district, "vi"));
  }, [scoped]);

  const wardRows = useMemo<WardRow[]>(() => {
    if (!selectedDistrict) return [];
    const map = new Map<string, WardRow>();
    for (const row of scoped) {
      if ((row.district || UNKNOWN_DISTRICT) !== selectedDistrict) continue;
      if (selectedArea !== "all" && row.area !== selectedArea) continue;
      const ward = row.ward || UNKNOWN_WARD;
      const entry = map.get(ward) ?? {
        ward,
        district: selectedDistrict,
        area: row.area as Area,
        count: 0,
      };
      entry.count += 1;
      map.set(ward, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.ward.localeCompare(b.ward, "vi"));
  }, [scoped, selectedDistrict, selectedArea]);

  const orderRows = useMemo(() => {
    if (!selectedDistrict || !selectedWard) return [];
    const q = normalize(query);
    return scoped
      .filter((row) =>
        (row.district || UNKNOWN_DISTRICT) === selectedDistrict &&
        (row.ward || UNKNOWN_WARD) === selectedWard &&
        (!q || normalize(`${row.shipment_id} ${row.zone_id} ${row.cot_group} ${row.order_type}`).includes(q)),
      )
      .sort((a, b) => toTime(b.received_time) - toTime(a.received_time) || a.shipment_id.localeCompare(b.shipment_id));
  }, [scoped, selectedDistrict, selectedWard, query]);

  const totals = useMemo(() => ({
    all: kvRows.length,
    kv5: kvRows.filter((row) => row.area === "KV5").length,
    kv6: kvRows.filter((row) => row.area === "KV6").length,
    districts: districtRows.length,
  }), [kvRows, districtRows.length]);

  const pageCount = Math.max(1, Math.ceil(orderRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageOrders = orderRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openDistrict = (district: string, area: Area) => {
    setSelectedArea(area);
    setSelectedDistrict(district);
    setSelectedWard(null);
    setQuery("");
    setPage(1);
  };
  const openWard = (ward: string) => {
    setSelectedWard(ward);
    setQuery("");
    setPage(1);
  };
  const backToDistricts = () => {
    setSelectedDistrict(null);
    setSelectedWard(null);
    setQuery("");
    setPage(1);
  };
  const backToWards = () => {
    setSelectedWard(null);
    setQuery("");
    setPage(1);
  };

  const level = selectedWard ? "orders" : selectedDistrict ? "wards" : "districts";

  return (
    <div className="dashboard-control mx-auto max-w-[1600px] space-y-6">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Tồn LMHub · khoan sâu khu vực → quận → phường</div>
          <h1>Tồn khu vực</h1>
          <p>Bấm quận để xem phường còn tồn, bấm phường để xem từng đơn. Số liệu lấy toàn bộ snapshot (không cắt 1.000 dòng).</p>
        </div>
        <div className="dashboard-command-actions">
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /><span>Làm mới</span>
          </Button>
        </div>
      </header>

      <div className="dashboard-readout-strip">
        <RealtimeIndicator snapshotAt={snapshotAt} loading={loading} />
        <span className="hidden sm:inline">Snapshot lúc {formatDateTime(snapshotAt)} · {rows.length.toLocaleString("vi-VN")} dòng</span>
      </div>
      {error ? <div role="alert" className="dashboard-error">{error}</div> : null}

      <section aria-label="Chỉ số tồn" className="grid grid-cols-12 gap-3">
        <button type="button" className="col-span-6 lg:col-span-3 text-left" onClick={() => { setSelectedArea("all"); backToDistricts(); }}>
          <KpiCard icon={PackageCheck} label="Tồn KV5 + KV6" value={totals.all} helper={`${totals.districts} quận đang tồn`} tone="blue" loading={loading} />
        </button>
        <button type="button" className="col-span-6 lg:col-span-3 text-left" onClick={() => { setSelectedArea("KV5"); backToDistricts(); }}>
          <KpiCard icon={Truck} label="Tồn KV5" value={totals.kv5} helper={selectedArea === "KV5" ? "Đang lọc KV5" : "Bấm để lọc KV5"} tone="blue" loading={loading} />
        </button>
        <button type="button" className="col-span-6 lg:col-span-3 text-left" onClick={() => { setSelectedArea("KV6"); backToDistricts(); }}>
          <KpiCard icon={Truck} label="Tồn KV6" value={totals.kv6} helper={selectedArea === "KV6" ? "Đang lọc KV6" : "Bấm để lọc KV6"} tone="blue" loading={loading} />
        </button>
        <div className="col-span-6 lg:col-span-3">
          <KpiCard icon={MapPin} label="Đang xem" value={level === "districts" ? "Quận" : level === "wards" ? "Phường" : "Đơn"} helper={crumbText(selectedArea, selectedDistrict, selectedWard)} tone="green" loading={loading} />
        </div>
      </section>

      <nav aria-label="Đường dẫn" className="flex flex-wrap items-center gap-2 text-sm">
        <Crumb active={level === "districts"} onClick={backToDistricts}>Khu vực / quận</Crumb>
        {selectedDistrict ? (
          <>
            <span className="text-slate-300">/</span>
            <Crumb active={level === "wards"} onClick={backToWards}>{selectedDistrict}</Crumb>
          </>
        ) : null}
        {selectedWard ? (
          <>
            <span className="text-slate-300">/</span>
            <Crumb active>{selectedWard}</Crumb>
          </>
        ) : null}
      </nav>

      {level === "districts" ? (
        <DataTable
          title="Tồn theo quận"
          subtitle={`${districtRows.length} quận · bấm một dòng để xem phường`}
          loading={loading}
          empty="Chưa có dữ liệu tồn KV5/KV6."
          headers={["Khu vực", "Quận", "Số phường", "Đơn tồn"]}
          rows={districtRows.map((item) => ({
            key: `${item.area}-${item.district}`,
            cells: [item.area, item.district, String(item.wards), item.count.toLocaleString("vi-VN")],
            onClick: () => openDistrict(item.district, item.area),
          }))}
        />
      ) : null}

      {level === "wards" ? (
        <DataTable
          title={`Phường còn tồn · ${selectedDistrict}`}
          subtitle={`${wardRows.length} phường · bấm một dòng để xem đơn`}
          loading={loading}
          empty="Quận này không còn đơn tồn."
          headers={["Phường", "Khu vực", "Đơn tồn"]}
          rows={wardRows.map((item) => ({
            key: item.ward,
            cells: [item.ward, item.area, item.count.toLocaleString("vi-VN")],
            onClick: () => openWard(item.ward),
          }))}
        />
      ) : null}

      {level === "orders" ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
            <div>
              <h2 className="text-base font-bold text-slate-950">Đơn còn tồn · {selectedWard}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{orderRows.length.toLocaleString("vi-VN")} đơn tại {selectedDistrict}</p>
            </div>
            <span className="relative block w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Mã đơn, zone, COT" className="pl-9" />
            </span>
          </div>
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full min-w-[920px] table-fixed text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-600 shadow-[0_1px_0_#e2e8f0]">
                <tr>
                  <th className="px-4 py-3 w-[26%]">Mã vận đơn</th>
                  <th className="px-4 py-3 w-[16%]">Zone</th>
                  <th className="px-4 py-3 w-[12%]">Loại</th>
                  <th className="px-4 py-3 w-[18%]">COT</th>
                  <th className="px-4 py-3 w-[14%]">Trạng thái</th>
                  <th className="px-4 py-3 w-[14%] text-right">Về hub</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && !pageOrders.length ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">Đang tải…</td></tr>
                ) : !pageOrders.length ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">Không có đơn khớp tìm kiếm.</td></tr>
                ) : pageOrders.map((row) => (
                  <tr key={row.shipment_id} className="h-14">
                    <td className="px-4 font-mono text-[13px] font-semibold text-slate-900">{row.shipment_id}</td>
                    <td className="truncate px-4 text-slate-600">{row.zone_id || "—"}</td>
                    <td className="px-4 text-slate-700">{row.order_type || "—"}</td>
                    <td className="truncate px-4 text-slate-600">{row.cot_group || "—"}</td>
                    <td className="truncate px-4 text-slate-700">{row.status || "—"}</td>
                    <td className="px-4 text-right font-mono text-xs tabular-nums text-slate-600">{formatDateTime(row.received_time)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm">
            <span className="text-slate-500">Trang {safePage}/{pageCount} · {orderRows.length.toLocaleString("vi-VN")} đơn</span>
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

const DataTable = memo(function DataTable({
  title, subtitle, headers, rows, loading, empty,
}: {
  title: string;
  subtitle: string;
  headers: string[];
  rows: { key: string; cells: string[]; onClick: () => void }[];
  loading: boolean;
  empty: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-4">
        <h2 className="text-base font-bold text-slate-950">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-600">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-semibold">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && !rows.length ? (
              <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-slate-500">Đang tải…</td></tr>
            ) : !rows.length ? (
              <tr><td colSpan={headers.length} className="px-4 py-10 text-center text-slate-500">{empty}</td></tr>
            ) : rows.map((row) => (
              <tr key={row.key} onClick={row.onClick} className="cursor-pointer hover:bg-blue-50/70">
                {row.cells.map((cell, index) => (
                  <td key={`${row.key}-${index}`} className={cn("px-4 py-3", index === row.cells.length - 1 && "font-mono font-semibold tabular-nums text-slate-900")}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
});

function Crumb({ children, onClick, active }: { children: string; onClick?: () => void; active?: boolean }) {
  if (!onClick) return <span className="font-semibold text-slate-900">{children}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", active ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800")}
    >
      {children}
    </button>
  );
}

function crumbText(area: Area | "all", district: string | null, ward: string | null) {
  if (ward) return ward;
  if (district) return district;
  return area === "all" ? "Tất cả khu vực" : area;
}

function normalizeArea(value: string): Area | string {
  const raw = String(value ?? "").trim();
  const key = normalize(raw).replace(/\s+/g, " ");
  if (key === "kv5" || key === "khu vuc 5" || key === "khuvuc5" || key === "area 5") return "KV5";
  if (key === "kv6" || key === "khu vuc 6" || key === "khuvuc6" || key === "area 6") return "KV6";
  return raw;
}

function normalizeRow(row: InventoryRow): InventoryRow {
  return {
    ...row,
    shipment_id: String(row.shipment_id ?? "").trim(),
    ward: String(row.ward ?? "").trim(),
    district: String(row.district ?? "").trim(),
    area: normalizeArea(String(row.area ?? "")),
    zone_id: String(row.zone_id ?? "").trim(),
    status: String(row.status ?? "").trim(),
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
