"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, MapPinned } from "lucide-react";
import { geoJSON } from "leaflet";
import { GeoJSON, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { Card } from "@/components/ui/card";
import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, MAP_DISTRICTS, compactZoneName, zoneId } from "@/components/zones/zone-map-types";
import { cn } from "@/utils/cn";
import type { PickupAssignment } from "@/components/pickup/pickup-management-view";

type WardProperties = { districtId: string; wardKey: string; capacity?: number; source: string };
type WardFeature = Feature<Geometry, WardProperties>;
type WardRouteStats = {
  zoneId: string;
  districtName: string;
  wardName: string;
  total: number;
  dominantRoute: string;
  dominantCount: number;
  routeCounts: Array<{ route: string; count: number }>;
};
type RouteMismatch = {
  row: PickupAssignment;
  zone: WardRouteStats;
  currentRoute: string;
  suggestedRoute: string;
};

const ROUTE_COLORS = ["#2563eb", "#dc2626", "#059669", "#7c3aed", "#ea580c", "#0891b2", "#c026d3", "#ca8a04", "#e11d48", "#4f46e5", "#16a34a", "#9333ea"];
let boundariesRequest: Promise<FeatureCollection<Geometry, WardProperties>> | null = null;

export function PickupZoneMap({
  rows,
  allRows,
  selectedRoute,
  onSelectRoute,
}: {
  rows: PickupAssignment[];
  allRows: PickupAssignment[];
  selectedRoute: string;
  onSelectRoute: (route: string) => void;
}) {
  const [boundaries, setBoundaries] = useState<FeatureCollection<Geometry, WardProperties> | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadBoundaries()
      .then((data) => { if (active) setBoundaries(data); })
      .catch(() => { if (active) setBoundaries({ type: "FeatureCollection", features: [] }); });
    return () => { active = false; };
  }, []);

  const routeColors = useMemo(() => buildRouteColors(allRows), [allRows]);
  const zoneStats = useMemo(() => buildZoneStats(rows), [rows]);
  const visibleFeatures = useMemo(() => {
    if (!boundaries) return [];
    return boundaries.features
      .map((feature) => ({ feature, stats: zoneStats.get(featureZoneId(feature)) ?? null }))
      .filter((item) => item.stats);
  }, [boundaries, zoneStats]);
  const mismatches = useMemo(() => findRouteMismatches(rows, zoneStats), [rows, zoneStats]);
  const selectedStats = selectedZoneId ? zoneStats.get(selectedZoneId) ?? null : null;

  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-10 place-items-center rounded-xl bg-orange-50 text-orange-700">
            <MapPinned size={20} />
          </span>
          <div>
            <h2 className="font-black text-slate-950">Map zone theo shop pickup</h2>
            <p className="mt-1 text-sm text-slate-500">
              To mau phuong theo tuyen co nhieu shop nhat trong dia chi shop dang loc.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold text-slate-600">
          <MiniMetric label="Zone co shop" value={zoneStats.size} />
          <MiniMetric label="PUP co toa do vung" value={Array.from(zoneStats.values()).reduce((sum, item) => sum + item.total, 0)} />
          <MiniMetric label="Nghi sai tuyen" value={mismatches.length} tone={mismatches.length ? "warn" : "ok"} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="h-[520px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          <MapContainer center={MAP_DEFAULT_CENTER} zoom={MAP_DEFAULT_ZOOM} zoomControl scrollWheelZoom className="h-full w-full">
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
            <MapViewport features={visibleFeatures.map((item) => item.feature)} />
            {visibleFeatures.map(({ feature, stats }) => {
              if (!stats) return null;
              const isSelected = selectedZoneId === stats.zoneId;
              const isRouteDimmed = selectedRoute !== "all" && stats.dominantRoute !== selectedRoute;
              return (
                <GeoJSON
                  key={`${stats.zoneId}:${stats.dominantRoute}:${stats.total}:${isSelected}`}
                  data={feature}
                  eventHandlers={{ click: () => setSelectedZoneId(stats.zoneId) }}
                  style={{
                    color: isSelected ? "#0f172a" : "#ffffff",
                    fillColor: routeColors.get(stats.dominantRoute) ?? "#64748b",
                    fillOpacity: isRouteDimmed ? 0.2 : 0.58,
                    opacity: 1,
                    weight: isSelected ? 3 : 1.5,
                  }}
                >
                  <Tooltip sticky>
                    <div className="text-xs">
                      <strong>{stats.wardName} - {stats.districtName}</strong>
                      <div>{stats.total} shop - chinh: {stats.dominantRoute} ({stats.dominantCount})</div>
                      <div>{stats.routeCounts.slice(0, 4).map((item) => `${item.route}: ${item.count}`).join(" | ")}</div>
                    </div>
                  </Tooltip>
                </GeoJSON>
              );
            })}
          </MapContainer>
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Zone dang chon</p>
            {selectedStats ? (
              <div className="mt-2 space-y-2">
                <strong className="block text-sm text-slate-950">{selectedStats.wardName} - {selectedStats.districtName}</strong>
                {selectedStats.routeCounts.map((item) => (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => onSelectRoute(item.route)}
                    className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-xs font-bold text-slate-700 transition hover:bg-orange-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <i className="size-2.5 rounded-full" style={{ backgroundColor: routeColors.get(item.route) ?? "#64748b" }} />
                      <span className="truncate">{item.route}</span>
                    </span>
                    <span>{item.count}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-500">Bam vao mot phuong tren map de xem route trong zone.</p>
            )}
          </div>

          <div className={cn("rounded-xl border p-3", mismatches.length ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50")}>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
              <AlertTriangle size={15} className={mismatches.length ? "text-amber-600" : "text-emerald-600"} />
              Shop nghi sai tuyen
            </p>
            <div className="mt-2 max-h-[250px] space-y-2 overflow-y-auto">
              {mismatches.slice(0, 20).map((item) => (
                <button
                  key={item.row.id}
                  type="button"
                  onClick={() => onSelectRoute(item.currentRoute)}
                  className="block w-full rounded-lg bg-white px-3 py-2 text-left text-xs shadow-sm"
                >
                  <strong className="block truncate text-slate-950">{pickupCode(item.row)} - {item.row.shop_name || "Shop"}</strong>
                  <span className="mt-1 block text-slate-600">
                    {item.currentRoute} nen kiem tra sang {item.suggestedRoute}
                  </span>
                  <span className="mt-0.5 block truncate text-slate-400">{item.zone.wardName} - {item.zone.districtName}</span>
                </button>
              ))}
              {mismatches.length === 0 ? <p className="text-sm font-semibold text-emerald-700">Chua thay shop lech so voi tuyen da so trong cung zone.</p> : null}
            </div>
          </div>
        </aside>
      </div>
    </Card>
  );
}

function MiniMetric({ label, value, tone }: { label: string; value: number; tone?: "warn" | "ok" }) {
  return (
    <div className={cn("rounded-lg border bg-white px-3 py-2", tone === "warn" ? "border-amber-200 text-amber-700" : tone === "ok" ? "border-emerald-200 text-emerald-700" : "border-slate-200")}>
      <span className="block text-lg font-black">{value.toLocaleString("vi-VN")}</span>
      <span className="block text-[10px] uppercase tracking-wide">{label}</span>
    </div>
  );
}

function MapViewport({ features }: { features: WardFeature[] }) {
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
    if (features.length === 0) return;
    const collection: FeatureCollection<Geometry, WardProperties> = { type: "FeatureCollection", features };
    const bounds = geoJSON(collection).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { animate: true, padding: [24, 24], maxZoom: 14 });
  }, [features, map]);
  return null;
}

