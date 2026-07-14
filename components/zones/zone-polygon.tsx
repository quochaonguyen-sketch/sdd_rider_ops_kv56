"use client";

import { useState } from "react";
import { GeoJSON, Tooltip } from "react-leaflet";
import type { Feature, Geometry } from "geojson";
import type { LeafletMouseEvent } from "leaflet";
import type { OperationalZone } from "@/components/zones/zone-map-types";

type ZonePolygonProps = {
  feature: Feature<Geometry, Record<string, unknown>>;
  zone: OperationalZone;
  selected: boolean;
  onSelect: (zoneId: string) => void;
};

export function ZonePolygon({ feature, zone, selected, onSelect }: ZonePolygonProps) {
  const [hovered, setHovered] = useState(false);
  const inactive = zone.status === "inactive";
  const full = zone.status === "full";

  return (
    <GeoJSON
      data={feature}
      style={{
        className: selected ? "zone-polygon-selected" : hovered ? "zone-polygon-hovered" : "zone-polygon",
        color: selected ? "#0f172a" : full ? "#b91c1c" : inactive ? "#64748b" : "#ffffff",
        dashArray: inactive ? "6 5" : undefined,
        fillColor: zone.color,
        fillOpacity: selected ? 0.72 : hovered ? 0.64 : inactive ? 0.2 : 0.48,
        opacity: 1,
        weight: selected ? 4 : hovered ? 3.2 : full ? 3 : 1.8,
      }}
      eventHandlers={{
        click: (event: LeafletMouseEvent) => { event.originalEvent.stopPropagation(); onSelect(zone.id); },
        mouseover: (event: LeafletMouseEvent) => { setHovered(true); event.target.bringToFront(); },
        mouseout: () => setHovered(false),
      }}
    >
      <Tooltip sticky={!selected} permanent={selected} direction={selected ? "center" : "top"} className="zone-map-label">
        <strong>{zone.name}</strong><br />
        <span>{zone.code} · {zone.riderCount} rider</span>
      </Tooltip>
    </GeoJSON>
  );
}
