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
  PICKUP_STATUS_LABEL,
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
import { fetchPickupWardExact, type WardExact } from "@/components/lmhub-inventory/use-pickup-ward-riders";

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
  const [expanded, setExpanded] = useState<string[]>([]);
  // Rider panel: chi dem don CON status dang xem trong raw (scoped 1 phuong,
  // distinct theo shipment_id). Cache theo tab+phuong de bam lai hien ngay.
  type ExactEntry = { loading: boolean; data?: WardExact; error?: string };
  const [exactCache, setExactCache] = useState<Record<string, ExactEntry>>({});
  // Nguon tong phuong: COUNT(DISTINCT shipment_id) co status X trong raw
  // pickup_48h_no_api2 (RPC pickup_ward_board). Neu RPC chua duoc chay tren
  // Supabase thi fallback gom distinct o client (cham hon) — khong dung so
  // assign_orders cua bang tong hop vi lech voi raw.
  const [boardNotice, setBoardNotice] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [waitingSnapshot, setWaitingSnapshot] = useState(false);
  const [queueNote, setQueueNote] = useState<string | null>(null);
  const [queueMeta, setQueueMeta] = useState<{ pending: number; running: number; lastStatus: string; lastMessage: string; lastKind?: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baselineRef = useRef<string | null>(null);

  // Board dem CHINH XAC: COUNT(DISTINCT shipment_id) co status X trong raw
  // pickup_48h_no_api2, group theo (area, ward, cot).
  // 0) API cung origin (server dung service key): tranh loi apikey trinh duyet.
  // 1) RPC pickup_ward_board truc tiep.
  // 2) Fallback: quet raw phan trang + distinct o client.
  const load = useCallback(async (nextStatus = status) => {
    const supabase = createClient();
    const label = PICKUP_STATUS_LABEL[nextStatus];
    const toRow = (area: string, ward: string, cot: string, orders: number): PickupStatusRow | null => {
      const a = area.trim().toUpperCase();
      if (a !== "KV5" && a !== "KV6") return null;
      if (!Number.isFinite(orders) || orders <= 0) return null;
      return {
        area: a,
        district: "—",
        ward: ward.trim() || "Chưa có phường",
        zone: "",
        cot,
        orders,
        snapshot_id: null,
        snapshot_at: null,
        updated_at: null,
      };
    };
    // --- Cach 0: API cung origin ---
    try {
      const params = new URLSearchParams({ view: "board", p_status: label });
      const res = await fetch(`/api/pickup-inventory?${params.toString()}`, { cache: "no-store" });
      const payload = await res.json().catch(() => null) as { success?: boolean; rows?: Array<{ area?: string | null; ward?: string | null; cot?: string | null; orders?: number | string | null }>; error?: string } | null;
      if (res.ok && payload?.success) {
        const collected: PickupStatusRow[] = [];
        for (const row of payload.rows ?? []) {
          const built = toRow(String(row.area ?? ""), String(row.ward ?? ""), String(row.cot ?? "COT1"), Number(row.orders ?? 0));
          if (built) collected.push(built);
        }
        collected.sort((a, b) => (b.orders ?? 0) - (a.orders ?? 0));
        setRows(collected);
        setSnapshotAt(new Date().toISOString());
        setBoardNotice(null);
        return;
      }
      throw new Error(payload?.error ?? `API ${res.status}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[pickup-board] API loi, fallback Supabase truc tiep:", err);
    }
    // --- Cach 1: RPC ---
    try {
      const rpc = await supabase.rpc("pickup_ward_board", { p_status: label });
      if (!rpc.error) {
        const collected: PickupStatusRow[] = [];
        for (const row of (rpc.data ?? []) as Array<{ area?: string | null; ward?: string | null; cot?: string | null; orders?: number | string | null }>) {
          const built = toRow(String(row.area ?? ""), String(row.ward ?? ""), String(row.cot ?? "COT1"), Number(row.orders ?? 0));
          if (built) collected.push(built);
        }
        collected.sort((a, b) => (b.orders ?? 0) - (a.orders ?? 0));
        setRows(collected);
        setSnapshotAt(new Date().toISOString());
        setBoardNotice(null);
        return;
      }
      // eslint-disable-next-line no-console
      console.warn("[pickup-board] RPC pickup_ward_board chua co, fallback quet raw:", rpc.error.message);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[pickup-board] RPC loi, fallback quet raw:", err);
    }
    // --- Cach 2 (fallback): quet raw phan trang SONG SONG (8 trang/luot),
    // distinct theo shipment_id. Nhanh gap nhieu lan so voi tuan tu.
    setBoardNotice("API/RPC không dùng được — đang đếm trực tiếp từ raw (chậm hơn).");
    const seen = new Set<string>();
    const agg = new Map<string, number>();
    const PAGE = 1000;
    const CONC = 8;
    type RawBoardRow = { shipment_id?: string | null; ward?: string | null; area?: string | null; cot_group?: string | null };
    const eatChunk = (chunk: RawBoardRow[]) => {
      for (const row of chunk) {
        const order = String(row.shipment_id ?? "").trim();
        if (!order || seen.has(order)) continue;
        seen.add(order);
        const key = `${String(row.area ?? "").trim().toUpperCase()}||${String(row.ward ?? "").trim() || "Chưa có phường"}||${String(row.cot_group ?? "COT1").trim() || "COT1"}`;
        agg.set(key, (agg.get(key) ?? 0) + 1);
      }
    };
    let from = 0;
    for (;;) {
      const batch = await Promise.all(
        Array.from({ length: CONC }, (_, i) => {
          const f = from + i * PAGE;
          return supabase
            .from("pickup_48h_no_api2")
            .select("shipment_id,ward,area,cot_group")
            .eq("status", label)
            .in("area", ["KV5", "KV6"])
            .order("shipment_id", { ascending: true })
            .range(f, f + PAGE - 1);
        }),
      );
      let finished = false;
      for (const result of batch) {
        if (result.error) throw result.error;
        const chunk = (result.data ?? []) as RawBoardRow[];
        eatChunk(chunk);
        if (chunk.length < PAGE) { finished = true; break; }
      }
      if (finished) break;
      from += PAGE * CONC;
      if (from > 60000) break; // tran an toan: toi da ~60k dong
    }
    const collected: PickupStatusRow[] = [];
    for (const [key, orders] of agg) {
      const [area, ward, cot] = key.split("||");
      const built = toRow(area, ward, cot, orders);
      if (built) collected.push(built);
    }
    collected.sort((a, b) => (b.orders ?? 0) - (a.orders ?? 0));
    setRows(collected);
    setSnapshotAt(new Date().toISOString());
  }, [status]);

  const runLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { await load(); }
    catch (err) {
      // eslint-disable-next-line no-console
      console.error("[pickup-board]", err);
      setError(err instanceof Error ? `Không tải được tồn pickup: ${err.message}` : "Không tải được tồn pickup.");
    }
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
    setExpanded([]);
    setExactCache({});
  };

  const toggleWard = useCallback((ward: FlatWard) => {
    const key = `${ward.area}||${ward.ward}`;
    setExpanded((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  }, []);

  const allOpen = kv5Wards.length + kv6Wards.length > 0 && [...kv5Wards, ...kv6Wards].every((w) => expanded.includes(`${w.area}||${w.ward}`));
  const toggleAllRiders = useCallback(() => {
    const all = [...kv5Wards, ...kv6Wards].map((w) => `${w.area}||${w.ward}`);
    setExpanded((current) => (all.length > 0 && all.every((k) => current.includes(k)) ? [] : all));
  }, [kv5Wards, kv6Wards]);

  // Bam phuong nao -> dem exact phuong do trong raw (status dang xem).
  // Query scoped 1 phuong + da co index (status, area, ward) nen ~200ms.
  // QUAN TRONG: khong de exactCache trong deps — truoc day set loading gay
  // re-render -> cleanup chay -> abort mat request vua gui (request do trong
  // DevTools). In-flight theo doi bang ref; retry dem bang tick rieng.
  const inflightRef = useRef<Set<string>>(new Set());
  const exactCacheRef = useRef(exactCache);
  exactCacheRef.current = exactCache;
  const [exactRetryTick, setExactRetryTick] = useState(0);
  useEffect(() => {
    if (!expanded.length) return;
    const missing = expanded.filter((ek) => {
      const key = `${status}||${ek}`;
      return !exactCacheRef.current[key] && !inflightRef.current.has(key);
    });
    if (!missing.length) return;
    let cancelled = false;
    const controllers: AbortController[] = [];
    missing.forEach((ek, idx) => {
      const separator = ek.indexOf("||");
      const area = ek.slice(0, separator);
      const ward = ek.slice(separator + 2);
      const key = `${status}||${ek}`;
      inflightRef.current.add(key);
      const controller = new AbortController();
      controllers.push(controller);
      const timerId = setTimeout(() => controller.abort(), 10000 + idx * 500);
      setExactCache((prev) => (prev[key] ? prev : { ...prev, [key]: { loading: true } }));
      fetchPickupWardExact(area, ward, PICKUP_STATUS_LABEL[status], controller.signal)
        .then((data) => {
          if (cancelled) return;
          inflightRef.current.delete(key);
          setExactCache((prev) => ({ ...prev, [key]: { loading: false, data } }));
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          inflightRef.current.delete(key);
          const isAbort = err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message));
          setExactCache((prev) => ({
            ...prev,
            [key]: { loading: false, error: isAbort ? "Query rider quá 10s. Bấm Thử lại." : err instanceof Error ? err.message : "Không tải được rider." },
          }));
        })
        .finally(() => clearTimeout(timerId));
    });
    return () => { cancelled = true; controllers.forEach((c) => c.abort()); missing.forEach((ek) => inflightRef.current.delete(`${status}||${ek}`)); };
  }, [expanded, status, exactRetryTick]);

  const retryExact = useCallback((key: string) => {
    setExactCache((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    inflightRef.current.delete(key);
    setExactRetryTick((t) => t + 1);
  }, []);

  const exportAreaSummaryImage = useCallback(async () => {
    const activeCot: "COT1" | "COT2" = cot === "cot1" ? "COT1" : cot === "cot2" ? "COT2" : (new Date().getHours() < 12 ? "COT1" : "COT2");
    const isActive = (cotVal: string) => (activeCot === "COT2" ? String(cotVal ?? "").toUpperCase() === "COT2" : String(cotVal ?? "").toUpperCase() !== "COT2");
    // Tu tai het rider moi phuong dang hien tren board (khong phu thuoc
    // exactCache / phuong da mo) de anh luon du rider.
    const wardList: { area: string; ward: string }[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const area = String(r.area ?? "").toUpperCase();
      const ward = String(r.ward ?? "");
      if ((area !== "KV5" && area !== "KV6") || !ward) continue;
      const k = `${area}||${ward}`;
      if (seen.has(k)) continue;
      seen.add(k);
      wardList.push({ area, ward });
    }
    alert(`Dang tai rider ${activeCot} cho ${wardList.length} phuong, cho chut...`);
    const results = await Promise.allSettled(
      wardList.map(async ({ area, ward }) => {
        const data = await fetchPickupWardExact(area, ward, PICKUP_STATUS_LABEL[status]);
        return { area, ward, data };
      }),
    );
    type RiderRow = { rider: string; ward: string; area: string; count: number; shared: number };
    const byArea = new Map<string, RiderRow[]>();
    for (const res of results) {
      if (res.status !== "fulfilled") continue;
      const { area, ward, data } = res.value;
      const perRider = new Map<string, { count: number; shared: number }>();
      for (const o of data.orders) {
        if (!isActive(o.cot)) continue;
        const isShared = o.riders.length > 1;
        for (const name of o.riders) {
          const cur = perRider.get(name) ?? { count: 0, shared: 0 };
          cur.count += 1;
          if (isShared) cur.shared += 1;
          perRider.set(name, cur);
        }
      }
      // Bo sung rider don rieng COT kia (van phai hien theo yeu cau)
      const hasActive = new Set(perRider.keys());
      for (const o of data.orders) {
        if (isActive(o.cot) || o.riders.length !== 1) continue;
        const name = o.riders[0];
        if (hasActive.has(name) || perRider.has(name)) continue;
        perRider.set(name, { count: 1, shared: 0 });
      }
      for (const [rider, v] of perRider) {
        const arr = byArea.get(area) ?? [];
        arr.push({ rider, ward, area, count: v.count, shared: v.shared });
        byArea.set(area, arr);
      }
    }
    const CHUNK = 30;
    const timeStr = new Date().toLocaleString("vi-VN");
    let imgIndex = 0;
    for (const area of ["KV5", "KV6"]) {
      const list = (byArea.get(area) ?? []).sort((a, b) => b.count - a.count || a.rider.localeCompare(b.rider, "vi"));
      if (!list.length) continue;
      for (let start = 0; start < list.length; start += CHUNK) {
        const chunk = list.slice(start, start + CHUNK);
        const page = Math.floor(start / CHUNK) + 1;
        const pages = Math.ceil(list.length / CHUNK);
        const title = `RIDER CHUA CAP NHAT ${activeCot} - ${area}${pages > 1 ? ` (${page}/${pages})` : ""}`;
        const cols = ["STT", "RIDER", "PHUONG", "DON"];
        const W = 900;
        const headerH = 64;
        const rowH = 34;
        const H = headerH + 40 + (chunk.length + 1) * rowH + 30;
        const canvas = document.createElement("canvas");
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 20px Arial";
        ctx.fillText(title, 24, 34);
        ctx.fillStyle = "#64748b";
        ctx.font = "13px Arial";
        ctx.fillText(`${statusLabel} - ${timeStr} - ${area}: ${list.length} rider / ${list.reduce((s, r) => s + r.count, 0)} don`, 24, 56);
        const colX = [24, 80, 380, 740];
        let y = headerH + 40;
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(24, y - 26, W - 48, 30);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px Arial";
        cols.forEach((c, i) => ctx.fillText(c, colX[i] + 8, y - 6));
        y += 8;
        ctx.font = "13px Arial";
        chunk.forEach((r, idx) => {
          ctx.fillStyle = (start + idx) % 2 ? "#f8fafc" : "#ffffff";
          ctx.fillRect(24, y - 22, W - 48, rowH);
          ctx.strokeStyle = "#e2e8f0";
          ctx.strokeRect(24, y - 22, W - 48, rowH);
          ctx.fillStyle = "#0f172a";
          ctx.fillText(String(start + idx + 1), colX[0] + 8, y);
          ctx.fillText(r.rider.slice(0, 34), colX[1] + 8, y);
          ctx.fillText(r.ward.slice(0, 36), colX[2] + 8, y);
          ctx.font = "bold 13px Arial";
          ctx.fillStyle = r.shared > 0 ? "#b45309" : "#0f172a";
          ctx.fillText(r.shared > 0 ? `${r.count} (${r.shared} chung)` : String(r.count), colX[3] + 8, y);
          ctx.font = "13px Arial";
          ctx.fillStyle = "#0f172a";
          y += rowH;
        });
        const url = canvas.toDataURL("image/png");
        imgIndex += 1;
        const a = document.createElement("a");
        a.href = url;
        a.download = `rider-chua-cap-nhat-${activeCot}-${area}${pages > 1 ? `-p${page}` : ""}.png`;
        a.click();
        try {
          const blob = await (await fetch(url)).blob();
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        } catch { /* bo qua, van tai file */ }
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    if (!imgIndex) alert("Khong co rider nao de chup.");
    else alert(`Da chup ${imgIndex} anh (KV5/KV6, moi anh toi da ${CHUNK} rider) - anh vua tai ve, anh cuoi da copy san, qua Seatalk Ctrl+V.`);
  }, [rows, cot, status]);

  // Board dem tu raw -> chi can nghe raw.
  useSupabaseRealtime({ table: "pickup_48h_no_api2", onChange: scheduleLoad, debounceMs: 1500 });

  return (
    <div className="dashboard-control mx-auto max-w-[1680px] space-y-5">
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker"><span className="dashboard-live-dot" />Điều hành tồn · Pickup {statusLabel}</div>
          <h1>Tồn pickup</h1>
          <p>
            Tổng phường = đơn distinct còn status {statusLabel} trong raw. Bấm phường xem đúng rider còn đơn {statusLabel} đó.
          </p>
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
          <Button type="button" variant="secondary" onClick={() => void exportAreaSummaryImage()}>
            <Download size={16} /><span>Chụp ảnh tổng rider</span>
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
        {boardNotice ? (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            {boardNotice}
          </span>
        ) : null}
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
        <Button type="button" variant="secondary" onClick={toggleAllRiders}>
          <ChevronDown size={16} className={`transition-transform ${allOpen ? "rotate-180" : ""}`} /><span>{allOpen ? `Đóng full rider (${expanded.length})` : "Mở full rider"}</span>
        </Button>
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
            <WardTable title="Khu vực 5" wards={kv5Wards} cot={cot} statusKey={status} statusLabel={statusLabel} updatedAt={snapshotAt} expandedKey={expanded} compact={allOpen} exactCache={exactCache} onToggle={toggleWard} onRetry={retryExact} onDetail={(ward) => setModal({ area: ward.area, ward: ward.ward })} />
          ) : null}
          {areaFilter !== "KV5" ? (
            <WardTable title="Khu vực 6" wards={kv6Wards} cot={cot} statusKey={status} statusLabel={statusLabel} updatedAt={snapshotAt} expandedKey={expanded} compact={allOpen} exactCache={exactCache} onToggle={toggleWard} onRetry={retryExact} onDetail={(ward) => setModal({ area: ward.area, ward: ward.ward })} />
          ) : null}
        </div>
      )}
      {modal ? <WardModal area={modal.area} ward={modal.ward} statusLabel={statusLabel} cot={cot} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

type FlatWard = { ward: string; area: Area; cot1: number; cot2: number; total: number };
type RiderShare = { name: string; orders: number };

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

function WardTable({ title, wards, cot, statusKey, statusLabel, updatedAt, expandedKey, compact, exactCache, onToggle, onRetry, onDetail }: { title: string; wards: FlatWard[]; cot: CotFilter; statusKey: PickupStatusKey; statusLabel: string; updatedAt: string | null; expandedKey: string[]; compact?: boolean; exactCache: Record<string, { loading: boolean; data?: WardExact; error?: string }>; onToggle: (ward: FlatWard) => void; onRetry: (key: string) => void; onDetail: (ward: FlatWard) => void }) {
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
              const isOpen = expandedKey.includes(key);
              if (compact) {
                if (!isOpen) return null;
                return (
                  <Fragment key={ward.ward}>
                    <tr className="border-t border-[var(--color-rule)]">
                      <td colSpan={4} className="bg-[var(--color-paper-2)]/60 px-4 py-3">
                        <p className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-[var(--color-accent)]">
                          <button type="button" onClick={() => onToggle(ward)} className="hover:underline">{ward.ward}</button>
                          <span className="font-mono">{grand.toLocaleString("vi-VN")} đơn</span>
                        </p>
                        <RiderPanel entry={exactCache[`${statusKey}||${key}`]} cot={cot} ward={ward} statusLabel={statusLabel} onDetail={() => onDetail(ward)} onRetry={() => onRetry(`${statusKey}||${key}`)} />
                      </td>
                    </tr>
                  </Fragment>
                );
              }
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
                        <RiderPanel entry={exactCache[`${statusKey}||${key}`]} cot={cot} ward={ward} statusLabel={statusLabel} onDetail={() => onDetail(ward)} onRetry={() => onRetry(`${statusKey}||${key}`)} />
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

function RiderPanel({ entry, cot, ward, statusLabel, onDetail, onRetry }: { entry: { loading: boolean; data?: WardExact; error?: string } | undefined; cot: CotFilter; ward: FlatWard; statusLabel: string; onDetail: () => void; onRetry: () => void }) {
  const [showShared, setShowShared] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const data = entry?.data;
  const activeCot: "COT1" | "COT2" = cot === "cot1" ? "COT1" : cot === "cot2" ? "COT2" : (new Date().getHours() < 12 ? "COT1" : "COT2");
  const filteredOrders = useMemo(() => (data ? data.orders.filter((o) => (activeCot === "COT2" ? o.cot === "COT2" : o.cot !== "COT2")) : []), [data, activeCot]);
  const sharedByOrder = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const o of filteredOrders) {
      if (o.riders.length > 1) map.set(o.order, o.riders);
    }
    return map;
  }, [filteredOrders]);
  const pivotRows = useMemo(() => {
    if (!data) return [] as { name: string; count: number; codes: string[]; fromOtherCot: boolean }[];
    const isActive = (cotVal: string) => (activeCot === "COT2" ? cotVal === "COT2" : cotVal !== "COT2");
    const activeMap = new Map<string, string[]>();
    for (const o of data.orders) {
      if (!isActive(o.cot)) continue;
      for (const name of o.riders) {
        const arr = activeMap.get(name);
        if (arr) arr.push(o.order);
        else activeMap.set(name, [o.order]);
      }
    }
    const activeRiders = new Set(activeMap.keys());
    const soloOtherMap = new Map<string, string[]>();
    for (const o of data.orders) {
      if (isActive(o.cot)) continue;
      if (o.riders.length !== 1) continue;
      const name = o.riders[0];
      if (activeRiders.has(name)) continue;
      const arr = soloOtherMap.get(name);
      if (arr) arr.push(o.order);
      else soloOtherMap.set(name, [o.order]);
    }
    const rows: { name: string; count: number; codes: string[]; fromOtherCot: boolean }[] = [
      ...[...activeMap.entries()].map(([name, codes]) => ({ name, count: codes.length, codes, fromOtherCot: false })),
      ...[...soloOtherMap.entries()].map(([name, codes]) => ({ name, count: codes.length, codes, fromOtherCot: true })),
    ];
    return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"));
  }, [data, activeCot]);
  const partnerOf = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const o of filteredOrders) {
      if (o.riders.length < 2) continue;
      for (const r of o.riders) {
        let s = map.get(r);
        if (!s) { s = new Set<string>(); map.set(r, s); }
        for (const other of o.riders) if (other !== r) s.add(other);
      }
    }
    return map;
  }, [filteredOrders]);
  if (!entry || entry.loading) {
    return <p className="py-2 text-center text-sm text-[var(--color-muted)]">Đang tải rider còn đơn {statusLabel}...</p>;
  }
  if (entry.error || !entry.data || !data) {
    return (
      <div className="py-2 text-center">
        <p className="text-sm text-red-600">{entry.error ?? "Không tải được rider."}</p>
        <button type="button" onClick={onRetry} className="mt-2 rounded-lg border border-[var(--color-rule)] bg-[var(--color-paper)] px-3 py-1.5 text-xs font-bold text-[var(--color-accent)]">Thử lại</button>
      </div>
    );
  }
  return (
    <div>
      {!filteredOrders.length ? (
        <p className="py-2 text-center text-xs text-[var(--color-muted)]">Phường này không còn đơn {statusLabel} {activeCot}.</p>
      ) : (
        <div className="max-h-72 overflow-auto rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-[var(--color-paper-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2 font-semibold">Rider {activeCot === "COT1" ? "COT1" : "COT2"} · <span className="font-mono">{filteredOrders.length.toLocaleString("vi-VN")} đơn</span></th>
                <th className="w-24 px-3 py-2 text-right font-semibold">Đơn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-rule)]">
              {pivotRows.map((row) => {
                const isSel = selected === row.name;
                const isPartner = selected != null && (partnerOf.get(selected)?.has(row.name) ?? false);
                const shared = row.codes.filter((c) => sharedByOrder.has(c));
                const maxGroup = shared.length ? Math.max(...shared.map((c) => sharedByOrder.get(c)?.length ?? 0)) : 0;
                return (
                <tr
                  key={row.name}
                  onClick={() => setSelected((v) => (v === row.name ? null : row.name))}
                  title={shared.length ? shared.map((c) => `${c} — chung (${sharedByOrder.get(c)?.length}): ${(sharedByOrder.get(c) ?? []).join(" + ")}`).join("\n") : "Đơn riêng — bấm để xem ai chung đơn"}
                  className={`cursor-pointer align-top ${isSel ? "bg-sky-100" : isPartner ? "bg-amber-100" : ""}`}
                >
                  <td className="px-3 py-1.5 font-semibold text-[var(--color-ink-2)]">
                    {row.name}
                    {row.fromOtherCot ? (
                      <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-px text-[10px] font-bold text-slate-500" title="Rider đơn riêng COT còn lại — vẫn hiện">
                        riêng
                      </span>
                    ) : null}
                    {(partnerOf.get(row.name)?.size ?? 0) > 0 ? (
                      <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800" title={`Chung đơn với: ${[...(partnerOf.get(row.name) ?? [])].join(", ")}`}>
                        ({(partnerOf.get(row.name)?.size ?? 0) + 1})
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs font-bold ${shared.length ? "bg-amber-100 text-amber-900" : "text-[var(--color-ink-2)]"}`}>
                      {row.count.toLocaleString("vi-VN")}
                      {shared.length ? <span>({maxGroup})</span> : null}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {data.orders.length ? (
        data.sharedTotal > 0 ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Có <strong>{data.sharedTotal.toLocaleString("vi-VN")} đơn chung</strong> trên {data.distinctTotal.toLocaleString("vi-VN")} đơn — bấm vào 1 rider để các rider chung đơn sáng cùng màu vàng. Số trong ( ) = số người cùng giữ đơn đó, vd (3) là 3 người chung.
          </p>
        ) : (
          <p className="mt-2 text-xs text-emerald-700">Cả {data.distinctTotal.toLocaleString("vi-VN")} đơn đều riêng 1 rider.</p>
        )
      ) : null}
      {data.noRiderTotal > 0 ? (
        <p className="mt-1 text-xs text-[var(--color-muted)]">{data.noRiderTotal.toLocaleString("vi-VN")} đơn chưa có tên rider.</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setShowShared((v) => !v)} className="text-xs font-bold text-[var(--color-accent)] hover:underline">
          {showShared ? "Ẩn đơn chung ▲" : `Xem ${data.sharedTotal.toLocaleString("vi-VN")} đơn chung ▼`}
        </button>
        <button type="button" onClick={onDetail} className="text-xs font-bold text-[var(--color-accent)] hover:underline">Chi tiết PUP / đơn {ward.ward} →</button>
      </div>
      {showShared ? (
        data.shared.length ? (
          <ul className="mt-2 max-h-40 divide-y divide-[var(--color-rule)] overflow-auto rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper)]">
            {data.shared.map((item) => (
              <li key={item.order} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs">
                <span className="font-mono font-semibold">{item.order}</span>
                <span className="text-[var(--color-muted)]">{item.riders.join(" + ")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-emerald-700">Không có đơn nào gán chung nhiều rider trong phường này.</p>
        )
      ) : null}
    </div>
  );
}

type WardOrder = { pup: string; pupName: string; order: string; cot: string; rider: string; riders: string[]; zone: string };

function parseRiderNames(value: string | null | undefined): string[] {
  return String(value ?? "")
    .split(/[,;\n]+/)
    .map((part) => part.replace(/^\[COT[12]\]\s*/i, "").trim())
    .filter((part) => part && part !== "—");
}

function WardModal({ area, ward, statusLabel, cot, onClose }: { area: string; ward: string; statusLabel: string; cot: CotFilter; onClose: () => void }) {
  const [orders, setOrders] = useState<WardOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyShared, setOnlyShared] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const run = async () => {
      setLoadingOrders(true);
      try {
        // Chi tiet qua RPC POST (body JSON) + ten/tuyen tu cache dung chung
        // (co timeout rieng, fallback rong). Mo popup lan 2 tro di hien ngay.
        const { fetchPickupWardDetailRows, getDriverNameMaps, getWardRoutes } = await import("@/components/lmhub-inventory/use-pickup-ward-riders");
        const [list, routesByDriver, nameMaps] = await Promise.all([
          fetchPickupWardDetailRows(area, ward, statusLabel, controller.signal),
          getWardRoutes(area, ward, controller.signal),
          getDriverNameMaps(controller.signal),
        ]);
        if (cancelled) return;
        const idByName = nameMaps.byName;
        const zoneOf = (riderName: string): string => {
          const id = idByName.get(riderName) ?? idByName.get(riderName.toLowerCase()) ?? "";
          const routes = id ? routesByDriver.get(id) : undefined;
          return routes && routes.size ? [...routes].join(", ") : "";
        };
        setOrders(list.map((row) => {
          const rider = String(row.assigned_riders_today || "");
          const riders = parseRiderNames(rider);
          // Uu tien zone_name co san trong raw; fallback map tuyen tu bang tong hop.
          const rawZone = String(row.zone_name || "").trim();
          const zones = riders.map(zoneOf).filter(Boolean);
          const zone = rawZone || [...new Set(zones)].join(", ");
          return {
            pup: String(row.pickup_point_id || "—"),
            pupName: String(row.pickup_point_name || ""),
            order: String(row.shipment_id || "—"),
            cot: riderCotLabel(String(row.cot_group || "")),
            rider,
            riders,
            zone,
          };
        }));
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
  const sharedCount = orders.filter((row) => row.riders.length > 1).length;
  const visible = orders
    .filter((row) => (cot === "all" ? true : row.cot.toLowerCase() === cot))
    .filter((row) => !onlyShared || row.riders.length > 1)
    .filter((row) => !q || `${row.pup} ${row.pupName} ${row.order} ${row.rider} ${row.zone}`.toLowerCase().includes(q));
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
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-rule)] px-4 py-3">
          <span className="relative block min-w-[220px] flex-1">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm mã PUP, mã đơn, rider, zone" />
          </span>
          <button
            type="button"
            aria-pressed={onlyShared}
            onClick={() => setOnlyShared((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${onlyShared ? "border-amber-400 bg-amber-100 text-amber-800" : "border-[var(--color-rule)] bg-[var(--color-paper)] text-[var(--color-ink-2)]"}`}
          >
            ⇄ Chỉ đơn chung{sharedCount > 0 ? ` (${sharedCount})` : ""}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-[var(--color-paper-2)] text-xs text-[var(--color-muted)]">
              <tr><th className="px-4 py-3">Mã PUP</th><th className="px-4 py-3">Mã đơn</th><th className="px-4 py-3">COT</th><th className="px-4 py-3">Zone</th><th className="px-4 py-3">Rider</th></tr>
            </thead>
            <tbody>
              {loadingOrders ? <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--color-muted)]">Đang tải chi tiết...</td></tr>
              : !visible.length ? <tr><td colSpan={5} className="px-4 py-10 text-center text-[var(--color-muted)]">{onlyShared ? "Không có đơn chung trong phường này." : "Không có đơn."}</td></tr>
              : visible.map((row, index) => {
                const isShared = row.riders.length > 1;
                return (
                  <tr key={`${row.pup}-${row.order}-${index}`} className={`border-t border-[var(--color-rule)] ${isShared ? "bg-amber-50/50" : ""}`}>
                    <td className="px-4 py-3 font-mono text-[13px] font-semibold">{row.pup}</td>
                    <td className="px-4 py-3 font-mono text-[13px]">{row.order}</td>
                    <td className="px-4 py-3 text-xs">{row.cot}</td>
                    <td className="px-4 py-3 text-xs text-[var(--color-ink-2)]">{row.zone || "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      {row.riders.length ? (
                        <span className="flex flex-wrap items-center gap-1">
                          {isShared ? <span title={`Đơn chung giữa: ${row.riders.join(", ")}`} className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">⇄ chung {row.riders.length}</span> : null}
                          {row.riders.map((name) => {
                            const others = row.riders.filter((n) => n !== name);
                            return (
                              <span key={name} title={others.length ? `Chung đơn này với: ${others.join(", ")}` : "Đơn riêng 1 rider"} className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-[var(--color-ink-2)]">
                                {name}
                              </span>
                            );
                          })}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
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
