"use client";

import { useEffect, useMemo, useState } from "react";
import { LocateFixed, Minus, Plus, RotateCcw, SunMedium } from "lucide-react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { geoJSON } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { ZonePolygon } from "@/components/zones/zone-polygon";
import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, MAP_FOCUS_PADDING, MAP_MAX_ZOOM, MAP_MIN_ZOOM, ZONE_OPACITY_MAX, ZONE_OPACITY_MIN, compactZoneName, zoneId, type AddressPin, type OperationalZone } from "@/components/zones/zone-map-types";

type WardProperties = { districtId: string; wardKey: string; capacity?: number; source: string };
type WardFeature = Feature<Geometry, WardProperties>;

type HcmLeafletMapProps = {
  zones: OperationalZone[];
  visibleZoneIds: string[];
  selectedZoneId: string | null;
  addressPin: AddressPin | null;
  zoneOpacity: number;
  onAddressZoneMatch: (zoneId: string | null) => void;
  onZoneOpacityChange: (opacity: number) => void;
  onSelectZone: (zoneId: string) => void;
};

export function HcmLeafletMap({ zones, visibleZoneIds, selectedZoneId, addressPin, zoneOpacity, onAddressZoneMatch, onZoneOpacityChange, onSelectZone }: HcmLeafletMapProps) {
  const [boundaries, setBoundaries] = useState<FeatureCollection<Geometry, WardProperties> | null>(null);
  useEffect(() => { let active = true; fetch("/data/hcm-legacy-wards.geojson").then((response) => { if (!response.ok) throw new Error("Không thể tải ranh giới hành chính"); return response.json() as Promise<FeatureCollection<Geometry, WardProperties>>; }).then((data) => { if (active) setBoundaries(data); }).catch(() => { if (active) setBoundaries({ type: "FeatureCollection", features: [] }); }); return () => { active = false; }; }, []);

  const zoneById = useMemo(() => new Map(zones.map((zone) => [zone.id, zone])), [zones]);
  const visibleIds = useMemo(() => new Set(visibleZoneIds), [visibleZoneIds]);
  const visibleFeatures = useMemo(() => boundaries?.features.flatMap((feature) => { const id = featureZoneId(feature); const zone = zoneById.get(id); return zone && visibleIds.has(id) ? [{ feature, zone }] : []; }) ?? [], [boundaries, visibleIds, zoneById]);
  const selectedFeature = visibleFeatures.find(({ zone }) => zone.id === selectedZoneId)?.feature ?? null;

  useEffect(() => {
    if (!addressPin || !boundaries) return;
    const matchedFeature = boundaries.features.find((feature) => geometryContainsPoint(feature.geometry, addressPin.lat, addressPin.lng));
    const matchedId = matchedFeature ? featureZoneId(matchedFeature) : null;
    onAddressZoneMatch(matchedId && zoneById.has(matchedId) ? matchedId : null);
  }, [addressPin, boundaries, onAddressZoneMatch, zoneById]);

  return (
    <div className="zone-operations-map relative h-[560px] overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-inner lg:h-[680px]">
      <MapContainer center={MAP_DEFAULT_CENTER} zoom={MAP_DEFAULT_ZOOM} minZoom={MAP_MIN_ZOOM} maxZoom={MAP_MAX_ZOOM} zoomControl={false} scrollWheelZoom className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        <ViewportController selectedFeature={selectedFeature} addressPin={addressPin} />
        {visibleFeatures.map(({ feature, zone }) => <ZonePolygon key={zone.id} feature={feature} zone={zone} selected={zone.id === selectedZoneId} opacity={zoneOpacity / 100} onSelect={onSelectZone} />)}
        {addressPin ? <>
          <CircleMarker center={[addressPin.lat, addressPin.lng]} radius={15} interactive={false} pathOptions={{ className: "address-pin-pulse", color: "#fb7185", fillColor: "#fb7185", fillOpacity: 0.18, opacity: 0.5, weight: 1 }} />
          <CircleMarker center={[addressPin.lat, addressPin.lng]} radius={6} pathOptions={{ className: "address-pin-dot", color: "#ffffff", fillColor: "#e11d48", fillOpacity: 1, opacity: 1, weight: 2.5 }}>
            <Tooltip permanent direction="top" offset={[0, -8]} className="address-pin-label">Vị trí tìm được</Tooltip>
          </CircleMarker>
        </> : null}
        <MapControls selectedFeature={selectedFeature} />
      </MapContainer>
      <div className="absolute bottom-4 left-4 z-[500] w-[min(280px,calc(100%-7rem))] rounded-2xl border border-white/90 bg-white/95 p-3 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2 font-bold text-slate-700"><SunMedium size={15} className="text-amber-500" /> Độ đậm màu zone</span><strong className="tabular-nums text-blue-700">{zoneOpacity}%</strong></div>
        <input aria-label="Độ đậm màu zone" type="range" min={ZONE_OPACITY_MIN} max={ZONE_OPACITY_MAX} value={zoneOpacity} onChange={(event) => onZoneOpacityChange(Number(event.target.value))} className="zone-opacity-slider mt-2 w-full" />
        <div className="mt-1 flex justify-between text-[10px] font-semibold text-slate-400"><span>Nhạt, dễ xem nền</span><span>Đậm, nổi zone</span></div>
      </div>
      <div className="pointer-events-none absolute bottom-4 right-4 z-[500] rounded-xl border border-white/80 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 shadow-md backdrop-blur">{visibleFeatures.length} zone đang hiển thị</div>
    </div>
  );
}

