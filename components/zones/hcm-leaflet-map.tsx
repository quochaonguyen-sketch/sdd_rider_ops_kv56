"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, GeoJSON, MapContainer, Polygon, TileLayer, Tooltip, useMap } from "react-leaflet";
import { geoJSON } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { LatLngTuple } from "leaflet";
import type { CustomZone } from "@/lib/zone-builder/custom-zones";

type WardCount = {
  ward: string;
  count: number;
  riders: WardRider[];
};

type WardRider = {
  id: string;
  rider_code: string;
  full_name: string | null;
  cot: string | null;
};

type SelectedWard = {
  districtId: string;
  wardKey: string;
};

type MapDistrict = {
  id: string;
  name: string;
  color: string;
  center: LatLngTuple;
};

type WardProperties = {
  districtId: string;
  wardKey: string;
  source: string;
};

type HamletProperties = {
  districtId: "hoc-mon";
  wardKey: string;
  hamletKey: string;
  name: string;
  source: string;
};

type WardFeature = Feature<Geometry, WardProperties>;

const mapDistricts: MapDistrict[] = [
  { id: "go-vap", name: "Quận Gò Vấp", color: "#2563eb", center: [10.8387, 106.6655] },
  { id: "quan-12", name: "Quận 12", color: "#7c3aed", center: [10.867, 106.641] },
  { id: "hoc-mon", name: "Huyện Hóc Môn", color: "#dc2626", center: [10.886, 106.592] },
  { id: "binh-thanh", name: "Quận Bình Thạnh", color: "#0891b2", center: [10.812, 106.71] },
  { id: "quan-3", name: "Quận 3", color: "#f59e0b", center: [10.784, 106.686] },
  { id: "quan-2", name: "Quận 2", color: "#10b981", center: [10.793, 106.758] },
  { id: "quan-9", name: "Quận 9", color: "#e11d48", center: [10.842, 106.82] },
];

