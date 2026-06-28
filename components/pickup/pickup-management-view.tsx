"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Download, ListChecks, RefreshCcw, Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

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
const ACCENT = "#f97316";

export function PickupManagementView() {
  const [rows, setRows] = useState<PickupAssignment[]>([]);
  const [selectedRoute, setSelectedRoute] = useState("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
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
        .filter((route) => route.route !== "Chua co tuyen")
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
    setSuccess(`Da chuyen ${pickupCode(row)} sang ${cleanedRoute}.`);
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
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
            Pickup operations
          </p>
          <h1 className="mt-1 text-4xl font-black text-slate-950 my-2">Pickup Management</h1>
          <p className="mt-1 text-md text-slate-500 ">
            Quan ly PUP/shop trong tung tuyen, dieu chinh tuyen roi xuat file cho Python gan.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center bg-slate-50 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700">
          <Button type="button" variant="secondary" onClick={exportForPython} disabled={loading || rows.length === 0}>
            <Download size={16} />
            Xuat file Excel
          </Button>
          <Button type="button" variant="secondary" onClick={refresh} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} />
            Lam moi
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Khong tai/cap nhat duoc PUP: {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          {success}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Tong PUP" value={rows.length} loading={loading} />
        <MetricCard label="So tuyen" value={routeSummaries.length} loading={loading} />
        <MetricCard label="Dang hien thi" value={selectedRows.length} loading={loading} />
        <MetricCard label="Chua co tuyen" value={rows.filter((row) => routeName(row.route_name) === "Chua co tuyen").length} loading={loading} />
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: ACCENT }}>
          <ListChecks size={16} />
          Tabs tuyen
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <RouteTab
            active={selectedRoute === "all"}
            label="Tat ca"
            count={rows.length}
            helper={`${routeSummaries.length} tuyen`}
            onClick={() => {
              setSelectedRoute("all");
              setCurrentPage(1);
            }}
          />
          {routeSummaries.map((route) => (
            <RouteTab
              key={route.route}
              active={selectedRoute === route.route}
              label={route.route}
              count={route.count}
              helper={route.helper}
              onClick={() => {
                setSelectedRoute(route.route);
                setCurrentPage(1);
              }}
            />
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="relative block">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCurrentPage(1);
              }}
              placeholder="Tim PUP, shop, dia chi, ma tuyen..."
              className="pl-9"
            />
          </label>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
            {formatNumber(selectedRows.length)} PUP {selectedRoute === "all" ? "dang loc" : `trong ${activeRoute?.route ?? selectedRoute}`}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="hidden grid-cols-[120px_1.35fr_minmax(170px,1.25fr)_130px_250px] gap-3 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 xl:grid">
            <span>PUP ID</span>
            <span>Shop</span>
            <span>Dia chi</span>
            <span>Phuong</span>
            <span>Chuyen tuyen</span>
          </div>
          <div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto">
            {!loading && selectedRows.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-500">Chua co PUP nao cho bo loc nay.</p>
            ) : null}
            {loading ? <p className="p-6 text-center text-sm text-slate-500">Dang tai PUP...</p> : null}
            {!loading
              ? pagedRows.map((row) => (
                  <div
                    key={row.id}
                    className="grid gap-3 px-4 py-3 text-sm xl:grid-cols-[120px_1.35fr_minmax(170px,1.25fr)_130px_250px] xl:items-center"
                  >
                    <div>
                      <p className="font-mono text-xs font-bold text-slate-950">{pickupCode(row)}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{formatAssignedAt(row.assigned_at)}</p>
                    </div>
                    <p className="min-w-0 font-semibold text-slate-800 xl:truncate">{row.shop_name || "-"}</p>
                    <p className="min-w-0 text-slate-600 xl:truncate" title={row.shop_address || undefined}>
                      {row.shop_address || "-"}
                    </p>
                    <div className="text-slate-700">
                      <p className="font-semibold">{row.ward || "-"}</p>
                      <p className="text-xs text-slate-500">{row.district || "-"}</p>
                    </div>
                    <RoutePicker
                      row={row}
                      routes={routeOptions}
                      disabled={updatingId === row.id}
                      onChangeRoute={changeRoute}
                    />
                  </div>
                ))
              : null}
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-semibold">
            Hien {selectedRows.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + ROW_PAGE_SIZE, selectedRows.length)} / {formatNumber(selectedRows.length)} PUP
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-9 min-h-9 px-3"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={safePage <= 1}
            >
              Truoc
            </Button>
            <span className="min-w-24 text-center text-xs font-bold uppercase tracking-wide text-slate-500">
              Trang {safePage}/{pageCount}
            </span>
            <Button
              type="button"
              variant="secondary"
              className="h-9 min-h-9 px-3"
              onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
              disabled={safePage >= pageCount}
            >
              Sau
            </Button>
          </div>
        </div>
      </Card>
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
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-800 transition hover:border-orange-200 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Chuyen tuyen cho ${pickupCode(row)}`}
      >
        <span className="min-w-0 truncate">{currentRoute}</span>
        <ChevronDown size={15} className="shrink-0 text-slate-400" />
      </button>
    );
  }

  return (
    <div className="min-w-[240px] rounded-xl border border-orange-200 bg-white p-2 shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_36px_36px] gap-1.5">
        <Input
          value={draftRoute}
          onChange={(event) => setDraftRoute(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void saveRoute();
            if (event.key === "Escape") cancelEdit();
          }}
          autoFocus
          className="h-9"
          aria-label={`Nhap ma tuyen cho ${pickupCode(row)}`}
        />
        <button
          type="button"
          onClick={() => void saveRoute()}
          disabled={disabled || !draftRoute.trim()}
          className="grid size-9 shrink-0 place-items-center rounded-md bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Luu tuyen"
        >
          <Check size={15} />
        </button>
        <button
          type="button"
          onClick={cancelEdit}
          className="grid size-9 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
          aria-label="Huy doi tuyen"
        >
          <X size={15} />
        </button>
      </div>
      {filteredRoutes.length > 0 ? (
        <div className="mt-2 grid gap-1">
          {filteredRoutes.map((route) => (
            <button
              key={route}
              type="button"
              onClick={() => void saveRoute(route)}
              className="truncate rounded-md bg-slate-50 px-2 py-1.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-orange-50 hover:text-orange-700"
            >
              {route}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-500">
          Enter de luu ma tuyen moi.
        </p>
      )}
    </div>
  );
}

function MetricCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl">
        {loading ? "-" : formatNumber(value)}
      </p>
    </Card>
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
      className={cn(
        "min-w-[150px] rounded-xl border px-3 py-2 text-left transition",
        active ? "border-slate-300 bg-white shadow-sm" : "border-slate-200 bg-slate-50 hover:bg-white",
      )}
    >
      <span className="block truncate text-sm font-black text-slate-950">{label}</span>
      <span className="mt-1 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold text-slate-500">{helper || "Chua co COT"}</span>
        <strong className="rounded-full px-2 py-0.5 text-xs text-white" style={{ backgroundColor: ACCENT }}>
          {formatNumber(count)}
        </strong>
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
  return value?.trim() || "Chua co tuyen";
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