function ViewportController({ selectedFeature, addressPin }: { selectedFeature: WardFeature | null; addressPin: AddressPin | null }) {
  const map = useMap();
  useEffect(() => { const container = map.getContainer(); const refresh = () => map.invalidateSize({ animate: false }); const frame = requestAnimationFrame(refresh); const observer = new ResizeObserver(refresh); observer.observe(container); return () => { cancelAnimationFrame(frame); observer.disconnect(); }; }, [map]);
  useEffect(() => {
    if (addressPin) {
      map.flyTo([addressPin.lat, addressPin.lng], 16, { duration: 0.65 });
      return;
    }
    if (!selectedFeature) return;
    const bounds = geoJSON(selectedFeature).getBounds();
    if (bounds.isValid()) map.flyToBounds(bounds, { duration: 0.55, padding: MAP_FOCUS_PADDING, maxZoom: 15 });
  }, [addressPin, map, selectedFeature]);
  return null;
}

function MapControls({ selectedFeature }: { selectedFeature: WardFeature | null }) {
  const map = useMap();
  const focusSelected = () => { if (!selectedFeature) return; const bounds = geoJSON(selectedFeature).getBounds(); if (bounds.isValid()) map.flyToBounds(bounds, { duration: 0.45, padding: MAP_FOCUS_PADDING, maxZoom: 15 }); };
  return <div className="absolute right-4 top-4 z-[500] flex flex-col gap-2"><div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"><ControlButton label="Phóng to" onClick={() => map.zoomIn()}><Plus size={17} /></ControlButton><ControlButton label="Thu nhỏ" onClick={() => map.zoomOut()} border><Minus size={17} /></ControlButton></div><ControlButton label="Reset view" onClick={() => map.flyTo(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, { duration: 0.5 })} standalone><RotateCcw size={17} /></ControlButton><ControlButton label="Focus zone đang chọn" onClick={focusSelected} disabled={!selectedFeature} standalone><LocateFixed size={17} /></ControlButton></div>;
}

function ControlButton({ label, onClick, disabled = false, border = false, standalone = false, children }: { label: string; onClick: () => void; disabled?: boolean; border?: boolean; standalone?: boolean; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick} className={`${standalone ? "rounded-xl border border-slate-200 shadow-lg" : border ? "border-t border-slate-200" : ""} grid size-10 place-items-center bg-white text-slate-700 transition hover:bg-slate-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-300`}>{children}</button>;
}

function featureZoneId(feature: WardFeature) { return zoneId(feature.properties.districtId, compactZoneName(feature.properties.wardKey)); }

function geometryContainsPoint(geometry: Geometry, lat: number, lng: number) {
  if (geometry.type === "Polygon") return polygonContainsPoint(geometry.coordinates, lat, lng);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some((polygon) => polygonContainsPoint(polygon, lat, lng));
  return false;
}

function polygonContainsPoint(rings: number[][][], lat: number, lng: number) {
  const [outerRing, ...holes] = rings;
  if (!outerRing || !ringContainsPoint(outerRing, lat, lng)) return false;
  return !holes.some((ring) => ringContainsPoint(ring, lat, lng));
}

function ringContainsPoint(ring: number[][], lat: number, lng: number) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index];
    const before = ring[previous];
    if (!current || !before) continue;
    const [currentLng, currentLat] = current;
    const [beforeLng, beforeLat] = before;
    const crosses = currentLat > lat !== beforeLat > lat;
    if (crosses && lng < ((beforeLng - currentLng) * (lat - currentLat)) / (beforeLat - currentLat) + currentLng) inside = !inside;
  }
  return inside;
}
