"use client";

import { useEffect, useMemo, useState } from "react";
import { LocateFixed, Minus, Plus, RotateCcw } from "lucide-react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import { geoJSON } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { ZonePolygon } from "@/components/zones/zone-polygon";
import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, MAP_FOCUS_PADDING, MAP_MAX_ZOOM, MAP_MIN_ZOOM, compactZoneName, zoneId, type OperationalZone } from "@/components/zones/zone-map-types";

type WardProperties = { districtId: string; wardKey: string; capacity?: number; source: string };
type WardFeature = Feature<Geometry, WardProperties>;

type HcmLeafletMapProps = {
  zones: OperationalZone[];
  visibleZoneIds: string[];
  selectedZoneId: string | null;
  onSelectZone: (zoneId: string) => void;
};

export function HcmLeafletMap({ zones, visibleZoneIds, selectedZoneId, onSelectZone }: HcmLeafletMapProps) {
  const [boundaries, setBoundaries] = useState<FeatureCollection<Geometry, WardProperties> | null>(null);
  useEffect(() => { let active = true; fetch("/data/hcm-legacy-wards.geojson").then((response) => { if (!response.ok) throw new Error("Không thể tải ranh giới hành chính"); return response.json() as Promise<FeatureCollection<Geometry, WardProperties>>; }).then((data) => { if (active) setBoundaries(data); }).catch(() => { if (active) setBoundaries({ type: "FeatureCollection", features: [] }); }); return () => { active = false; }; }, []);

  const zoneById = useMemo(() => new Map(zones.map((zone) => [zone.id, zone])), [zones]);
  const visibleIds = useMemo(() => new Set(visibleZoneIds), [visibleZoneIds]);
  const visibleFeatures = useMemo(() => boundaries?.features.flatMap((feature) => { const id = featureZoneId(feature); const zone = zoneById.get(id); return zone && visibleIds.has(id) ? [{ feature, zone }] : []; }) ?? [], [boundaries, visibleIds, zoneById]);
  const selectedFeature = visibleFeatures.find(({ zone }) => zone.id === selectedZoneId)?.feature ?? null;

  return (
    <div className="relative h-[560px] overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-inner lg:h-[680px]">
      <MapContainer center={MAP_DEFAULT_CENTER} zoom={MAP_DEFAULT_ZOOM} minZoom={MAP_MIN_ZOOM} maxZoom={MAP_MAX_ZOOM} zoomControl={false} scrollWheelZoom className="h-full w-full">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        <ViewportController selectedFeature={selectedFeature} />
        {visibleFeatures.map(({ feature, zone }) => <ZonePolygon key={zone.id} feature={feature} zone={zone} selected={zone.id === selectedZoneId} onSelect={onSelectZone} />)}
        <MapControls selectedFeature={selectedFeature} />
      </MapContainer>
      <div className="pointer-events-none absolute bottom-4 right-4 z-[500] rounded-xl border border-white/80 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-600 shadow-md backdrop-blur">{visibleFeatures.length} zone đang hiển thị</div>
    </div>
  );
}

function ViewportController({ selectedFeature }: { selectedFeature: WardFeature | null }) {
  const map = useMap();
  useEffect(() => { const container = map.getContainer(); const refresh = () => map.invalidateSize({ animate: false }); const frame = requestAnimationFrame(refresh); const observer = new ResizeObserver(refresh); observer.observe(container); return () => { cancelAnimationFrame(frame); observer.disconnect(); }; }, [map]);
  useEffect(() => { if (!selectedFeature) return; const bounds = geoJSON(selectedFeature).getBounds(); if (bounds.isValid()) map.flyToBounds(bounds, { duration: 0.55, padding: MAP_FOCUS_PADDING, maxZoom: 15 }); }, [map, selectedFeature]);
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
