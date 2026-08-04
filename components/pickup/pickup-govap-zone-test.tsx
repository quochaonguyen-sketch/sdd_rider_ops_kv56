"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, useMap } from "react-leaflet";
import { geoJSON } from "leaflet";
import type { Feature, Geometry, Polygon } from "geojson";
import { AlertTriangle, Loader2, MapPinned, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils/cn";
import { MAP_DEFAULT_CENTER } from "@/components/zones/zone-map-types";
import type { PickupGovapZonePayload, PickupZoneRoute } from "@/lib/pickup-zones/govap";

type PolygonFeature = Feature<Polygon, { route: string; total: number }>;

export function PickupGovapZoneTest() {
  const [payload, setPayload] = useState<PickupGovapZonePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/pickup-zones/govap");
      const body = (await response.json()) as PickupGovapZonePayload & { error?: string; warnings?: Array<{ key: string; error: string }> };
      if (!response.ok || !body.success) throw new Error(body.error ?? "Không dựng được zone Gò Vấp");
      setPayload(body);
      setSelectedRoute((current) => current ?? body.routes[0]?.route ?? null);
      if (body.warnings?.length) {
        setError(`Có ${body.warnings.length} shop mẫu geocode chưa ra, map vẫn hiển thị phần còn lại.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không dựng được zone Gò Vấp");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, []);

  const activeRoute = useMemo(
    () => payload?.routes.find((route) => route.route === selectedRoute) ?? null,
    [payload, selectedRoute],
  );
  const polygons = payload?.routes ?? [];

  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <MapPinned size={20} />
          </span>
          <div>
            <h2 className="font-black text-slate-950">Test zone Gò Vấp</h2>
            <p className="mt-1 text-sm text-slate-500">
              Vẽ polygon theo cụm phường của shop để suy zone cho từng route `GV_...`.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={load} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} />
            Làm mới
          </Button>
          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
            {payload ? `${payload.total_rows} shop · ${payload.unique_addresses} shop mẫu` : "Chưa có dữ liệu"}
          </div>
        </div>
      </div>

      {error ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          <AlertTriangle size={15} className="mr-2 inline-block align-[-2px]" />
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[560px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          {loading ? (
            <div className="grid h-full place-items-center text-sm font-semibold text-slate-500">
              <span className="inline-flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                Đang dựng zone Gò Vấp...
              </span>
            </div>
          ) : (
            <MapContainer center={MAP_DEFAULT_CENTER} zoom={11} zoomControl scrollWheelZoom className="h-full w-full">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              />
              <MapViewport routes={polygons} />
              {polygons.map((route, index) => (
                <ZonePolygon
                  key={route.route}
                  route={route}
                  active={route.route === selectedRoute}
                  dimmed={Boolean(selectedRoute && route.route !== selectedRoute)}
                  color={routeColor(index)}
                  onSelect={() => setSelectedRoute(route.route)}
                />
              ))}
            </MapContainer>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Route đang chọn</p>
            {activeRoute ? (
              <div className="mt-2 space-y-2">
                <strong className="block text-sm text-slate-950">{activeRoute.route}</strong>
                <p className="text-xs text-slate-500">
                  {activeRoute.total} shop · {activeRoute.pointCount} điểm mẫu
                </p>
                {activeRoute.points.map((point) => (
                  <div key={`${point.label}:${point.address}`} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                    <span className="min-w-0 truncate">{point.label}</span>
                    <span className="shrink-0 truncate text-slate-500">{point.address}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Chọn một route để xem cụm phường tạo zone.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Danh sách route</p>
            <div className="mt-2 max-h-[360px] space-y-2 overflow-y-auto">
              {polygons.map((route, index) => (
                <button
                  type="button"
                  key={route.route}
                  onClick={() => setSelectedRoute(route.route)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-semibold transition",
                    route.route === selectedRoute ? "border-slate-900 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <i className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: routeColor(index) }} />
                    <span className="truncate">{route.route}</span>
                  </span>
                  <span>{route.pointCount}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </Card>
  );
}

function ZonePolygon({
  route,
  active,
  dimmed,
  color,
  onSelect,
}: {
  route: PickupZoneRoute;
  active: boolean;
  dimmed: boolean;
  color: string;
  onSelect: () => void;
}) {
  const feature = useMemo<PolygonFeature>(
    () => ({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [route.polygon],
      },
      properties: {
        route: route.route,
        total: route.total,
      },
    }),
    [route],
  );

  return (
    <GeoJSON
      data={feature}
      eventHandlers={{ click: onSelect }}
      style={{
        color: active ? "#0f172a" : "#ffffff",
        fillColor: color,
        fillOpacity: dimmed ? 0.2 : 0.55,
        opacity: 1,
        weight: active ? 3 : 1.5,
      }}
    >
      {route.points.map((point) => (
        <CircleMarker
          key={`${route.route}:${point.label}:${point.address}`}
          center={[point.lat, point.lng]}
          radius={4.5}
          pathOptions={{ color: "#ffffff", fillColor: "#111827", fillOpacity: 1, weight: 1 }}
        >
          <Tooltip sticky direction="top" offset={[0, -6]}>
            <div className="text-xs">
              <strong>{route.route}</strong>
              <div>{point.label}</div>
              <div>{point.address}</div>
            </div>
          </Tooltip>
        </CircleMarker>
      ))}
    </GeoJSON>
  );
}

function MapViewport({ routes }: { routes: PickupZoneRoute[] }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const refresh = () => map.invalidateSize({ animate: false });
    const frame = requestAnimationFrame(refresh);
    const observer = new ResizeObserver(refresh);
    observer.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map]);
  useEffect(() => {
    const features = routes.filter((route) => route.polygon.length >= 3).map((route) => ({
      type: "Feature" as const,
      geometry: { type: "Polygon" as const, coordinates: [route.polygon] },
      properties: { route: route.route, total: route.total },
    }));
    if (features.length === 0) return;
    const collection = { type: "FeatureCollection", features } as const;
    const bounds = geoJSON(collection).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { animate: true, padding: [28, 28], maxZoom: 14 });
  }, [map, routes]);
  return null;
}

function routeColor(index: number) {
  const colors = ["#2563eb", "#dc2626", "#059669", "#7c3aed", "#ea580c", "#0891b2", "#c026d3", "#ca8a04"];
  return colors[index % colors.length];
}
