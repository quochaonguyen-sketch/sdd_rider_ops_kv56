/* LMHub Inventory · ops dashboard with stock charts */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, MapPin, PackageCheck, RefreshCcw, Search, Truck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart, ChartHead, Donut, RiskStrip, ShareRow } from "@/components/lmhub-inventory/lmhub-inventory-charts";
import { AreaBoard, HeatLegend, Seg } from "@/components/lmhub-inventory/lmhub-inventory-boards";
import { COLUMNS, PAGE_ROWS, PAGE_SIZE, RELOAD_DEBOUNCE_MS, UNKNOWN_DISTRICT, UNKNOWN_WARD, buildAnalytics, buildBoard, cotBucket, filterBoard, formatDateTime, formatRelative, normalize, normalizeRow, pct, toTime, visibleBoardTotal, type CotFilter, type HeatFilter, type InventoryRow, type WardAgg } from "@/components/lmhub-inventory/lmhub-inventory-model";

export function LmhubInventoryView({ canQueue = false }: { canQueue?: boolean }) {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cot, setCot] = useState<CotFilter>("all");
  const [heat, setHeat] = useState<HeatFilter>("all");
  const [selected, setSelected] = useState<WardAgg | null>(null);
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

  const refreshQueueStatus = useCallback(async () => {
    const response = await fetch("/api/lmhub-inventory/refresh", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { success?: boolean; pending?: number; running?: number; lastStatus?: string; lastMessage?: string } | null;
    if (!payload?.success) return payload;
    setQueueMeta({ pending: payload.pending ?? 0, running: payload.running ?? 0, lastStatus: payload.lastStatus ?? "", lastMessage: payload.lastMessage ?? "" });
    return payload;
  }, []);

  useEffect(() => { void refreshQueueStatus(); }, [refreshQueueStatus]);
  useSupabaseRealtime({ table: "lmhub_fetch_jobs", onChange: () => { void refreshQueueStatus(); }, debounceMs: 400 });

  const baselineRef = useRef<string | null>(null);
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

  const boards = useMemo(() => {
    const kvRows = rows.filter((row) => row.area === "KV5" || row.area === "KV6");
    return { kv5: buildBoard(kvRows, "KV5"), kv6: buildBoard(kvRows, "KV6"), all: kvRows.length, kv5n: kvRows.filter((row) => row.area === "KV5").length, kv6n: kvRows.filter((row) => row.area === "KV6").length };
  }, [rows]);

  const filtered = useMemo(() => ({ kv5: filterBoard(boards.kv5, query, cot, heat), kv6: filterBoard(boards.kv6, query, cot, heat) }), [boards, query, cot, heat]);
  const analytics = useMemo(() => buildAnalytics(boards.kv5, boards.kv6, cot), [boards, cot]);
  const selectedOrders = useMemo(() => {
    if (!selected) return [];
    const q = normalize(query);
    return rows.filter((row) => row.area === selected.area && (row.district || UNKNOWN_DISTRICT) === selected.district && (row.ward || UNKNOWN_WARD) === selected.ward && (cot === "all" || cotBucket(row.cot_group) === cot) && (!q || normalize(`${row.shipment_id} ${row.zone_id} ${row.cot_group} ${row.order_type}`).includes(q))).sort((a, b) => toTime(b.received_time) - toTime(a.received_time));
  }, [rows, selected, query, cot]);

  const pageCount = Math.max(1, Math.ceil(selectedOrders.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageOrders = selectedOrders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const busy = (queueMeta?.pending ?? 0) + (queueMeta?.running ?? 0) > 0 || waitingSnapshot;

  return (
    <div className="dashboard-control mx-auto max-w-[1680px] space-y-5">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Điều hành tồn · LMHub</div>
          <h1>Tồn khu vực</h1>
          <p>Nhìn nhanh áp lực theo khu vực, quận và COT. Bấm phường để mở danh sách đơn.</p>
        </div>
        <div className="dashboard-command-actions">
          <div className="min-w-[190px] rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Snapshot</p>
            <p className="font-mono text-sm font-bold text-[var(--color-ink)]">{formatDateTime(snapshotAt)}</p>
            <p className="text-xs text-[var(--color-muted)]">{formatRelative(snapshotAt)}</p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} /><span>Làm mới</span>
          </Button>
          {canQueue ? (
            <Button type="button" onClick={() => void queueLmhub()} disabled={queueing || waitingSnapshot}>
              <Download size={16} className={queueing || waitingSnapshot ? "animate-pulse" : undefined} />
              <span>{queueing ? "Đang đẩy..." : waitingSnapshot ? "Đang chờ worker" : "Fetch data"}</span>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <StatusChip live={!busy} label={busy ? "Worker đang chạy" : "Hàng đợi trống"} />
        <span className="rounded-full border border-[var(--color-rule)] bg-[var(--color-paper)] px-2.5 py-1 font-medium text-[var(--color-ink-2)]">
          {queueMeta ? `${queueMeta.lastStatus || "EMPTY"} · P${queueMeta.pending} R${queueMeta.running}` : "Chưa đọc hàng đợi"}
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
        <StatTile label="Tổng tồn KV5 + KV6" value={boards.all} hint={`${analytics.districts} quận · ${analytics.wards} phường`} accent="ink" />
        <StatTile label="Khu vực 5" value={boards.kv5n} hint={`${pct(boards.kv5n, boards.all)} tổng tồn`} accent="blue" />
        <StatTile label="Khu vực 6" value={boards.kv6n} hint={`${pct(boards.kv6n, boards.all)} tổng tồn`} accent="teal" />
        <StatTile label="Phường đỏ" value={analytics.hotWards} hint="≥ 36 đơn / phường" accent={analytics.hotWards ? "red" : "green"} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <article className="xl:col-span-4 overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
          <ChartHead title="Cơ cấu khu vực" caption="Tỷ trọng tồn theo KV và COT" />
          <div className="flex items-center gap-5 px-5 pb-5">
            <Donut kv5={visibleBoardTotal(boards.kv5, cot)} kv6={visibleBoardTotal(boards.kv6, cot)} />
            <div className="min-w-0 flex-1 space-y-3">
              <ShareRow label="KV5" value={visibleBoardTotal(boards.kv5, cot)} total={analytics.visible} tone="var(--color-accent)" />
              <ShareRow label="KV6" value={visibleBoardTotal(boards.kv6, cot)} total={analytics.visible} tone="var(--color-success)" />
              <div className="grid grid-cols-2 gap-2 pt-1">
                <MiniMetric label="COT 1" value={analytics.cot1} />
                <MiniMetric label="COT 2" value={analytics.cot2} />
              </div>
            </div>
          </div>
        </article>
        <article className="xl:col-span-8 overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
          <ChartHead title="Áp lực theo quận" caption="Top quận còn tồn — màu theo mức rủi ro" />
          <div className="px-5 pb-5"><BarChart rows={analytics.topDistricts} /></div>
        </article>
        <article className="xl:col-span-12 overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
          <ChartHead title="Phổ rủi ro phường" caption="Ít / vừa / cao / đỏ — giúp ưu tiên xử lý" />
          <div className="px-5 pb-5"><RiskStrip bins={analytics.heatBins} /></div>
        </article>
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
          <div className="h-[32rem] animate-pulse rounded-2xl bg-[var(--color-paper-3)]" />
          <div className="h-[32rem] animate-pulse rounded-2xl bg-[var(--color-paper-3)]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          <AreaBoard title="Khu vực 5" districts={filtered.kv5} cot={cot} selected={selected} updatedAt={snapshotAt} onSelect={(ward) => { setSelected(ward); setPage(1); }} />
          <AreaBoard title="Khu vực 6" districts={filtered.kv6} cot={cot} selected={selected} updatedAt={snapshotAt} onSelect={(ward) => { setSelected(ward); setPage(1); }} />
        </div>
      )}

      {selected ? (
        <section className="overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">{selected.area} · {selected.district}</p>
              <h2 className="text-base font-bold text-[var(--color-ink)]">{selected.ward}</h2>
              <p className="text-sm text-[var(--color-muted)]">{selectedOrders.length.toLocaleString("vi-VN")} đơn khớp lọc</p>
            </div>
            <Button type="button" variant="secondary" onClick={() => setSelected(null)}><X size={16} /> Đóng</Button>
          </div>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="sticky top-0 bg-[var(--color-paper-2)] text-xs text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">Mã vận đơn</th>
                  <th className="px-4 py-3">Zone</th>
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3">COT</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Về hub</th>
                </tr>
              </thead>
              <tbody>
                {!pageOrders.length ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-[var(--color-muted)]">Không có đơn khớp lọc.</td></tr>
                ) : pageOrders.map((row) => (
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

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--color-paper-2)] px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="font-mono text-sm font-bold text-[var(--color-ink)]">{value.toLocaleString("vi-VN")}</p>
    </div>
  );
}