export function HcmLeafletMap({
  selectedId,
  customZones,
  zoomed,
  wardCounts,
  showWards,
  onSelect,
  onZoomOut,
}: {
  selectedId: string;
  customZones: CustomZone[];
  zoomed: boolean;
  wardCounts: WardCount[];
  showWards: boolean;
  onSelect: (id: string) => void;
  onZoomOut: () => void;
}) {
  const selected = mapDistricts.find((district) => district.id === selectedId) ?? mapDistricts[0];
  const showHocMonHamlets = false;
  const [boundaries, setBoundaries] = useState<FeatureCollection<Geometry, WardProperties> | null>(null);
  const [hamletBoundaries, setHamletBoundaries] = useState<FeatureCollection<Geometry, HamletProperties> | null>(
    null,
  );
  const [selectedWardKey, setSelectedWardKey] = useState<SelectedWard | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/data/hcm-legacy-wards.geojson")
      .then((response) => {
        if (!response.ok) throw new Error("Không thể tải ranh giới hành chính");
        return response.json() as Promise<FeatureCollection<Geometry, WardProperties>>;
      })
      .then((data) => {
        if (active) setBoundaries(data);
      })
      .catch(() => {
        if (active) setBoundaries({ type: "FeatureCollection", features: [] });
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/data/hoc-mon-hamlets-reference.geojson?v=3")
      .then((response) => {
        if (!response.ok) throw new Error("Không thể tải phân khu ấp Hóc Môn");
        return response.json() as Promise<FeatureCollection<Geometry, HamletProperties>>;
      })
      .then((data) => {
        if (active) setHamletBoundaries(data);
      })
      .catch(() => {
        if (active) setHamletBoundaries({ type: "FeatureCollection", features: [] });
      });

    return () => {
      active = false;
    };
  }, []);

  const wardByKey = useMemo(
    () => new Map(wardCounts.map((ward) => [compactName(ward.ward), ward])),
    [wardCounts],
  );
  const selectedFeatures = useMemo(
    () => boundaries?.features.filter((feature) => feature.properties.districtId === selectedId) ?? [],
    [boundaries, selectedId],
  );
  const visibleCustomZones = useMemo(
    () => customZones.filter((zone) => selectedFeatures.some((feature) => geometryContainsPoint(feature.geometry, polygonCenter(zone.points)))),
    [customZones, selectedFeatures],
  );
  const selectedWard =
    zoomed && showWards && selectedWardKey?.districtId === selectedId
      ? wardByKey.get(selectedWardKey.wardKey) ?? null
      : null;

  return (
    <div className="relative h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner sm:h-[620px]">
      <MapContainer
        center={[10.835, 106.69]}
        zoom={11}
        minZoom={10}
        maxZoom={16}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='Ranh giới: GADM 4.1 · &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapFocus selectedFeatures={selectedFeatures} zoomed={zoomed} />

        {boundaries?.features.map((feature, index) => {
          const district = mapDistricts.find((item) => item.id === feature.properties.districtId);
          if (!district) return null;

          const active = district.id === selectedId;
          const ward = active ? wardByKey.get(feature.properties.wardKey) : undefined;
          const showWardDetail = zoomed && active && showWards;
          const pinned = showWardDetail && selectedWardKey?.wardKey === feature.properties.wardKey;

          return (
            <GeoJSON
              key={`${feature.properties.districtId}-${feature.properties.wardKey}`}
              data={feature}
              style={{
                color: showWardDetail ? district.color : active ? "#0f172a" : district.color,
                weight: pinned ? 3.5 : showWardDetail ? 2 : active ? 2.5 : 1.25,
                fillColor: showWardDetail ? wardColor(index) : district.color,
                fillOpacity: zoomed && !active ? 0.04 : pinned ? 0.72 : showWardDetail ? 0.5 : active ? 0.32 : 0.2,
              }}
              eventHandlers={{
                click: (event) => {
                  if (showWardDetail && ward) {
                    event.originalEvent.stopPropagation();
                    setSelectedWardKey({ districtId: district.id, wardKey: compactName(ward.ward) });
                  } else {
                    onSelect(district.id);
                  }
                },
              }}
            >
              {showWardDetail && ward ? (
                <Tooltip permanent direction="center" className="ward-map-label">
                  <span>{wardLabel(ward.ward)}</span>
                  <strong>{ward.count}</strong>
                </Tooltip>
              ) : null}
            </GeoJSON>
          );
        })}

        {showHocMonHamlets && zoomed && showWards && selectedId === "hoc-mon"
          ? hamletBoundaries?.features.map((feature) => (
              <GeoJSON
                key={feature.properties.hamletKey}
                data={feature}
                interactive={false}
                style={{
                  color: "#7f1d1d",
                  dashArray: "5 5",
                  fillColor: "#fff",
                  fillOpacity: 0.04,
                  opacity: 0.78,
                  weight: 1.2,
                }}
              >
                <Tooltip permanent direction="center" className="hamlet-map-label">
                  {hamletLabel(feature.properties, wardByKey)}
                </Tooltip>
              </GeoJSON>
            ))
          : null}

        {zoomed && showWards
          ? visibleCustomZones.map((zone) => (
              <Polygon
                key={zone.id}
                positions={zone.points}
                interactive={false}
                pathOptions={{
                  color: zone.color,
                  dashArray: "5 5",
                  fillColor: "#fff",
                  fillOpacity: 0.05,
                  opacity: 0.86,
                  weight: 1.5,
                }}
              >
                <Tooltip permanent direction="center" className="hamlet-map-label">
                  {zone.name}
                </Tooltip>
              </Polygon>
            ))
          : null}

        {!zoomed
          ? mapDistricts.map((district) => (
              <CircleMarker
                key={district.id}
                center={district.center}
                radius={1}
                pathOptions={{ opacity: 0, fillOpacity: 0 }}
                eventHandlers={{ click: () => onSelect(district.id) }}
              >
                <Tooltip permanent direction="center" className="zone-map-label">
                  <span className="font-bold">{district.name}</span>
                </Tooltip>
              </CircleMarker>
            ))
          : null}
      </MapContainer>

      {zoomed && showWards && selectedWard ? (
        <div className="absolute bottom-4 left-4 z-[500] max-h-[360px] w-[min(420px,calc(100%-2rem))] overflow-hidden rounded-2xl border border-white/80 bg-white/95 shadow-xl backdrop-blur">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Rider trong phường/xã</p>
              <button
                type="button"
                onClick={() => setSelectedWardKey(null)}
                className="pointer-events-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
              >
                Đóng
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <h4 className="font-black text-slate-950">{wardLabel(selectedWard.ward)}</h4>
              <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">
                {selectedWard.count} rider
              </span>
            </div>
          </div>
          <div className="max-h-[270px] overflow-y-auto px-2 py-2">
            {selectedWard.riders.length > 0 ? (
              selectedWard.riders.map((rider) => (
                <div key={rider.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm">
                  <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-700">
                    {rider.rider_code}
                  </span>
                  <span className="min-w-0 truncate font-semibold text-slate-900">
                    {rider.full_name?.trim() || "Chưa có tên"}
                  </span>
                  <span className="ml-auto shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                    {rider.cot?.trim() || "Chưa có COT"}
                  </span>
                </div>
              ))
            ) : (
              <p className="px-2 py-3 text-sm font-semibold text-slate-500">Chưa có rider chạy phường/xã này.</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-xl border border-white/70 bg-white/90 px-3 py-2 shadow-md backdrop-blur">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {zoomed ? selected.name : "Khu vực vận hành"}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-slate-700">
          {zoomed && selectedId === "hoc-mon"
            ? "Ranh ấp tham chiếu (ước lượng), không phải ranh pháp lý"
            : zoomed
              ? "Ranh giới phường/xã theo địa chính cũ"
              : "Bấm vào khu vực để xem chi tiết"}
        </p>
      </div>

      {zoomed ? (
        <button
          type="button"
          onClick={() => {
            setSelectedWardKey(null);
            onZoomOut();
          }}
          className="absolute right-4 top-4 z-[500] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-md transition hover:bg-slate-50"
        >
          Xem toàn TP
        </button>
      ) : null}
    </div>
  );
}

function MapFocus({
  selectedFeatures,
  zoomed,
}: {
  selectedFeatures: WardFeature[];
  zoomed: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const refreshSize = () => map.invalidateSize({ animate: false });
    const frame = window.requestAnimationFrame(refreshSize);
    const timeout = window.setTimeout(refreshSize, 250);
    const observer = new ResizeObserver(refreshSize);
    observer.observe(container);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      observer.disconnect();
    };
  }, [map]);

  useEffect(() => {
    map.invalidateSize({ animate: false });
    if (zoomed && selectedFeatures.length > 0) {
      const collection: FeatureCollection<Geometry, WardProperties> = {
        type: "FeatureCollection",
        features: selectedFeatures,
      };
      const bounds = geoJSON(collection).getBounds();
      map.flyToBounds(bounds, { duration: 0.8, padding: [28, 28], maxZoom: 14 });
    } else {
      map.flyTo([10.835, 106.69], 11, { duration: 0.8 });
    }
  }, [map, selectedFeatures, zoomed]);

  return null;
}

function wardColor(index: number) {
  const colors = ["#84cc16", "#22c55e", "#06b6d4", "#6366f1", "#d946ef", "#f43f5e", "#f59e0b", "#14b8a6"];
  return colors[index % colors.length];
}

function wardLabel(ward: string) {
  return /^\d+$/.test(ward) ? `P.${ward}` : ward;
}

function hamletLabel(properties: HamletProperties, wardByKey: Map<string, WardCount>) {
  const wardName = wardByKey.get(properties.wardKey)?.ward ?? properties.wardKey;
  const hamletNumber = properties.hamletKey.split("-").at(-1) ?? "";
  return `${wardLabel(wardName)} - Ấp ${hamletNumber}`;
}

function polygonCenter(points: LatLngTuple[]): LatLngTuple {
  const totals = points.reduce(
    (sum, [lat, lng]) => ({ lat: sum.lat + lat, lng: sum.lng + lng }),
    { lat: 0, lng: 0 },
  );
  return [totals.lat / points.length, totals.lng / points.length];
}

function geometryContainsPoint(geometry: Geometry, [lat, lng]: LatLngTuple) {
  if (geometry.type === "Polygon") return polygonContainsPoint(geometry.coordinates, lng, lat);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => polygonContainsPoint(polygon, lng, lat));
  }
  return false;
}

function polygonContainsPoint(rings: number[][][], lng: number, lat: number) {
  const [outerRing, ...holes] = rings;
  if (!outerRing || !ringContainsPoint(outerRing, lng, lat)) return false;
  return !holes.some((ring) => ringContainsPoint(ring, lng, lat));
}

function ringContainsPoint(ring: number[][], lng: number, lat: number) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;
    const [currentLng, currentLat] = currentPoint;
    const [previousLng, previousLat] = previousPoint;
    const crosses = currentLat > lat !== previousLat > lat;
    if (crosses) {
      const intersectLng = ((previousLng - currentLng) * (lat - currentLat)) / (previousLat - currentLat) + currentLng;
      if (lng < intersectLng) inside = !inside;
    }
  }
  return inside;
}

function compactName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/phuong/gi, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}
