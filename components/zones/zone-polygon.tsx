"use client";

import { memo, useState } from "react";
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

const BASE_BORDER_WIDTH = 1.8;
const HOVER_BORDER_WIDTH = 3.2;
const SELECTED_BORDER_WIDTH = 4.5;
export const ZonePolygon = memo(function ZonePolygon({ feature, zone, selected, onSelect }: ZonePolygonProps) {
  const [hovered, setHovered] = useState(false);
  const inactive = zone.status === "inactive";
  const full = zone.status === "full";
  const className = [
    selected ? "zone-polygon-selected" : hovered ? "zone-polygon-hovered" : "zone-polygon",
    inactive ? "zone-polygon--inactive" : "",
  ].filter(Boolean).join(" ");

  return (
    <GeoJSON
      data={feature}
      style={{
        className,
        color: selected ? "#020617" : full ? "#991b1b" : "#334155",
        fillColor: zone.color,
        fillOpacity: 1,
        lineCap: "round",
        lineJoin: "round",
        opacity: 1,
        weight: selected ? SELECTED_BORDER_WIDTH : hovered ? HOVER_BORDER_WIDTH : full ? HOVER_BORDER_WIDTH : BASE_BORDER_WIDTH,
      }}
      eventHandlers={{
        click: (event: LeafletMouseEvent) => { event.originalEvent.stopPropagation(); onSelect(zone.id); },
        mouseover: (event: LeafletMouseEvent) => { setHovered(true); event.target.bringToFront(); },
        mouseout: () => setHovered(false),
      }}
    >
      <Tooltip permanent direction="center" className={`ward-zone-label${selected ? " ward-zone-label--selected" : ""}`}>
        <strong>{zone.ward.match(/^\d+$/) ? `P.${zone.ward}` : zone.ward}</strong>
        <span>{zone.districtName.replace(/^Quận |^Huyện /, "")} · {zone.riderCount}</span>
      </Tooltip>
    </GeoJSON>
  );
});
