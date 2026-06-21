"use client";

import { useEffect } from "react";
import { CircleMarker, GeoJSON, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { geoJSON } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { LatLngTuple } from "leaflet";

export type ZoneShape = {
  id: string;
  name: string;
  district: string;
  ward: string;
  color: string;
  points: LatLngTuple[];
};

export type PresetZone = {
  id: string;
  name: string;
  color: string;
  features: Feature<Geometry, Record<string, unknown>>[];
};

type ZoneBuilderMapProps = {
  zones: ZoneShape[];
  presetZones: PresetZone[];
  draftPoints: LatLngTuple[];
  drawing: boolean;
  selectedId: string | null;
  onAddPoint: (point: LatLngTuple) => void;
  onSelectZone: (id: string) => void;
};

export function ZoneBuilderMap({
  zones,
  presetZones,
  draftPoints,
  drawing,
  selectedId,
  onAddPoint,
  onSelectZone,
}: ZoneBuilderMapProps) {
  return (
    <div className="relative h-[560px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-inner lg:h-[calc(100vh-11rem)]">
      <MapContainer
        center={[10.84, 106.68]}
        zoom={12}
        minZoom={10}
        maxZoom={18}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler drawing={drawing} onAddPoint={onAddPoint} />
        <MapBounds zones={zones} presetZones={presetZones} />

        {presetZones.map((zone) =>
          zone.features.map((feature, index) => (
            <GeoJSON
              key={`${zone.id}-${index}`}
              data={feature}
              style={{
                color: selectedId === zone.id ? "#0f172a" : zone.color,
                fillColor: zone.color,
                fillOpacity: selectedId === zone.id ? 0.28 : 0.18,
                weight: selectedId === zone.id ? 2.4 : 1.3,
              }}
              eventHandlers={{ click: () => onSelectZone(zone.id) }}
            >
              <Tooltip sticky permanent={selectedId === zone.id} direction={selectedId === zone.id ? "center" : "top"} className="zone-map-label">
                <strong>{zone.name}</strong>
                <br />
                {featureWardName(feature)}
              </Tooltip>
            </GeoJSON>
          )),
        )}

        {zones.map((zone) => (
          <Polygon
            key={zone.id}
            positions={zone.points}
            pathOptions={{
              color: selectedId === zone.id ? "#0f172a" : zone.color,
              fillColor: zone.color,
              fillOpacity: selectedId === zone.id ? 0.42 : 0.28,
              weight: selectedId === zone.id ? 3 : 2,
            }}
            eventHandlers={{ click: () => onSelectZone(zone.id) }}
          >
            <Tooltip sticky>
              <strong>{zone.name}</strong>
              <br />
              {[zone.ward, zone.district].filter(Boolean).join(", ") || "Chua co phuong/quan"}
            </Tooltip>
          </Polygon>
        ))}

        {draftPoints.length > 0 ? (
          <>
            <Polyline positions={draftPoints} pathOptions={{ color: "#f97316", dashArray: "8 7", weight: 3 }} />
            {draftPoints.length >= 3 ? (
              <Polygon positions={draftPoints} pathOptions={{ color: "#f97316", fillColor: "#f97316", fillOpacity: 0.18, weight: 2 }} />
            ) : null}
            {draftPoints.map((point, index) => (
              <CircleMarker
                key={`${point[0]}-${point[1]}-${index}`}
                center={point}
                radius={6}
                pathOptions={{ color: "#fff", fillColor: "#f97316", fillOpacity: 1, weight: 2 }}
              >
                <Tooltip permanent direction="top">
                  {index + 1}
                </Tooltip>
              </CircleMarker>
            ))}
          </>
        ) : null}
      </MapContainer>
    </div>
  );
}

function MapClickHandler({
  drawing,
  onAddPoint,
}: {
  drawing: boolean;
  onAddPoint: (point: LatLngTuple) => void;
}) {
  useMapEvents({
    click(event) {
      if (!drawing) return;
      onAddPoint([event.latlng.lat, event.latlng.lng]);
    },
  });

  return null;
}

function featureWardName(feature: Feature<Geometry, Record<string, unknown>>) {
  return String(feature.properties?.wardName ?? feature.properties?.wardKey ?? "Phuong/xa");
}

function MapBounds({ zones, presetZones }: { zones: ZoneShape[]; presetZones: PresetZone[] }) {
  const map = useMap();

  useEffect(() => {
    const collection: FeatureCollection<Geometry, Record<string, unknown>> = {
      type: "FeatureCollection",
      features: [
        ...presetZones.flatMap((zone) => zone.features),
        ...zones.map((zone) => ({
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "Polygon" as const,
            coordinates: [[...zone.points.map(([lat, lng]) => [lng, lat]), [zone.points[0][1], zone.points[0][0]]]],
          },
        })),
      ],
    };
    const bounds = geoJSON(collection).getBounds();

    if (bounds.isValid()) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12 });
  }, [map, presetZones, zones]);

  return null;
}
