"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, MapPin, PackageCheck, RefreshCcw, Search, Truck, X } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart, ChartHead, Donut, RiskStrip, ShareRow } from "@/components/lmhub-inventory/lmhub-inventory-charts";
import { AreaBoard, HeatLegend, Seg } from "@/components/lmhub-inventory/lmhub-inventory-boards";
import { formatDateTime, formatRelative, PAGE_SIZE, RELOAD_DEBOUNCE_MS } from "@/components/lmhub-inventory/lmhub-inventory-model";
import {
  PAGE_ROWS,
  PICKUP_STATUS_COLUMNS,
  PICKUP_STATUS_LABEL,
  PICKUP_STATUS_TABLE,
  buildPickupBoard,
  filterPickupBoard,
  matchesFocus,
  matchesRiderCot,
  n,
  pickupAnalytics,
  searchBlob,
  visibleBoardTotal,
  type CotFilter,
  type HeatFilter,
  type InventoryFocus,
  type PickupStatusKey,
  type PickupStatusRow,
} from "@/components/lmhub-inventory/pickup-inventory-model";

export function PickupInventoryView({ canQueue = false }: { canQueue?: boolean }) {
  const [status, setStatus] = useState<PickupStatusKey>("assigned");
  const [rows, setRows] = useState<PickupStatusRow[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cot, setCot] = useState<CotFilter>("all");
  const [heat, setHeat] = useState<HeatFilter>("all");
  const [selected, setSelected] = useState<InventoryFocus | null>(null);
  const [page, setPage] = useState(1);
  const [queueing, setQueueing] = useState(false);
  const [waitingSnapshot, setWaitingSnapshot] = useState(false);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const [queueMeta, setQueueMeta] = useState<{ pending: number; running: number; lastStatus: string; lastMessage: string; lastKind?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baselineRef = useRef<string | null>(null);

  const load = useCallback(async (nextStatus = status) => {
    const supabase = createClient();
    const table = PICKUP_STATUS_TABLE[nextStatus];
    const collected: PickupStatusRow[] = [];
    for (let from = 0; ; from += PAGE_ROWS) {
      const result = await supabase.from(table).select(PICKUP_STATUS_COLUMNS).order("orders", { ascending: false }).range(from, from + PAGE_ROWS - 1);
      if (result.error) throw result.error;
      const chunk = (result.data ?? []) as PickupStatusRow[];
      collected.push(...chunk);
      if (chunk.length < PAGE_ROWS) break;
    }
    setRows(collected);
    setSnapshotAt(collected[0]?.snapshot_at ?? collected[0]?.updated_at ?? null);
  }, [status]);

  const runLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Không tải được tồn pickup."); }
    finally { setLoading(false); }
  }, [load]);

  const refreshStatus = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const supabase = createClient();
      const result = await supabase.rpc("refresh_pickup_status_inventory");
      if (result.error) throw result.error;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không refresh được bảng trạng thái pickup.");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [load]);

  const scheduleLoad = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void runLoad(), RELOAD_DEBOUNCE_MS);
  }, [runLoad]);

  useEffect(() => {
    void runLoad();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [runLoad]);

  useSupabaseRealtime({ table: "pickup_inventory_assigned", onChange: scheduleLoad, debounceMs: 800 });
  useSupabaseRealtime({ table: "pickup_inventory_onhold", onChange: scheduleLoad, debounceMs: 800 });
  useSupabaseRealtime({ table: "pickup_inventory_created", onChange: scheduleLoad, debounceMs: 800 });
  useSupabaseRealtime({ table: "pickup_48h_no_api2", onChange: scheduleLoad, debounceMs: 1200 });
  useSupabaseRealtime({ table: "pickup_48h_summary_groups", onChange: scheduleLoad, debounceMs: 1200 });
  useReportInitialDataLoading("pickup-inventory", loading);

  const refreshQueueStatus = useCallback(async () => {
    const response = await fetch("/api/lmhub-inventory/refresh", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { success?: boolean; pending?: number; running?: number; lastStatus?: string; lastMessage?: string; lastKind?: string } | null;
    if (!payload?.success) return payload;
    setQueueMeta({ pending: payload.pending ?? 0, running: payload.running ?? 0, lastStatus: payload.lastStatus ?? "", lastMessage: payload.lastMessage ?? "", lastKind: payload.lastKind });
    return payload;
  }, []);

  useEffect(() => { void refreshQueueStatus(); }, [refreshQueueStatus]);
  useSupabaseRealtime({ table: "lmhub_fetch_jobs", onChange: () => { void refreshQueueStatus(); }, debounceMs: 400 });

  const queuePickup = useCallback(async () => {
    if (queueing) return;
    setQueueing(true);
    setQueueNote(null);
    baselineRef.current = snapshotAt;
    try {
      const response = await fetch("/api/lmhub-inventory/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "pickup" }) });
      const payload = await response.json().catch(() => null) as { success?: boolean; queued?: boolean; message?: string; error?: string; pending?: number; running?: number; lastStatus?: string; lastMessage?: string; lastKind?: string } | null;
      if (!response.ok || !payload?.success) {
        setQueueNote(payload?.error ?? "Không đẩy được tồn pickup vào hàng đợi.");
        return;
      }
      setQueueNote(payload.message ?? "Đã gửi yêu cầu.");
      if (typeof payload.pending === "number") {
        setQueueMeta({ pending: payload.pending ?? 0, running: payload.running ?? 0, lastStatus: payload.lastStatus ?? "", lastMessage: payload.lastMessage ?? "", lastKind: payload.lastKind });
      }
      if (payload.queued) setWaitingSnapshot(true);
    } catch {
      setQueueNote("Không kết nối được API hàng đợi tồn.");
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
      if (Date.now() - started > 20 * 60_000) {
        setWaitingSnapshot(false);
        setQueueNote("Worker chưa ghi snapshot pickup mới sau 20 phút. Kiểm tra cửa sổ Tồn KV5/KV6.");
      }
    };
    void tick();
    const timerId = setInterval(() => void tick(), 8000);
    return () => { stopped = true; clearInterval(timerId); };
  }, [waitingSnapshot, load, refreshQueueStatus]);

  useEffect(() => {
    if (!waitingSnapshot || !snapshotAt) return;
    if (baselineRef.current && snapshotAt !== baselineRef.current) {
      setWaitingSnapshot(false);
      setQueueNote(`Đã có snapshot pickup mới lúc ${formatDateTime(snapshotAt)}.`);
    }
  }, [waitingSnapshot, snapshotAt]);

  const kv5 = useMemo(() => buildPickupBoard(rows, "KV5"), [rows]);
  const kv6 = useMemo(() => buildPickupBoard(rows, "KV6"), [rows]);
  const filtered = useMemo(() => ({ kv5: filterPickupBoard(kv5, query, cot, heat), kv6: filterPickupBoard(kv6, query, cot, heat) }), [kv5, kv6, query, cot, heat]);
  const analytics = useMemo(() => pickupAnalytics(filtered.kv5, filtered.kv6, cot), [filtered, cot]);
  const boards = { kv5: filtered.kv5, kv6: filtered.kv6, kv5n: visibleBoardTotal(filtered.kv5, cot), kv6n: visibleBoardTotal(filtered.kv6, cot), all: analytics.visible };
  const statusLabel = PICKUP_STATUS_LABEL[status];

  const selectedRows = useMemo(() => {
    if (!selected) return [];
    const q = query.trim();
    return rows
      .filter((row) => matchesFocus(row, selected))
      .filter((row) => matchesRiderCot(row.cot, cot))
      .filter((row) => !q || searchBlob([row.district, row.ward, row.zone, row.cot]).includes(searchBlob([q])))
      .sort((a, b) => n(b.orders) - n(a.orders) || String(a.zone ?? "").localeCompare(String(b.zone ?? ""), "vi"));
  }, [rows, selected, query, cot]);

  const pageCount = Math.max(1, Math.ceil(selectedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = selectedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selectFocus = (focus: InventoryFocus) => { setSelected(focus); setPage(1); };
  const changeStatus = (next: PickupStatusKey) => {
    setStatus(next);
    setSelected(null);
    setPage(1);
  };

  return (
    <div className="dashboard-control mx-auto max-w-[1680px] space-y-5">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Điều hành tồn · Pickup {statusLabel}</div>
          <h1>Tồn pickup</h1>
          <p>Raw pickup_48h_no_api2 REPLACE mỗi vòng. Bảng phải: mã PUP còn đơn Assigned / Onhold / Created.</p>
        </div>
        <div className="dashboard-command-actions">
          <div className="min-w-[190px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Snapshot</p>
            <p className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatDateTime(snapshotAt)}</p>
            <p className="text-xs text-[var(--color-muted)]">{formatRelative(snapshotAt)}</p>
          </div>
          <Link href="/inventory-delivery" className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-2 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)]">
            <Truck size={16} /> Tồn delivery
          </Link>
          <Button type="button" variant="secondary" onClick={() => void refreshStatus()} disabled={loading || refreshing}>
            <RefreshCcw size={16} className={loading || refreshing ? "animate-spin" : undefined} /><span>{refreshing ? "Đang gom..." : "Làm mới bảng"}</span>
          </Button>
          {canQueue ? (
            <Button type="button" onClick={() => void queuePickup()} disabled={queueing || waitingSnapshot}>
              <Download size={16} className={queueing || waitingSnapshot ? "animate-pulse" : undefined} />
              <span>{queueing ? "Đang đẩy..." : waitingSnapshot ? "Đang chờ worker" : "Fetch tồn pickup"}</span>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Seg value={status} onChange={changeStatus} options={[{ id: "assigned", label: "Assigned" }, { id: "onhold", label: "Pickup Onhold" }, { id: "created", label: "Created" }]} />
        <span className="rounded-full border border-[var(--color-rule)] bg-[var(--color-paper)] px-2.5 py-1 text-xs font-medium text-[var(--color-ink-2)]">
          {(queueMeta?.pending ?? 0) + (queueMeta?.running ?? 0) > 0 || waitingSnapshot ? "Hàng đợi chung đang chạy" : "Hàng đợi trống"}
        </span>
      </div>
      {queueNote ? (
        <div className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 py-3 text-sm text-[var(--color-ink-2)]">
          {waitingSnapshot ? <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" /> : null}
          {queueNote}
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label={`${statusLabel} KV5 + KV6`} value={boards.all} hint={`${analytics.riders} phường · ${analytics.zones} quận`} accent="ink" />
        <StatTile label="Khu vực 5" value={boards.kv5n} hint={`${analytics.visible ? Math.round((boards.kv5n / analytics.visible) * 100) : 0}% ${statusLabel}`} accent="blue" />
        <StatTile label="Khu vực 6" value={boards.kv6n} hint={`${analytics.visible ? Math.round((boards.kv6n / analytics.visible) * 100) : 0}% ${statusLabel}`} accent="teal" />
        <StatTile label="Phường đỏ" value={analytics.hotRiders} hint={`≥ 36 đơn ${statusLabel}`} accent={analytics.hotRiders ? "red" : "green"} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <article className="xl:col-span-4 overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
          <ChartHead title="Cơ cấu khu vực" caption={`${statusLabel} theo KV và COT đơn`} />
          <div className="flex items-center gap-5 px-5 pb-5">
            <Donut kv5={boards.kv5n} kv6={boards.kv6n} />
            <div className="min-w-0 flex-1 space-y-3">
              <ShareRow label="KV5" value={boards.kv5n} total={analytics.visible} tone="var(--color-accent)" />
              <ShareRow label="KV6" value={boards.kv6n} total={analytics.visible} tone="var(--color-success)" />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <MiniMetric label="COT 1" value={analytics.cot1} />
                <MiniMetric label="COT 2" value={analytics.cot2} />
              </div>
            </div>
          </div>
        </article>
        <article className="xl:col-span-8 overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
          <ChartHead title="Áp lực theo quận" caption={`Top quận còn ${statusLabel}`} />
          <div className="px-5 pb-5"><BarChart rows={analytics.topZones} /></div>
        </article>
        <article className="xl:col-span-12 overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
          <ChartHead title="Phổ rủi ro phường" caption="Hết tồn / ít / vừa / cao / đỏ" />
          <div className="px-5 pb-5"><RiskStrip bins={analytics.heatBins} /></div>
        </article>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" size={16} />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Tìm quận, phường, tuyến" className="pl-9" />
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
          <div className="space-y-4 xl:col-span-6">
            <AreaBoard title="Khu vực 5" districts={filtered.kv5} cot={cot} selected={selected} updatedAt={snapshotAt} onSelect={selectFocus} columnLabel={`Quận / Phường ${statusLabel}`} />
            <AreaBoard title="Khu vực 6" districts={filtered.kv6} cot={cot} selected={selected} updatedAt={snapshotAt} onSelect={selectFocus} columnLabel={`Quận / Phường ${statusLabel}`} />
          </div>
          <aside className="xl:sticky xl:top-4 xl:col-span-6">
            <ZonePanel statusLabel={statusLabel} selected={selected} rows={pageRows} total={selectedRows.length} page={safePage} pageCount={pageCount} onPrev={() => setPage((value) => Math.max(1, value - 1))} onNext={() => setPage((value) => Math.min(pageCount, value + 1))} onClose={() => setSelected(null)} />
          </aside>
        </div>
      )}
    </div>
  );
}

function ZonePanel({ statusLabel, selected, rows, total, page, pageCount, onPrev, onNext, onClose }: { statusLabel: string; selected: InventoryFocus | null; rows: PickupStatusRow[]; total: number; page: number; pageCount: number; onPrev: () => void; onNext: () => void; onClose: () => void; }) {
  const [pups, setPups] = useState<Array<{ pup: string; name: string; zone: string; riders: string; orders: number }>>([]);
  useEffect(() => {
    if (!selected) { setPups([]); return; }
    let cancelled = false;
    const run = async () => {
      const supabase = createClient();
      let query = supabase.from("pickup_48h_no_api2").select("pickup_point_id,pickup_point_name,zone_name,assigned_riders_today,status,ward,area").eq("area", selected.area).eq("status", statusLabel);
      if (selected.ward) query = query.eq("ward", selected.ward);
      const result = await query.limit(2000);
      if (cancelled || result.error) return;
      const map = new Map<string, { pup: string; name: string; zone: string; riders: string; orders: number }>();
      for (const row of result.data ?? []) {
        const pup = String(row.pickup_point_id || row.zone_name || "—");
        const current = map.get(pup) ?? { pup, name: String(row.pickup_point_name || ""), zone: String(row.zone_name || ""), riders: String(row.assigned_riders_today || ""), orders: 0 };
        current.orders += 1;
        if (!current.riders && row.assigned_riders_today) current.riders = String(row.assigned_riders_today);
        map.set(pup, current);
      }
      setPups([...map.values()].sort((a, b) => b.orders - a.orders || a.pup.localeCompare(b.pup)));
    };
    void run();
    return () => { cancelled = true; };
  }, [selected, statusLabel]);

  if (!selected) {
    return (
      <section className="flex min-h-[28rem] items-center justify-center rounded-2xl border border-dashed border-[var(--color-rule)] bg-[var(--color-paper)] px-6 text-center">
        <div>
          <p className="text-sm font-bold text-[var(--color-ink)]">Chưa chọn quận / phường</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Bấm một quận hoặc phường để xem PUP còn đơn {statusLabel}.</p>
        </div>
      </section>
    );
  }
  const orders = pups.reduce((sum, row) => sum + row.orders, 0) || rows.reduce((sum, row) => sum + n(row.orders), 0);
  const cot1 = rows.reduce((sum, row) => sum + (String(row.cot).toUpperCase().includes("2") ? 0 : n(row.orders)), 0);
  const cot2 = rows.reduce((sum, row) => sum + (String(row.cot).toUpperCase().includes("2") ? n(row.orders) : 0), 0);
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">{selected.area} · {statusLabel}</p>
          <h2 className="text-base font-bold text-[var(--color-ink)]">{selected.ward ?? selected.district}</h2>
          <p className="text-sm text-[var(--color-muted)]">{pups.length.toLocaleString("vi-VN")} PUP · {orders.toLocaleString("vi-VN")} đơn {statusLabel}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onClose}><X size={16} /> Đóng</Button>
      </div>
      <div className="grid grid-cols-3 gap-2 border-b border-[var(--color-rule)] px-4 py-3 text-xs">
        <MiniMetric label="COT 1" value={cot1} />
        <MiniMetric label="COT 2" value={cot2} />
        <MiniMetric label="Tổng" value={orders} />
      </div>
      <div className="max-h-[min(70vh,40rem)] overflow-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="sticky top-0 bg-[var(--color-paper-2)] text-xs text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3">Mã PUP</th>
              <th className="px-4 py-3">Tên / tuyến</th>
              <th className="px-4 py-3">Rider</th>
              <th className="px-4 py-3 text-right">Còn đơn</th>
            </tr>
          </thead>
          <tbody>
            {!(pups.length || rows.length) ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-[var(--color-muted)]">Chưa có raw PUP. Chạy pickup_48h để REPLACE bảng pickup_48h_no_api2.</td></tr>
            ) : (pups.length ? pups : rows.map((row) => ({ pup: row.zone || "—", name: row.ward || "", zone: row.zone || "", riders: "", orders: n(row.orders) }))).map((row) => (
              <tr key={row.pup} className="border-t border-[var(--color-rule)]">
                <td className="px-4 py-3 font-mono text-[13px] font-semibold text-[var(--color-ink)]">{row.pup}</td>
                <td className="px-4 py-3 text-[var(--color-ink-2)]">{row.name || row.zone || "—"}</td>
                <td className="px-4 py-3 text-xs text-[var(--color-ink-2)]">{row.riders || "—"}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold">{row.orders.toLocaleString("vi-VN")}</td>
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

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--color-paper-2)] px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="font-mono text-sm font-bold text-[var(--color-ink)]">{value.toLocaleString("vi-VN")}</p>
    </div>
  );
}