function buildRouteColors(rows: PickupAssignment[]) {
  const routes = Array.from(new Set(rows.map((row) => routeName(row.route_name)))).sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
  return new Map(routes.map((route, index) => [route, ROUTE_COLORS[index % ROUTE_COLORS.length]]));
}

function buildZoneStats(rows: PickupAssignment[]) {
  const stats = new Map<string, { total: number; routeCounts: Map<string, number>; districtName: string; wardName: string }>();
  for (const row of rows) {
    const id = assignmentZoneId(row);
    if (!id) continue;
    const existing = stats.get(id) ?? {
      total: 0,
      routeCounts: new Map<string, number>(),
      districtName: row.district?.trim() || "-",
      wardName: row.ward?.trim() || "-",
    };
    const route = routeName(row.route_name);
    existing.total += 1;
    existing.routeCounts.set(route, (existing.routeCounts.get(route) ?? 0) + 1);
    stats.set(id, existing);
  }

  return new Map(Array.from(stats, ([id, item]) => {
    const routeCounts = Array.from(item.routeCounts, ([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count || a.route.localeCompare(b.route, "vi", { numeric: true }));
    const dominant = routeCounts[0] ?? { route: "Chua co tuyen", count: 0 };
    return [id, { zoneId: id, districtName: item.districtName, wardName: item.wardName, total: item.total, dominantRoute: dominant.route, dominantCount: dominant.count, routeCounts } satisfies WardRouteStats];
  }));
}

function findRouteMismatches(rows: PickupAssignment[], zoneStats: Map<string, WardRouteStats>) {
  const mismatches: RouteMismatch[] = [];
  for (const row of rows) {
    const id = assignmentZoneId(row);
    const zone = id ? zoneStats.get(id) : null;
    if (!zone || zone.total < 4 || zone.dominantCount < 3) continue;
    const currentRoute = routeName(row.route_name);
    if (currentRoute === zone.dominantRoute || currentRoute === "Chua co tuyen") continue;
    const currentCount = zone.routeCounts.find((item) => item.route === currentRoute)?.count ?? 0;
    if (zone.dominantCount >= currentCount + 2) {
      mismatches.push({ row, zone, currentRoute, suggestedRoute: zone.dominantRoute });
    }
  }
  return mismatches.sort((a, b) => b.zone.dominantCount - a.zone.dominantCount || pickupCode(a.row).localeCompare(pickupCode(b.row), "vi"));
}

function assignmentZoneId(row: PickupAssignment) {
  const district = findDistrict(row.district);
  const ward = row.ward?.trim();
  if (!district || !ward) return null;
  return zoneId(district.id, ward);
}

function findDistrict(value: string | null | undefined) {
  const normalized = normalize(value);
  if (!normalized) return null;
  return MAP_DISTRICTS.find((district) =>
    [district.name, district.shortName, ...district.aliases].some((alias) => {
      const normalizedAlias = normalize(alias);
      return normalized === normalizedAlias || normalized.includes(normalizedAlias) || normalizedAlias.includes(normalized);
    }),
  ) ?? null;
}

function featureZoneId(feature: WardFeature) {
  return zoneId(feature.properties.districtId, compactZoneName(feature.properties.wardKey));
}

function loadBoundaries() {
  boundariesRequest ??= fetch("/data/hcm-legacy-wards.geojson", { cache: "force-cache" }).then((response) => {
    if (!response.ok) throw new Error("Khong tai duoc ranh gioi hanh chinh");
    return response.json() as Promise<FeatureCollection<Geometry, WardProperties>>;
  });
  return boundariesRequest;
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\b(phuong|p\.?|quan|q\.?|huyen|ward|district|xa|thi tran|tt\.?)\b/g, "")
    .replace(/[.,/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function routeName(value: string | null | undefined) {
  return value?.trim() || "Chua co tuyen";
}

function pickupCode(row: PickupAssignment) {
  return row.pup_code?.trim() || row.pickup_point_id?.trim() || "-";
}
