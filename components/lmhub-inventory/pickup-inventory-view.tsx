"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, PackageCheck, RefreshCcw, Search, Truck, X } from "lucide-react";
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
  PICKUP_PIVOT_COLUMNS,
  buildPickupBoard,
  cleanZones,
  filterPickupBoard,
  matchesFocus,
  matchesRiderCot,
  n,
  pickupAnalytics,
  riderPending,
  riderSheetLabel,
  searchBlob,
  visibleBoardTotal,
  type CotFilter,
  type HeatFilter,
  type InventoryFocus,
  type PickupPivotRow,
} from "@/components/lmhub-inventory/pickup-inventory-model";

export function PickupInventoryView() {
  const [riders, setRiders] = useState<PickupPivotRow[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cot, setCot] = useState<CotFilter>("all");
  const [heat, setHeat] = useState<HeatFilter>("all");
  const [selected, setSelected] = useState<InventoryFocus | null>(null);
  const [page, setPage] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const collected: PickupPivotRow[] = [];
    for (let from = 0; ; from += PAGE_ROWS) {
      const result = await supabase
        .from("pickup_assigned_rider_pivot")
        .select(PICKUP_PIVOT_COLUMNS)
        .order("assigned_total", { ascending: false })
        .range(from, from + PAGE_ROWS - 1);
      if (result.error) throw result.error;
      const chunk = (result.data ?? []) as PickupPivotRow[];
      collected.push(...chunk);
      if (chunk.length < PAGE_ROWS) break;
    }
    setRiders(collected);
    setSnapshotAt(collected[0]?.snapshot_at ?? collected[0]?.updated_at ?? null);
  }, []);

  const runLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không tải được tồn pickup Assigned.");
    } finally {
      setLoading(false);
    }
  }, [load]);

  const refreshPivot = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const supabase = createClient();
      const result = await supabase.rpc("refresh_pickup_assigned_rider_pivot");
      if (result.error) throw result.error;
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không refresh được pivot rider.");
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
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runLoad]);

  useSupabaseRealtime({ table: "pickup_assigned_rider_pivot", onChange: scheduleLoad, debounceMs: 800 });
  useSupabaseRealtime({ table: "pickup_48h_realtime_riders", onChange: scheduleLoad, debounceMs: 1200 });
  useReportInitialDataLoading("pickup-inventory", loading);

  const kv5 = useMemo(() => buildPickupBoard(riders, "KV5"), [riders]);
  const kv6 = useMemo(() => buildPickupBoard(riders, "KV6"), [riders]);
  const filtered = useMemo(
    () => ({ kv5: filterPickupBoard(kv5, query, cot, heat), kv6: filterPickupBoard(kv6, query, cot, heat) }),
    [kv5, kv6, query, cot, heat],
  );
  const analytics = useMemo(() => pickupAnalytics(filtered.kv5, filtered.kv6, cot), [filtered, cot]);
  const boards = {
    kv5: filtered.kv5,
    kv6: filtered.kv6,
    kv5n: visibleBoardTotal(filtered.kv5, cot),
    kv6n: visibleBoardTotal(filtered.kv6, cot),
    all: analytics.visible,
  };

  const selectedRiders = useMemo(() => {
    if (!selected) return [];
    const q = query.trim();
    return riders
      .filter((row) => matchesFocus(row, selected))
      .filter((row) => matchesRiderCot(row.rider_cot, cot))
      .filter((row) => !q || searchBlob([row.driver_id, row.driver_name, row.zones, row.rider_cot, riderSheetLabel(row)]).includes(searchBlob([q])))
      .sort((a, b) => riderPending(b) - riderPending(a) || String(a.driver_name ?? "").localeCompare(String(b.driver_name ?? ""), "vi"));
  }, [riders, selected, query, cot]);

  const pageCount = Math.max(1, Math.ceil(selectedRiders.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRiders = selectedRiders.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const selectFocus = (focus: InventoryFocus) => {
    setSelected(focus);
    setPage(1);
  };

  return (
    <div className="dashboard-control mx-auto max-w-[1680px] space-y-5">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Điều hành tồn · Pickup Assigned</div>
          <h1>Tồn pickup</h1>
          <p>Assigned theo rider từ pickup_48h_no_api2. Mỗi rider tách COT1 / COT2. Cùng tuyến thì gom một nhóm như sheet assigned_riders_today.</p>
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
          <Button type="button" variant="secondary" onClick={() => void refreshPivot()} disabled={loading || refreshing}>
            <RefreshCcw size={16} className={loading || refreshing ? "animate-spin" : undefined} /><span>{refreshing ? "Đang pivot..." : "Làm mới pivot"}</span>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Assigned KV5 + KV6" value={boards.all} hint={`${analytics.riders} rider · ${analytics.zones} nhóm tuyến`} accent="ink" />
        <StatTile label="Khu vực 5" value={boards.kv5n} hint={`${analytics.visible ? Math.round((boards.kv5n / analytics.visible) * 100) : 0}% tổng assigned`} accent="blue" />
        <StatTile label="Khu vực 6" value={boards.kv6n} hint={`${analytics.visible ? Math.round((boards.kv6n / analytics.visible) * 100) : 0}% tổng assigned`} accent="teal" />
        <StatTile label="Rider đỏ" value={analytics.hotRiders} hint="≥ 36 đơn Assigned" accent={analytics.hotRiders ? "red" : "green"} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <article className="xl:col-span-4 overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
          <ChartHead title="Cơ cấu khu vực" caption="Assigned theo KV và COT rider" />
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
          <ChartHead title="Áp lực theo tuyến" caption="Top nhóm zone còn Assigned" />
          <div className="px-5 pb-5"><BarChart rows={analytics.topZones} /></div>
        </article>
        <article className="xl:col-span-12 overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
          <ChartHead title="Phổ rủi ro rider" caption="Hết tồn / ít / vừa / cao / đỏ" />
          <div className="px-5 pb-5"><RiskStrip bins={analytics.heatBins} /></div>
        </article>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" size={16} />
          <Input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Tìm rider, mã, tuyến" className="pl-9" />
        </span>
        <Seg value={cot} onChange={setCot} options={[{ id: "all", label: "Cả COT" }, { id: "cot1", label: "COT 1" }, { id: "cot2", label: "COT 2" }]} />
        <Seg value={heat} onChange={setHeat} options={[{ id: "all", label: "Tất cả rider" }, { id: "hot", label: "Chỉ rider đỏ" }]} />
        <HeatLegend />
      </div>

      {error ? <div role="alert" className="dashboard-error">{error}</div> : null}
      {loading && !riders.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="h-[36rem] animate-pulse rounded-2xl bg-[var(--color-paper-3)] xl:col-span-6" />
          <div className="h-[36rem] animate-pulse rounded-2xl bg-[var(--color-paper-3)] xl:col-span-6" />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-6">
            <AreaBoard title="Khu vực 5" districts={filtered.kv5} cot={cot} selected={selected} updatedAt={snapshotAt} onSelect={selectFocus} parentNoun="tuyến" childNoun="rider" columnLabel="Tuyến / Rider Assigned" />
            <AreaBoard title="Khu vực 6" districts={filtered.kv6} cot={cot} selected={selected} updatedAt={snapshotAt} onSelect={selectFocus} parentNoun="tuyến" childNoun="rider" columnLabel="Tuyến / Rider Assigned" />
          </div>
          <aside className="xl:sticky xl:top-4 xl:col-span-6">
            <RiderPanel
              selected={selected}
              riders={pageRiders}
              total={selectedRiders.length}
              page={safePage}
              pageCount={pageCount}
              onPrev={() => setPage((value) => Math.max(1, value - 1))}
              onNext={() => setPage((value) => Math.min(pageCount, value + 1))}
              onClose={() => setSelected(null)}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

function RiderPanel({
  selected,
  riders,
  total,
  page,
  pageCount,
  onPrev,
  onNext,
  onClose,
}: {
  selected: InventoryFocus | null;
  riders: PickupPivotRow[];
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
          <p className="text-sm font-bold text-[var(--color-ink)]">Chưa chọn tuyến / rider</p>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Bấm một nhóm tuyến hoặc rider bên trái để xem Assigned + onhold.</p>
        </div>
      </section>
    );
  }

  const assigned = riders.reduce((sum, row) => sum + n(row.assigned_total), 0);
  const cot1 = riders.reduce((sum, row) => sum + n(row.assigned_cot1), 0);
  const cot2 = riders.reduce((sum, row) => sum + n(row.assigned_cot2), 0);
  const onhold = riders.reduce((sum, row) => sum + n(row.onhold_orders), 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-rule)] px-4 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">{selected.area} · assigned_riders_today</p>
          <h2 className="text-base font-bold text-[var(--color-ink)]">{selected.ward ?? selected.district}</h2>
          <p className="text-sm text-[var(--color-muted)]">{total.toLocaleString("vi-VN")} rider · Assigned {assigned.toLocaleString("vi-VN")} · onhold {onhold.toLocaleString("vi-VN")}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onClose}><X size={16} /> Đóng</Button>
      </div>
      <div className="grid grid-cols-3 gap-2 border-b border-[var(--color-rule)] px-4 py-3 text-xs">
        <MiniMetric label="COT 1" value={cot1} />
        <MiniMetric label="COT 2" value={cot2} />
        <MiniMetric label="Tổng" value={assigned} />
      </div>
      <div className="max-h-[min(70vh,40rem)] overflow-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="sticky top-0 bg-[var(--color-paper-2)] text-xs text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3">Rider</th>
              <th className="px-4 py-3">Tuyến</th>
              <th className="px-4 py-3 text-right">COT1</th>
              <th className="px-4 py-3 text-right">COT2</th>
              <th className="px-4 py-3 text-right">Onhold</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {!riders.length ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-[var(--color-muted)]">Không có rider Assigned trong nhóm này.</td></tr>
            ) : riders.map((row) => {
              const pending = riderPending(row);
              return (
                <tr key={row.driver_id} className="border-t border-[var(--color-rule)]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--color-ink)]">{riderSheetLabel(row)}</p>
                    <p className="font-mono text-xs text-[var(--color-muted)]">{row.rider_cot || "—"}</p>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-ink-2)]">{cleanZones(row.zones)}</td>
                  <td className={`px-4 py-3 text-right font-mono ${n(row.assigned_cot1) <= 0 ? "text-slate-300" : ""}`}>{n(row.assigned_cot1).toLocaleString("vi-VN")}</td>
                  <td className={`px-4 py-3 text-right font-mono ${n(row.assigned_cot2) <= 0 ? "text-slate-300" : ""}`}>{n(row.assigned_cot2).toLocaleString("vi-VN")}</td>
                  <td className="px-4 py-3 text-right font-mono">{n(row.onhold_orders).toLocaleString("vi-VN")}</td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${pending <= 0 ? "text-slate-300" : "text-[var(--color-ink)]"}`}>{pending.toLocaleString("vi-VN")}</td>
                </tr>
              );
            })}
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
