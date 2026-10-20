/* LMHub Inventory · ops dashboard with stock charts */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, MapPin, PackageCheck, RefreshCcw, Search, Truck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart, ChartHead, RiskStrip } from "@/components/lmhub-inventory/lmhub-inventory-charts";
import { HeatLegend, Seg } from "@/components/lmhub-inventory/lmhub-inventory-boards";
import { DeliveryInventoryBoard } from "@/components/lmhub-inventory/delivery-inventory-board";
import { operationalDistrict } from "@/lib/locations/operational-districts";
import {
  COLUMNS,
  PAGE_ROWS,
  PAGE_SIZE,
  RELOAD_DEBOUNCE_MS,
  UNKNOWN_DISTRICT,
  UNKNOWN_WARD,
  buildAnalytics,
  buildDeliveryDistrictBoards,
  cotBucket,
  deliveryInventoryRows,
  deliveryDistrictLabel,
  filterBoard,
  formatDateTime,
  formatRelative,
  normalize,
  normalizeRow,
  toTime,
  visibleTotal,
  type CotFilter,
  type HeatFilter,
  type InventoryFocus,
  type InventoryRow,
} from "@/components/lmhub-inventory/lmhub-inventory-model";

export function LmhubInventoryView({ canQueue = false }: { canQueue?: boolean }) {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cot, setCot] = useState<CotFilter>("all");
  const [heat, setHeat] = useState<HeatFilter>("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [excludedThuDuc, setExcludedThuDuc] = useState(0);
  const [selected, setSelected] = useState<InventoryFocus | null>(null);
  const [page, setPage] = useState(1);
  const [queueing, setQueueing] = useState(false);
  const [waitingSnapshot, setWaitingSnapshot] = useState(false);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const [queueMeta, setQueueMeta] = useState<{ pending: number; running: number; lastStatus: string; lastMessage: string } | null>(null);
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
    const scopedRows = deliveryInventoryRows(collected);
    setExcludedThuDuc(collected.filter((row) => operationalDistrict(row.district)?.id === "thu-duc").length - scopedRows.filter((row) => row.district === "Thủ Đức").length);
    setRows(scopedRows);
    setSnapshotAt((latest.data as { snapshot_at: string | null }).snapshot_at ?? null);
    setLoading(false);
  }, []);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleLoad = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void load(), RELOAD_DEBOUNCE_MS);
  }, [load]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  // Initial async data load also sets the loading indicator before the request.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  useSupabaseRealtime({ table: "lmhub_inventory_rows", onChange: scheduleLoad, debounceMs: 800 });

  const refreshQueueStatus = useCallback(async () => {
    const response = await fetch("/api/lmhub-inventory/refresh", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { success?: boolean; pending?: number; running?: number; lastStatus?: string; lastMessage?: string } | null;
    if (!payload?.success) return payload;
    setQueueMeta({ pending: payload.pending ?? 0, running: payload.running ?? 0, lastStatus: payload.lastStatus ?? "", lastMessage: payload.lastMessage ?? "" });
    return payload;
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refreshQueueStatus(); }, [refreshQueueStatus]);
  useSupabaseRealtime({ table: "lmhub_fetch_jobs", onChange: () => { void refreshQueueStatus(); }, debounceMs: 400 });

  const baselineRef = useRef<string | null>(null);
  const orderPanelRef = useRef<HTMLElement | null>(null);
  const queueLmhub = useCallback(async () => {
    if (queueing) return;
    setQueueing(true);
    setQueueNote(null);
    baselineRef.current = snapshotAt;
    try {
      const response = await fetch("/api/lmhub-inventory/refresh", { method: "POST" });
      const payload = await response.json().catch(() => null) as { success?: boolean; queued?: boolean; message?: string; error?: string; pending?: number; running?: number; lastStatus?: string; lastMessage?: string } | null;
      if (!response.ok || !payload?.success) {
        setQueueNote(payload?.error ?? "Không đẩy được việc fetch LMHub.");
        return;
      }
      setQueueNote(payload.message ?? "Đã gửi yêu cầu.");
      if (typeof payload.pending === "number") {
        setQueueMeta({ pending: payload.pending ?? 0, running: payload.running ?? 0, lastStatus: payload.lastStatus ?? "", lastMessage: payload.lastMessage ?? "" });
      }
      if (payload.queued) setWaitingSnapshot(true);
    } catch {
      setQueueNote("Không kết nối được API fetch LMHub.");
    } finally {
      setQueueing(false);
    }
  }, [queueing, snapshotAt]);

  useEffect(() => {
    if (!waitingSnapshot) return;
    let stopped = false;
    const started = Date.now();
    const tick = async () => {
      if (stopped) return;
      await load();
      await refreshQueueStatus();
      if (Date.now() - started > 8 * 60_000) {
        setWaitingSnapshot(false);
        setQueueNote("Worker chưa ghi snapshot mới sau 8 phút. Kiểm tra worker rồi bấm Làm mới.");
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 8000);
    return () => { stopped = true; clearInterval(timer); };
  }, [waitingSnapshot, load, refreshQueueStatus]);

  useEffect(() => {
    if (!waitingSnapshot || !snapshotAt) return;
    if (baselineRef.current && snapshotAt !== baselineRef.current) {
      setWaitingSnapshot(false);
      setQueueNote(`Đã có snapshot mới lúc ${formatDateTime(snapshotAt)}.`);
    }
  }, [waitingSnapshot, snapshotAt]);

  const districtBoards = useMemo(() => buildDeliveryDistrictBoards(rows), [rows]);

  const filtered = useMemo(() => filterBoard(districtBoards.filter((district) => districtFilter === "all" || district.district === districtFilter), query, cot, heat), [districtBoards, districtFilter, query, cot, heat]);
  const analytics = useMemo(() => buildAnalytics(districtBoards, [], cot), [districtBoards, cot]);
  const selectedOrders = useMemo(() => {
    if (!selected) return [];
    const q = normalize(query);
    return rows
      .filter((row) => {
        if (row.area !== selected.area) return false;
        if (districtFilter !== "all" && row.district !== districtFilter) return false;
        if ((row.district || UNKNOWN_DISTRICT) !== selected.district) return false;
        if (selected.ward && (row.ward || UNKNOWN_WARD) !== selected.ward) return false;
        if (cot !== "all" && cotBucket(row.cot_group) !== cot) return false;
        if (q && !normalize(`${row.shipment_id} ${row.zone_id} ${row.cot_group} ${row.order_type} ${row.ward} ${row.district}`).includes(q)) return false;
        return true;
      })
      .sort((a, b) => toTime(b.received_time) - toTime(a.received_time));
  }, [rows, selected, query, cot, districtFilter]);

  const pageCount = Math.max(1, Math.ceil(selectedOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageOrders = selectedOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const busy = (queueMeta?.pending ?? 0) + (queueMeta?.running ?? 0) > 0 || waitingSnapshot;

  const selectFocus = (focus: InventoryFocus) => {
    setSelected(focus);
    setPage(1);
    if (window.matchMedia("(max-width: 1279px)").matches) {
      requestAnimationFrame(() => orderPanelRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start",
      }));
    }
  };

  return (
    <div className="dashboard-control mx-auto max-w-[1680px] space-y-5">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Điều hành tồn · LMHub</div>
          <h1>Tồn Delivery</h1>
          <p>Lọc nhanh theo quận, tìm phường và chọn “Xem đơn” để xử lý tồn. Thủ Đức chỉ tính phạm vi cũ.</p>
        </div>
        <div className="dashboard-command-actions">
          <div className="min-w-[190px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Cập nhật gần nhất</p>
            <p className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatDateTime(snapshotAt)}</p>
            <p className="text-xs text-[var(--color-muted)]">{formatRelative(snapshotAt)}</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /><span>Làm mới</span>
          </Button>
          {canQueue ? (
            <Button type="button" onClick={() => void queueLmhub()} disabled={queueing || waitingSnapshot}>
              <Download size={16} className={queueing || waitingSnapshot ? "animate-pulse" : undefined} />
              <span>{queueing ? "Đang gửi yêu cầu..." : waitingSnapshot ? "Đang cập nhật dữ liệu" : "Lấy dữ liệu mới"}</span>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusChip live={!busy} label={busy ? "Đang cập nhật" : "Sẵn sàng"} />
        <span className="rounded-full border border-[var(--color-rule)] bg-[var(--color-paper)] px-2.5 py-1 font-medium text-[var(--color-ink-2)]">
          {queueMeta ? `${queueMeta.pending} yêu cầu chờ · ${queueMeta.running} đang xử lý` : "Đang kiểm tra cập nhật"}
        </span>
        <span className="text-[var(--color-muted)]">{formatRelative(snapshotAt)}</span>
      </div>

      {queueNote ? (
        <div className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 py-3 text-sm text-[var(--color-ink-2)]">
          {waitingSnapshot ? <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" /> : null}
          {queueNote}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Tổng tồn trong phạm vi" value={analytics.visible} hint="Thủ Đức cũ · Gò Vấp · Quận 12 · Hóc Môn" accent="ink" />
        <StatTile label="COT 1" value={analytics.cot1} hint="Tổng đơn thuộc COT 1" accent="blue" />
        <StatTile label="COT 2" value={analytics.cot2} hint="Tổng đơn thuộc COT 2" accent="teal" />
        <StatTile label="Phường cần ưu tiên" value={analytics.hotWards} hint="Từ 36 đơn tồn / phường" accent={analytics.hotWards ? "red" : "green"} />
      </section>
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <strong>Thủ Đức (cũ):</strong> chỉ gồm 12 phường, không tính Quận 2 và Quận 9.
        {excludedThuDuc > 0 ? <span> Đã loại {excludedThuDuc.toLocaleString("vi-VN")} đơn có phường ngoài phạm vi khỏi bảng và tổng tồn.</span> : null}
      </div>
      <nav aria-label="Lọc quận tồn Delivery" className="flex flex-wrap gap-2">
        {[{ district: "all", label: "Tất cả quận", total: analytics.visible }, ...districtBoards.map((district) => ({ district: district.district, label: deliveryDistrictLabel(district.district), total: visibleTotal(district.totals, cot) }))].map((item) => (
          <button key={item.district} type="button" aria-pressed={districtFilter === item.district} onClick={() => { setDistrictFilter(item.district); setSelected(null); setPage(1); }} className={districtFilter === item.district ? "flex min-h-11 items-center gap-3 rounded-xl border border-blue-600 bg-blue-600 px-4 text-sm font-semibold text-white" : "flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700"}>
            {item.label}<span className="rounded-md bg-black/5 px-2 py-0.5 text-xs tabular-nums">{item.total.toLocaleString("vi-VN")}</span>
          </button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <span className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" size={16} />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(null); setPage(1); }} placeholder="Tìm quận hoặc phường..." aria-label="Tìm quận hoặc phường tồn Delivery" className="pl-9" />
        </span>
        <Seg value={cot} onChange={setCot} options={[{ id: "all", label: "Cả COT" }, { id: "cot1", label: "COT 1" }, { id: "cot2", label: "COT 2" }]} />
        <Seg value={heat} onChange={setHeat} options={[{ id: "all", label: "Tất cả phường" }, { id: "hot", label: "Chỉ phường đỏ" }]} />
        <HeatLegend />
      </div>

      {error ? <div role="alert" className="dashboard-error">{error}</div> : null}
      {loading && !rows.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="h-[36rem] animate-pulse rounded-2xl bg-[var(--color-paper-3)] xl:col-span-6" />
          <div className="h-[36rem] animate-pulse rounded-2xl bg-[var(--color-paper-3)] xl:col-span-6" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
          <div className={selected ? "xl:col-span-8" : "xl:col-span-12"}>
            <DeliveryInventoryBoard districts={filtered} cot={cot} selected={selected} onSelect={selectFocus} forceExpanded={!!query || heat === "hot"} />
          </div>
          {selected ? <aside ref={orderPanelRef} className="scroll-mt-4 xl:sticky xl:top-4 xl:col-span-4">

            <OrderPanel
              selected={selected}
              orders={pageOrders}
              total={selectedOrders.length}
              page={safePage}
              pageCount={pageCount}
              onPrev={() => setPage((value) => Math.max(1, value - 1))}
              onNext={() => setPage((value) => Math.min(pageCount, value + 1))}
              onClose={() => setSelected(null)}
            />
          </aside> : null}
        </div>
      )}
      <details className="rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-700">Biểu đồ phân tích tồn</summary>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <article><ChartHead title="Tồn theo quận" caption="Chỉ tính địa bàn trong phạm vi" /><div className="px-5 pb-5"><BarChart rows={analytics.topDistricts.map((district) => ({ ...district, label: deliveryDistrictLabel(district.label) }))} /></div></article>
          <article><ChartHead title="Mức tồn theo phường" caption="Phân bố mức độ ưu tiên xử lý" /><div className="px-5 pb-5"><RiskStrip bins={analytics.heatBins} /></div></article>
        </div>
      </details>
    </div>
  );
}

function OrderPanel({
  selected,
  orders,
  total,
  page,
  pageCount,
  onPrev,
  onNext,
  onClose,
}: {
  selected: InventoryFocus | null;
  orders: InventoryRow[];
  total: number;
  page: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  if (!selected) {
    return (
      <section className="flex min-h-[28rem] items-center justify-center rounded-2xl border border-dashed border-[var(--color-rule)] bg-[var(--color-paper)] px-6 text-center">
        <div>
          <p className="text-sm font-bold text-[var(--color-ink)]">Chưa chọn địa bàn</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Bấm một quận hoặc phường bên trái để hiện danh sách đơn ở đây.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">{selected.area} · {deliveryDistrictLabel(selected.district)}</p>
          <h2 className="text-base font-bold text-[var(--color-ink)]">{selected.ward ?? "Tất cả phường trong quận"}</h2>
          <p className="text-sm text-[var(--color-muted)]">{total.toLocaleString("vi-VN")} đơn khớp lọc</p>
        </div>
        <Button type="button" variant="secondary" onClick={onClose}><X size={16} /> Đóng</Button>
      </div>
      <div className="max-h-[min(70vh,40rem)] overflow-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="sticky top-0 bg-[var(--color-paper-2)] text-xs text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3">Mã vận đơn</th>
              <th className="px-4 py-3">Phường</th>
              <th className="px-4 py-3">Zone</th>
              <th className="px-4 py-3">Loại</th>
              <th className="px-4 py-3">COT</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3 text-right">Về hub</th>
            </tr>
          </thead>
          <tbody>
            {!orders.length ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--color-muted)]">Không có đơn khớp bộ lọc trong dữ liệu cập nhật gần nhất.</td></tr>
            ) : orders.map((row) => (
              <tr key={row.shipment_id} className="border-t border-[var(--color-rule)]">
                <td className="px-4 py-3 font-mono text-[13px] font-semibold text-[var(--color-ink)]">{row.shipment_id}</td>
                <td className="px-4 py-3 text-[var(--color-ink-2)]">{row.ward || "—"}</td>
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
        <span className="text-[var(--color-muted)]">Trang {page}/{pageCount}</span>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={page <= 1} onClick={onPrev}><ChevronLeft size={16} /> Trước</Button>
          <Button type="button" variant="secondary" disabled={page >= pageCount} onClick={onNext}>Sau <ChevronRight size={16} /></Button>
        </div>
      </div>
    </section>
  );
}

function StatTile({ label, value, hint, accent }: { label: string; value: number; hint: string; accent: "ink" | "blue" | "teal" | "red" | "green" }) {
  const tone = { ink: "text-[var(--color-ink)]", blue: "text-[var(--color-accent)]", teal: "text-[var(--color-success)]", red: "text-[var(--color-error)]", green: "text-[var(--color-success)]" }[accent];
  return (
    <article className="rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">{label}</p>
        {accent === "blue" ? <Truck size={15} className="text-[var(--color-accent)]" /> : accent === "red" ? <MapPin size={15} className="text-[var(--color-error)]" /> : <PackageCheck size={15} className="text-[var(--color-muted)]" />}
      </div>
      <p className={"font-mono text-3xl font-bold tracking-tight " + tone}>{value.toLocaleString("vi-VN")}</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p>
    </article>
  );
}

function StatusChip({ live, label }: { live: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-rule)] bg-[var(--color-paper)] px-2.5 py-1 font-semibold text-[var(--color-ink)]">
      <span className={"h-1.5 w-1.5 rounded-full " + (live ? "bg-[var(--color-success)]" : "animate-pulse bg-[var(--color-warning)]")} />
      {label}
    </span>
  );
}
