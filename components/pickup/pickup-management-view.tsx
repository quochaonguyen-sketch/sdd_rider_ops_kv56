"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Database, Download, ListChecks, MapPinned, RefreshCcw, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import styles from "./pickup-management-view.module.css";

type PickupAssignment = {
  id: string;
  assignment_key: string;
  assigned_at: string | null;
  cot: string | null;
  route_name: string | null;
  mapped_pickup_point_group: string | null;
  pickup_point_id: string | null;
  pup_code: string | null;
  shop_name: string | null;
  shop_address: string | null;
  ward: string | null;
  district: string | null;
  pickup_status: number | null;
  pickup_retry_assign_type: number | null;
};

type RouteSummary = {
  route: string;
  count: number;
  helper: string;
};

const PAGE_SIZE = 1000;
const ROW_PAGE_SIZE = 80;

export function PickupManagementView() {
  const [rows, setRows] = useState<PickupAssignment[]>([]);
  const [selectedRoute, setSelectedRoute] = useState("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  useReportInitialDataLoading("pickup-management", loading);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAssignments = useCallback(async () => {
    const supabase = createClient();
    const loaded: PickupAssignment[] = [];
    let offset = 0;

    setLoading(true);
    setError(null);

    while (true) {
      const { data, error: queryError } = await supabase
        .from("pickup_assignments")
        .select("id,assignment_key,assigned_at,cot,route_name,mapped_pickup_point_group,pickup_point_id,pup_code,shop_name,shop_address,ward,district,pickup_status,pickup_retry_assign_type")
        .order("route_name", { nullsFirst: false })
        .order("assigned_at")
        .range(offset, offset + PAGE_SIZE - 1);

      if (queryError) {
        setRows([]);
        setError(queryError.message);
        setLoading(false);
        return;
      }

      const batch = (data ?? []) as PickupAssignment[];
      loaded.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    setRows(loaded);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAssignments();
  }, [loadAssignments]);

  const refresh = useCallback(() => {
    void loadAssignments();
  }, [loadAssignments]);

  useSupabaseRealtime({ table: "pickup_assignments", onChange: refresh });

  const routeSummaries = useMemo(() => summarizeRoutes(rows), [rows]);
  const routeOptions = useMemo(
    () =>
      routeSummaries
        .filter((route) => route.route !== "Chưa có tuyến")
        .map((route) => route.route)
        .sort((a, b) => a.localeCompare(b, "vi", { numeric: true })),
    [routeSummaries],
  );
  const selectedRows = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("vi");
    return rows.filter((row) => {
      const route = routeName(row.route_name);
      const matchesRoute = selectedRoute === "all" || route === selectedRoute;
      const matchesQuery =
        !normalizedQuery ||
        [pickupCode(row), row.shop_name, row.shop_address, row.ward, row.district, row.route_name, row.cot]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase("vi").includes(normalizedQuery));
      return matchesRoute && matchesQuery;
    });
  }, [deferredQuery, rows, selectedRoute]);

  const activeRoute = routeSummaries.find((route) => route.route === selectedRoute);
  const featuredRoutes = useMemo(() => {
    const topRoutes = routeSummaries.slice(0, 9);
    if (selectedRoute === "all" || topRoutes.some((route) => route.route === selectedRoute)) return topRoutes;
    const selected = routeSummaries.find((route) => route.route === selectedRoute);
    return selected ? [selected, ...topRoutes].slice(0, 9) : topRoutes;
  }, [routeSummaries, selectedRoute]);
  const pageCount = Math.max(1, Math.ceil(selectedRows.length / ROW_PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const pageStart = (safePage - 1) * ROW_PAGE_SIZE;
  const pagedRows = selectedRows.slice(pageStart, pageStart + ROW_PAGE_SIZE);

  async function changeRoute(row: PickupAssignment, nextRoute: string) {
    const cleanedRoute = nextRoute.trim();
    if (!cleanedRoute || cleanedRoute === routeName(row.route_name)) return;

    const supabase = createClient();
    setUpdatingId(row.id);
    setError(null);
    setSuccess(null);

    const { error: updateError } = await supabase
      .from("pickup_assignments")
      .update({ route_name: cleanedRoute })
      .eq("id", row.id);

    setUpdatingId(null);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setRows((current) =>
      current.map((item) => (item.id === row.id ? { ...item, route_name: cleanedRoute } : item)),
    );
    setSuccess(`Đã chuyển ${pickupCode(row)} sang ${cleanedRoute}.`);
  }

  function exportForPython() {
    if (rows.length === 0) return;

    const csv = buildPickupAssignmentCsv(rows);
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "pickup_assignments.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={styles.page}>
      <header className={styles.commandHeader}>
        <div className={styles.titleBlock}>
          <span className={styles.titleIcon}><ListChecks size={20} /></span>
          <div>
            <p className={styles.contextLine}>Pickup operations · dữ liệu PUP theo tuyến</p>
            <h1>Quản lý PUP</h1>
            <p className={styles.lede}>Tìm shop, đổi tuyến và xuất dữ liệu gán từ cùng một màn hình.</p>
          </div>
        </div>
        <div className={styles.commandActions}>
          <Button type="button" variant="secondary" onClick={refresh} disabled={loading} className={styles.actionButton}>
            <RefreshCcw size={16} className={loading ? styles.spinning : undefined} />
            Làm mới
          </Button>
          <Button type="button" onClick={exportForPython} disabled={loading || rows.length === 0} className={styles.actionButton}>
            <Download size={16} />
            Xuất CSV
          </Button>
        </div>
      </header>

      {error ? <p className={styles.errorBanner}><AlertTriangle size={17} />Không tải hoặc cập nhật được PUP: {error}</p> : null}
      {success ? <p className={styles.successBanner}><CheckCircle2 size={17} />{success}</p> : null}

      <section className={styles.signalStrip} aria-label="Tín hiệu vận hành PUP">
        <MetricCard icon={<Database size={17} />} label="Tổng PUP" value={rows.length} loading={loading} />
        <MetricCard icon={<MapPinned size={17} />} label="Số tuyến" value={routeSummaries.length} loading={loading} />
        <MetricCard icon={<Search size={17} />} label="Đang hiển thị" value={selectedRows.length} loading={loading} />
        <MetricCard icon={<AlertTriangle size={17} />} label="Chưa có tuyến" value={rows.filter((row) => routeName(row.route_name) === "Chưa có tuyến").length} loading={loading} tone="warning" />
      </section>

      <section className={styles.routeIndex} aria-labelledby="route-index-title">
        <div className={styles.sectionHeading}>
          <div><h2 id="route-index-title">Chỉ mục tuyến</h2><p>Chọn nhanh tuyến nhiều PUP hoặc mở toàn bộ danh sách tuyến.</p></div>
          <label className={styles.routeSelectLabel}>
            <span>Tất cả tuyến</span>
            <select value={selectedRoute} onChange={(event) => { setSelectedRoute(event.target.value); setCurrentPage(1); }}>
              <option value="all">Tất cả · {formatNumber(rows.length)} PUP</option>
              {routeSummaries.map((route) => <option key={route.route} value={route.route}>{route.route} · {formatNumber(route.count)}</option>)}
            </select>
          </label>
        </div>
        <div className={styles.routeRail}>
          <RouteTab active={selectedRoute === "all"} label="Tất cả" count={rows.length} helper={`${routeSummaries.length} tuyến`} onClick={() => { setSelectedRoute("all"); setCurrentPage(1); }} />
          {featuredRoutes.map((route) => <RouteTab key={route.route} active={selectedRoute === route.route} label={route.route} count={route.count} helper={route.helper} onClick={() => { setSelectedRoute(route.route); setCurrentPage(1); }} />)}
        </div>
      </section>

      <section className={styles.ledger} aria-labelledby="pup-ledger-title">
        <div className={styles.ledgerToolbar}>
          <div><h2 id="pup-ledger-title">Danh sách PUP</h2><p>{selectedRoute === "all" ? "Toàn bộ dữ liệu" : activeRoute?.route ?? selectedRoute} · {formatNumber(selectedRows.length)} kết quả</p></div>
          <label className={styles.searchField}>
            <span>Tìm trong danh sách</span>
            <div className={styles.searchShell}><Search size={17} /><Input value={query} onChange={(event) => { setQuery(event.target.value); setCurrentPage(1); }} placeholder="Mã PUP, shop, địa chỉ, tuyến…" className={styles.searchInput} />{query ? <button type="button" aria-label="Xóa từ khóa tìm kiếm" onClick={() => setQuery("")}><X size={15} /></button> : null}</div>
          </label>
        </div>

        <div className={styles.tableFrame}>
          <div className={styles.tableHead}><span>PUP</span><span>Shop</span><span>Địa chỉ</span><span>Phường / Quận</span><span>Tuyến hiện tại</span></div>
          <div className={styles.tableBody} aria-live="polite">
            {loading ? Array.from({ length: 8 }, (_, index) => <div key={index} className={styles.skeletonRow}><i /><i /><i /><i /></div>) : null}
            {!loading && selectedRows.length === 0 ? <div className={styles.emptyState}><Search size={21} /><strong>Không có PUP phù hợp.</strong><span>Đổi từ khóa hoặc chọn lại tuyến để mở rộng kết quả.</span><button type="button" onClick={() => { setQuery(""); setSelectedRoute("all"); }}>Xóa bộ lọc</button></div> : null}
            {!loading ? pagedRows.map((row) => <div key={row.id} className={styles.tableRow}>
              <div className={styles.identityCell} data-label="PUP"><strong>{pickupCode(row)}</strong><span>{formatAssignedAt(row.assigned_at)}</span></div>
              <p className={styles.shopCell} data-label="Shop">{row.shop_name || "—"}</p>
              <p className={styles.addressCell} data-label="Địa chỉ" title={row.shop_address || undefined}>{row.shop_address || "—"}</p>
              <div className={styles.locationCell} data-label="Phường / Quận"><strong>{row.ward || "—"}</strong><span>{row.district || "—"}</span></div>
              <div className={styles.routeCell} data-label="Tuyến hiện tại"><RoutePicker row={row} routes={routeOptions} disabled={updatingId === row.id} onChangeRoute={changeRoute} /></div>
            </div>) : null}
          </div>
        </div>

        <footer className={styles.pagination}>
          <span>Hiện {selectedRows.length === 0 ? 0 : pageStart + 1}–{Math.min(pageStart + ROW_PAGE_SIZE, selectedRows.length)} / {formatNumber(selectedRows.length)} PUP</span>
          <div><button type="button" aria-label="Trang trước" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage <= 1}><ChevronLeft size={16} /></button><strong>Trang {safePage}/{pageCount}</strong><button type="button" aria-label="Trang sau" onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} disabled={safePage >= pageCount}><ChevronRight size={16} /></button></div>
        </footer>
      </section>
    </div>
  );
}

