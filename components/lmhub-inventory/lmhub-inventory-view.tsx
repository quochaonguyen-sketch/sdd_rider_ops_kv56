/* LMHub Inventory · site tokens, side-by-side KV boards */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, MapPin, PackageCheck, RefreshCcw, Search, Truck, X } from "lucide-react";
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
    const payload = await response.json().catch(() => null) as { success?: boolean; pending?: number; running?: number; lastStatus?: string; lastMessage?: string; error?: string } | null;
    if (!payload?.success) return payload;
    setQueueMeta({
      pending: payload.pending ?? 0,
      running: payload.running ?? 0,
      lastStatus: payload.lastStatus ?? "",
      lastMessage: payload.lastMessage ?? "",
    });
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
      const payload = await response.json().catch(() => null) as { success?: boolean; queued?: boolean; cooldown?: boolean; retryAfterSec?: number; message?: string; error?: string; pending?: number; running?: number; lastStatus?: string; lastMessage?: string } | null;
      if (!response.ok || !payload?.success) {
        setQueueNote(payload?.error ?? "Không đẩy được việc fetch LMHub.");
        return;
      }
      setQueueNote(payload.message ?? "Đã gửi yêu cầu.");
      if (typeof payload.pending === "number") {
        setQueueMeta({
          pending: payload.pending ?? 0,
          running: payload.running ?? 0,
          lastStatus: payload.lastStatus ?? "",
          lastMessage: payload.lastMessage ?? "",
        });
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
        setQueueNote("Worker chưa ghi snapshot mới sau 8 phút. Kiểm tra worker (claim_lmhub_fetch_job) rồi bấm Làm mới.");
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
          {canQueue ? (
            <Button type="button" onClick={() => void queueLmhub()} disabled={queueing || waitingSnapshot}>
              <Download size={16} className={queueing || waitingSnapshot ? "animate-pulse" : undefined} />
              <span>{queueing ? "Đang đẩy..." : waitingSnapshot ? "Đang chờ worker" : "Fetch data"}</span>
            </Button>
          ) : null}
        </div>
      </header>
      <div className="dashboard-readout-strip">
        <span className="dashboard-live-dot" />
        Cập nhật gần nhất: {formatDateTime(snapshotAt)} · {formatRelative(snapshotAt)}
        {queueMeta ? ` · Supabase ${queueMeta.lastStatus || "EMPTY"} · PENDING ${queueMeta.pending} · RUNNING ${queueMeta.running}` : ""}
      </div>
      {queueNote ? (
        <div className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 py-3 text-sm text-[var(--color-ink-2)]">
          {waitingSnapshot ? <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]" /> : null}
          {queueNote}
        </div>
      ) : null}
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
