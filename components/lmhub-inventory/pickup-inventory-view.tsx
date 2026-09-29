"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Download, MapPin, PackageCheck, RefreshCcw, Search, Truck, X } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { BarChart, ChartHead, Donut, RiskStrip, ShareRow } from "@/components/lmhub-inventory/lmhub-inventory-charts";
import { HeatLegend, Seg } from "@/components/lmhub-inventory/lmhub-inventory-boards";
import { formatDateTime, formatRelative, heatClass, RELOAD_DEBOUNCE_MS } from "@/components/lmhub-inventory/lmhub-inventory-model";
import {
  PAGE_ROWS,
  PICKUP_STATUS_COLUMNS,
  PICKUP_STATUS_LABEL,
  PICKUP_STATUS_TABLE,
  buildPickupBoard,
  filterPickupBoard,
  pickupAnalytics,
  riderCotLabel,
  visibleBoardTotal,
  visibleTotal,
  type Area,
  type CotFilter,
  type DistrictAgg,
  type HeatFilter,
  type PickupStatusKey,
  type PickupStatusRow,
} from "@/components/lmhub-inventory/pickup-inventory-model";
import { fetchPickupWardRiders } from "@/components/lmhub-inventory/use-pickup-ward-riders";

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
  const [modal, setModal] = useState<{ area: string; ward: string } | null>(null);
  const [areaFilter, setAreaFilter] = useState<"all" | Area>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [riderCache, setRiderCache] = useState<Record<string, WardRiders>>({});
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

  useSupabaseRealtime({ table: "pickup_48h_no_api2", onChange: scheduleLoad, debounceMs: 1200 });
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

  const kv5Wards = useMemo(() => mergeWards(filtered.kv5, cot), [filtered, cot]);
  const kv6Wards = useMemo(() => mergeWards(filtered.kv6, cot), [filtered, cot]);
  const topWards = useMemo(() => {
    const map = new Map<string, { label: string; area: Area; value: number }>();
    for (const district of [...filtered.kv5, ...filtered.kv6]) {
      for (const ward of district.wards) {
        const current = map.get(ward.ward) ?? { label: ward.ward, area: ward.area, value: 0 };
        current.value += visibleTotal(ward, cot);
        map.set(ward.ward, current);
      }
    }
    return [...map.values()].filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [filtered, cot]);
  const changeStatus = (next: PickupStatusKey) => {
    setStatus(next);
    setModal(null);
    setExpanded(null);
    setRiderCache({});
  };

  const toggleWard = useCallback((ward: FlatWard) => {
    const key = `${ward.area}||${ward.ward}`;
    setExpanded((current) => (current === key ? null : key));
  }, []);

  const retryWard = useCallback((ward: FlatWard) => {
    const key = `${ward.area}||${ward.ward}`;
    setRiderCache((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setExpanded(key);
  }, []);

  const snapshotRef = useRef<string | null>(null);
  useEffect(() => {
    if (snapshotRef.current !== snapshotAt) {
      snapshotRef.current = snapshotAt;
      setRiderCache({});
    }
  }, [snapshotAt]);

  useEffect(() => {
    if (!expanded || riderCache[expanded]) return;
    let cancelled = false;
    const key = expanded;
    const separator = expanded.indexOf("||");
    const area = expanded.slice(0, separator);
    const ward = expanded.slice(separator + 2);
    setRiderCache((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: { loading: true, cot1: [], cot2: [], error: null } };
    });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const run = async () => {
      try {
        const loaded = await fetchPickupWardRiders(area, ward, PICKUP_STATUS_LABEL[status], controller.signal);
        if (cancelled) return;
        setRiderCache((prev) => ({ ...prev, [key]: { loading: false, cot1: loaded.cot1, cot2: loaded.cot2, error: null } }));
      } catch (err) {
        if (cancelled) return;
        const isAbort = err instanceof Error && (err.name === "AbortError" || /abort|aborted/i.test(err.message));
        const message = isAbort
          ? `Query rider quá 15s chưa xong (${area} · ${ward} · ${PICKUP_STATUS_LABEL[status]}). Bấm Thử lại.`
          : err instanceof Error ? err.message : "Không tải được rider.";
        if (!cancelled) setRiderCache((prev) => ({ ...prev, [key]: { loading: false, cot1: [], cot2: [], error: message } }));
      } finally {
        clearTimeout(timeoutId);
      }
    };
    void run();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [expanded, riderCache, status]);

  return (
    <div className="dashboard-control mx-auto max-w-[1680px] space-y-5">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Điều hành tồn · Pickup {statusLabel}</div>
          <h1>Tồn pickup</h1>
          <p>Pivot từ raw pickup_48h_no_api2. Bấm phường xem rider COT 1 / COT 2 (RPC, không quét raw).</p>
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
        <StatTile label={`${statusLabel} KV5 + KV6`} value={boards.all} hint={`${analytics.riders} phường còn ${statusLabel}`} accent="ink" />
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
          <ChartHead title="Áp lực theo phường" caption={`Top phường còn ${statusLabel}`} />
          <div className="px-5 pb-5"><BarChart rows={topWards} /></div>
        </article>
        <article className="xl:col-span-12 overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
          <ChartHead title="Phổ rủi ro phường" caption="Hết tồn / ít / vừa / cao / đỏ" />
          <div className="px-5 pb-5"><RiskStrip bins={analytics.heatBins} /></div>
        </article>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[190px]">
          <Select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value as "all" | Area)} aria-label="Lọc khu vực">
            <option value="all">Cả KV5 + KV6</option>
            <option value="KV5">Chỉ KV5</option>
            <option value="KV6">Chỉ KV6</option>
          </Select>
        </span>
        <span className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" size={16} />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); }} placeholder="Tìm phường" className="pl-9" />
        </span>
        <Seg value={cot} onChange={setCot} options={[{ id: "all", label: "Cả COT" }, { id: "cot1", label: "COT 1" }, { id: "cot2", label: "COT 2" }]} />
        <Seg value={heat} onChange={setHeat} options={[{ id: "all", label: "Tất cả phường" }, { id: "hot", label: "Chỉ phường đỏ" }]} />
        <HeatLegend />
      </div>

      {error ? <div role="alert" className="dashboard-error">{error}</div> : null}
      {loading && !rows.length ? (
        <div className="grid grid-cols-1 gap-4">
          <div className="h-[36rem] animate-pulse rounded-2xl bg-[var(--color-paper-3)]" />
          <div className="h-[36rem] animate-pulse rounded-2xl bg-[var(--color-paper-3)]" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4">
          {areaFilter !== "KV6" ? (
            <WardTable title="Khu vực 5" wards={kv5Wards} cot={cot} statusLabel={statusLabel} updatedAt={snapshotAt} expandedKey={expanded} riderCache={riderCache} onToggle={toggleWard} onRetry={retryWard} onDetail={(ward) => setModal({ area: ward.area, ward: ward.ward })} />
          ) : null}
          {areaFilter !== "KV5" ? (
            <WardTable title="Khu vực 6" wards={kv6Wards} cot={cot} statusLabel={statusLabel} updatedAt={snapshotAt} expandedKey={expanded} riderCache={riderCache} onToggle={toggleWard} onRetry={retryWard} onDetail={(ward) => setModal({ area: ward.area, ward: ward.ward })} />
          ) : null}
        </div>
      )}
      {modal ? <WardModal area={modal.area} ward={modal.ward} statusLabel={statusLabel} cot={cot} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

type FlatWard = { ward: string; area: Area; cot1: number; cot2: number; total: number };
type RiderShare = { name: string; orders: number };
type WardRiders = { loading: boolean; cot1: RiderShare[]; cot2: RiderShare[]; error: string | null };

function mergeWards(districts: DistrictAgg[], cot: CotFilter): FlatWard[] {
  const map = new Map<string, FlatWard>();
  for (const district of districts) {
    for (const ward of district.wards) {
      const current = map.get(ward.ward) ?? { ward: ward.ward, area: ward.area, cot1: 0, cot2: 0, total: 0 };
      current.cot1 += ward.cot1;
      current.cot2 += ward.cot2;
      current.total += ward.total;
      map.set(ward.ward, current);
    }
  }
  return [...map.values()].sort((a, b) => visibleTotal(b, cot) - visibleTotal(a, cot) || a.ward.localeCompare(b.ward, "vi"));
}

function WardTable({ title, wards, cot, statusLabel, updatedAt, expandedKey, riderCache, onToggle, onRetry, onDetail }: { title: string; wards: FlatWard[]; cot: CotFilter; statusLabel: string; updatedAt: string | null; expandedKey: string | null; riderCache: Record<string, WardRiders>; onToggle: (ward: FlatWard) => void; onRetry: (ward: FlatWard) => void; onDetail: (ward: FlatWard) => void }) {
  const total = wards.reduce((sum, ward) => sum + visibleTotal(ward, cot), 0);
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className="flex items-center justify-between bg-[var(--color-graphite)] px-4 py-3 text-[var(--color-graphite-ink)]">
        <div>
          <h2 className="text-sm font-bold tracking-tight">{title}</h2>
          <p className="text-[11px] font-medium text-[var(--color-graphite-ink)]/70">Cập nhật {formatDateTime(updatedAt)}</p>
        </div>
        <span className="font-mono text-sm font-semibold">{total.toLocaleString("vi-VN")} đơn</span>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--color-paper-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Phường {statusLabel}</th>
              <th className="w-20 px-3 py-2.5 text-right font-semibold">COT 1</th>
              <th className="w-20 px-3 py-2.5 text-right font-semibold">COT 2</th>
              <th className="w-24 px-3 py-2.5 text-right font-semibold">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {!wards.length ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-[var(--color-muted)]">Không có phường khớp lọc.</td>
              </tr>
            ) : wards.map((ward) => {
              const grand = visibleTotal(ward, cot);
              const key = `${ward.area}||${ward.ward}`;
              const isOpen = expandedKey === key;
              return (
                <Fragment key={ward.ward}>
                  <tr onClick={() => onToggle(ward)} className={`cursor-pointer border-t border-[var(--color-rule)] hover:bg-[var(--color-paper-2)] ${isOpen ? "bg-[var(--color-paper-2)]" : ""}`}>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5 font-semibold text-[var(--color-accent)]">
                        <ChevronDown size={15} className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        {ward.ward}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 text-right font-mono ${ward.cot1 <= 0 ? "text-slate-300" : "text-[var(--color-ink-2)]"}`}>{ward.cot1.toLocaleString("vi-VN")}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${ward.cot2 <= 0 ? "text-slate-300" : "text-[var(--color-ink-2)]"}`}>{ward.cot2.toLocaleString("vi-VN")}</td>
                    <td className="px-1 py-1">
                      <div className={`px-3 py-2 text-right font-mono font-semibold ${heatClass(grand)} rounded-md`}>{grand.toLocaleString("vi-VN")}</div>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="border-t border-[var(--color-rule)]">
                      <td colSpan={4} className="bg-[var(--color-paper-2)]/60 px-4 py-3">
                        <RiderPanel info={riderCache[key]} cot={cot} ward={ward} onDetail={() => onDetail(ward)} onRetry={() => onRetry(ward)} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RiderPanel({ info, cot, ward, onDetail, onRetry }: { info: WardRiders | undefined; cot: CotFilter; ward: FlatWard; onDetail: () => void; onRetry: () => void }) {
  if (!info || info.loading) {
    return <p className="py-2 text-center text-sm text-[var(--color-muted)]">Đang tải tên rider...</p>;
  }
  if (info.error) {
    return (
      <div className="py-2 text-center">
        <p className="text-sm text-red-600">{info.error}</p>
        <button type="button" onClick={onRetry} className="mt-2 rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-1.5 text-xs font-bold text-[var(--color-accent)]">Thử lại</button>
      </div>
    );
  }
  const showCot1 = cot !== "cot2";
  const showCot2 = cot !== "cot1";
  return (
    <div>
      <div className={`grid grid-cols-1 gap-3 ${showCot1 && showCot2 ? "sm:grid-cols-2" : ""}`}>
        {showCot1 ? <RiderColumn title="COT 1" shares={info.cot1} tone="blue" /> : null}
        {showCot2 ? <RiderColumn title="COT 2" shares={info.cot2} tone="teal" /> : null}
      </div>
      <div className="mt-2 text-right">
        <button type="button" onClick={onDetail} className="text-xs font-bold text-[var(--color-accent)] hover:underline">Chi tiết PUP / đơn {ward.ward} →</button>
      </div>
    </div>
  );
}

function RiderColumn({ title, shares, tone }: { title: string; shares: RiderShare[]; tone: "blue" | "teal" }) {
  const total = shares.reduce((sum, item) => sum + item.orders, 0);
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className={`flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wide ${tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-teal-50 text-teal-700"}`}>
        <span>{title}</span>
        <span className="font-mono">{total.toLocaleString("vi-VN")} đơn</span>
      </div>
      {!shares.length ? <p className="px-3 py-3 text-xs text-slate-400">—</p> : (
        <ul className="divide-y divide-[var(--color-rule)]">
          {shares.map((item) => (
            <li key={item.name} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[13px]">
              <span className="min-w-0 truncate font-semibold text-[var(--color-ink-2)]">{item.name}</span>
              <span className="shrink-0 font-mono text-xs text-[var(--color-muted)]">{item.orders.toLocaleString("vi-VN")} đơn</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type WardOrder = { pup: string; pupName: string; order: string; cot: string; rider: string };

function WardModal({ area, ward, statusLabel, cot, onClose }: { area: string; ward: string; statusLabel: string; cot: CotFilter; onClose: () => void }) {
  const [orders, setOrders] = useState<WardOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const run = async () => {
      setLoadingOrders(true);
      try {
        const supabase = createClient();
        const result = await supabase.from("pickup_48h_no_api2").select("pickup_point_id,pickup_point_name,shipment_id,cot_group,assigned_riders_today").eq("area", area).eq("ward", ward).eq("status", statusLabel).abortSignal(controller.signal).limit(2000);
        if (cancelled) return;
        if (!result.error) {
          const list = (result.data ?? []) as Array<{ pickup_point_id?: string | null; pickup_point_name?: string | null; shipment_id?: string | null; cot_group?: string | null; assigned_riders_today?: string | null }>;
          setOrders(list.map((row) => ({ pup: String(row.pickup_point_id || "—"), pupName: String(row.pickup_point_name || ""), order: String(row.shipment_id || "—"), cot: riderCotLabel(String(row.cot_group || "")), rider: String(row.assigned_riders_today || "") })));
        }
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoadingOrders(false);
      }
    };
    void run();
    return () => { cancelled = true; clearTimeout(timeoutId); controller.abort(); };
  }, [area, ward, statusLabel]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const q = search.trim().toLowerCase();
  const visible = orders.filter((row) => (cot === "all" ? true : row.cot.toLowerCase() === cot)).filter((row) => !q || `${row.pup} ${row.pupName} ${row.order} ${row.rider}`.toLowerCase().includes(q));
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)] shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-rule)] px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">{area} · {statusLabel}</p>
            <h2 className="text-base font-bold text-[var(--color-ink)]">{ward}</h2>
          </div>
          <Button type="button" variant="secondary" onClick={onClose}><X size={16} /> Đóng</Button>
        </div>
        <div className="border-b border-[var(--color-rule)] px-4 py-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm mã PUP, mã đơn, rider" />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[var(--color-paper-2)] text-xs text-[var(--color-muted)]">
              <tr><th className="px-4 py-3">Mã PUP</th><th className="px-4 py-3">Mã đơn</th><th className="px-4 py-3">COT</th><th className="px-4 py-3">Rider</th></tr>
            </thead>
            <tbody>
              {loadingOrders ? <tr><td colSpan={4} className="px-4 py-10 text-center text-[var(--color-muted)]">Đang tải chi tiết...</td></tr>
              : !visible.length ? <tr><td colSpan={4} className="px-4 py-10 text-center text-[var(--color-muted)]">Không có đơn.</td></tr>
              : visible.map((row, index) => (
                <tr key={`${row.pup}-${row.order}-${index}`} className="border-t border-[var(--color-rule)]">
                  <td className="px-4 py-3 font-mono text-[13px] font-semibold">{row.pup}</td>
                  <td className="px-4 py-3 font-mono text-[13px]">{row.order}</td>
                  <td className="px-4 py-3 text-xs">{row.cot}</td>
                  <td className="px-4 py-3 text-xs">{row.rider || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StatTile({ label, value, hint, accent }: { label: string; value: number; hint: string; accent: "ink" | "blue" | "teal" | "red" | "green" }) {
  const tone = { ink: "text-[var(--color-ink)]", blue: "text-[var(--color-accent)]", teal: "text-[var(--color-success)]", red: "text-[var(--color-error)]", green: "text-[var(--color-success)]" }[accent];
  return (
    <article className="rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)] px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">{label}</p>
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