function RoutePicker({
  row,
  routes,
  disabled,
  onChangeRoute,
}: {
  row: PickupAssignment;
  routes: string[];
  disabled: boolean;
  onChangeRoute: (row: PickupAssignment, nextRoute: string) => Promise<void>;
}) {
  const currentRoute = routeName(row.route_name);
  const [open, setOpen] = useState(false);
  const [draftRoute, setDraftRoute] = useState(currentRoute);

  const filteredRoutes = useMemo(() => {
    const normalizedDraft = draftRoute.trim().toLocaleLowerCase("vi");
    return routes
      .filter((route) => route !== currentRoute)
      .filter((route) => !normalizedDraft || route.toLocaleLowerCase("vi").includes(normalizedDraft))
      .slice(0, 7);
  }, [currentRoute, draftRoute, routes]);

  async function saveRoute(nextRoute = draftRoute) {
    const cleanedRoute = nextRoute.trim();
    if (!cleanedRoute) return;
    await onChangeRoute(row, cleanedRoute);
    setDraftRoute(cleanedRoute);
    setOpen(false);
  }

  function cancelEdit() {
    setDraftRoute(currentRoute);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={styles.routePickerButton}
        aria-label={`Chuyển tuyến cho ${pickupCode(row)}`}
        aria-expanded={false}
      >
        <span>{currentRoute}</span>
        <ChevronDown size={15} />
      </button>
    );
  }

  return (
    <div className={styles.routeEditor} data-state={disabled ? "loading" : "default"}>
      <div className={styles.routeEditorControls}>
        <Input
          value={draftRoute}
          onChange={(event) => setDraftRoute(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void saveRoute();
            if (event.key === "Escape") cancelEdit();
          }}
          autoFocus
          className={styles.routeInput}
          aria-label={`Nhập mã tuyến cho ${pickupCode(row)}`}
        />
        <button
          type="button"
          onClick={() => void saveRoute()}
          disabled={disabled || !draftRoute.trim()}
          className={styles.routeSaveButton}
          aria-label="Lưu tuyến"
        >
          <Check size={15} />
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          className={styles.routeCancelButton}
          aria-label="Hủy đổi tuyến"
        >
          <X size={15} />
        </button>
      </div>
      {filteredRoutes.length > 0 ? (
        <div className={styles.routeOptions}>
          {filteredRoutes.map((route) => (
            <button
              key={route}
              type="button"
              onClick={() => void saveRoute(route)}
              className={styles.routeOption}
            >
              {route}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.routeHint}>
          Nhấn Enter để lưu mã tuyến mới.
        </p>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  loading,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
  tone?: "default" | "warning";
}) {
  return (
    <div className={styles.metric} data-tone={tone}>
      <span className={styles.metricIcon}>{icon}</span>
      <div><p>{label}</p><strong>{loading ? "—" : formatNumber(value)}</strong></div>
    </div>
  );
}

function RouteTab({
  active,
  label,
  count,
  helper,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  helper: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${styles.routeTab} ${active ? styles.routeTabActive : ""}`}
      aria-pressed={active}
    >
      <span className={styles.routeTabLabel}>{label}</span>
      <span className={styles.routeTabMeta}>
        <span>{helper || "Chưa có COT"}</span>
        <strong>{formatNumber(count)}</strong>
      </span>
    </button>
  );
}

function summarizeRoutes(rows: PickupAssignment[]): RouteSummary[] {
  const routes = new Map<string, { count: number; cots: Set<string> }>();

  for (const row of rows) {
    const route = routeName(row.route_name);
    const routeData = routes.get(route) ?? { count: 0, cots: new Set<string>() };
    const cot = row.cot?.trim();

    routeData.count += 1;
    if (cot) routeData.cots.add(cot);
    routes.set(route, routeData);
  }

  return Array.from(routes, ([route, routeData]) => ({
    route,
    count: routeData.count,
    helper: [
      Array.from(routeData.cots).sort((a, b) => a.localeCompare(b, "vi", { numeric: true })).join(", "),
    ].filter(Boolean).join(" / "),
  })).sort((a, b) => b.count - a.count || a.route.localeCompare(b.route, "vi", { numeric: true }));
}

function routeName(value: string | null | undefined) {
  return value?.trim() || "Chưa có tuyến";
}

function pickupCode(row: PickupAssignment) {
  return row.pup_code?.trim() || row.pickup_point_id?.trim() || "-";
}

function buildPickupAssignmentCsv(rows: PickupAssignment[]) {
  const headers = [
    "assignment_key",
    "assigned_at",
    "cot",
    "route_name",
    "mapped_pickup_point_group",
    "pickup_point_id",
    "pup_code",
    "shop_name",
    "shop_address",
    "ward",
    "district",
    "pickup_status",
    "pickup_retry_assign_type",
  ];
  const lines = rows
    .slice()
    .sort(
      (a, b) =>
        routeName(a.route_name).localeCompare(routeName(b.route_name), "vi", { numeric: true }) ||
        pickupCode(a).localeCompare(pickupCode(b), "vi"),
    )
    .map((row) =>
      [
        row.assignment_key,
        row.assigned_at,
        row.cot,
        routeName(row.route_name),
        row.mapped_pickup_point_group,
        row.pickup_point_id,
        row.pup_code,
        row.shop_name,
        row.shop_address,
        row.ward,
        row.district,
        row.pickup_status?.toString(),
        row.pickup_retry_assign_type?.toString(),
      ].map(csvCell).join(","),
    );

  return [headers.join(","), ...lines].join("\r\n");
}

function csvCell(value: string | null | undefined) {
  const text = value ?? "";
  return `"${text.replace(/"/g, '""')}"`;
}

function formatAssignedAt(value: string | null) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 19);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}
