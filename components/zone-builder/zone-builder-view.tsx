"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Eraser, FileUp, MapPinned, Pencil, Save, Trash2, Undo2 } from "lucide-react";
import type { Feature, FeatureCollection, Geometry, Polygon } from "geojson";
import type { LatLngTuple } from "leaflet";
import type { PresetZone, ZoneShape } from "@/components/zone-builder/zone-builder-map";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BUILDER_ZONES_STORAGE_KEY, PUBLISHED_ZONES_STORAGE_KEY, readCustomZones, writeCustomZones } from "@/lib/zone-builder/custom-zones";
import { cn } from "@/utils/cn";

const ZoneMap = dynamic(
  () => import("@/components/zone-builder/zone-builder-map").then((module) => module.ZoneBuilderMap),
  { ssr: false, loading: () => <div className="h-[560px] animate-pulse rounded-lg bg-slate-100 lg:h-[calc(100vh-11rem)]" /> },
);

const colors = ["#2563eb", "#f97316", "#16a34a", "#dc2626", "#7c3aed", "#0891b2", "#ca8a04", "#be123c"];
const presetDistricts = [
  { id: "hoc-mon", name: "Huyen Hoc Mon", color: "#dc2626" },
  { id: "quan-12", name: "Quan 12", color: "#7c3aed" },
  { id: "go-vap", name: "Quan Go Vap", color: "#2563eb" },
  { id: "binh-thanh", name: "Quan Binh Thanh", color: "#0891b2" },
  { id: "quan-3", name: "Quan 3", color: "#f59e0b" },
  { id: "quan-2", name: "Quan 2", color: "#10b981" },
];
const presetDistrictNameById = Object.fromEntries(presetDistricts.map((district) => [district.id, district.name]));

function numberedWards(keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, `Phuong ${key}`]));
}

const wardNameByDistrict: Record<string, Record<string, string>> = {
  "hoc-mon": {
    badiem: "Xa Ba Diem",
    dongthanh: "Xa Dong Thanh",
    hocmon: "Thi tran Hoc Mon",
    nhibinh: "Xa Nhi Binh",
    tanhiep: "Xa Tan Hiep",
    tanthoinhi: "Xa Tan Thoi Nhi",
    tanxuan: "Xa Tan Xuan",
    thoitamthon: "Xa Thoi Tam Thon",
    trungchanh: "Xa Trung Chanh",
    xuanthoidong: "Xa Xuan Thoi Dong",
    xuanthoison: "Xa Xuan Thoi Son",
    xuanthoithuong: "Xa Xuan Thoi Thuong",
  },
  "quan-12": {
    anphudong: "Phuong An Phu Dong",
    donghungthuan: "Phuong Dong Hung Thuan",
    hiepthanh: "Phuong Hiep Thanh",
    tanchanhhiep: "Phuong Tan Chanh Hiep",
    tanhungthuan: "Phuong Tan Hung Thuan",
    tanthoihiep: "Phuong Tan Thoi Hiep",
    tanthoinhat: "Phuong Tan Thoi Nhat",
    thanhloc: "Phuong Thanh Loc",
    thanhxuan: "Phuong Thanh Xuan",
    thoian: "Phuong Thoi An",
    trungmytay: "Phuong Trung My Tay",
  },
  "go-vap": numberedWards(["1", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17"]),
  "binh-thanh": numberedWards(["1", "2", "3", "5", "6", "7", "11", "12", "13", "14", "15", "17", "19", "21", "22", "24", "25", "26", "27", "28"]),
  "quan-3": numberedWards(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]),
  "quan-2": {
    ankhanh: "Phuong An Khanh",
    anloidong: "Phuong An Loi Dong",
    anphu: "Phuong An Phu",
    binhan: "Phuong Binh An",
    binhkhanh: "Phuong Binh Khanh",
    binhtrungdong: "Phuong Binh Trung Dong",
    binhtrungtay: "Phuong Binh Trung Tay",
    catlai: "Phuong Cat Lai",
    thanhmyloi: "Phuong Thanh My Loi",
    thaodien: "Phuong Thao Dien",
    thuthiem: "Phuong Thu Thiem",
  },
};

function readSavedZones() {
  return readCustomZones(BUILDER_ZONES_STORAGE_KEY) as ZoneShape[];
}

function enrichZoneLocation(zone: ZoneShape, presetZones: PresetZone[]) {
  if (zone.district.trim() && zone.ward.trim()) return zone;
  const center = polygonCenter(zone.points);
  const matchedFeature = presetZones
    .flatMap((presetZone) =>
      presetZone.features.map((feature) => ({
        districtId: presetZone.id,
        feature,
      })),
    )
    .find(({ feature }) => geometryContainsPoint(feature.geometry, center));

  if (!matchedFeature) return zone;
  const district = zone.district.trim() || presetDistrictNameById[matchedFeature.districtId] || matchedFeature.districtId;
  const ward = zone.ward.trim() || String(matchedFeature.feature.properties?.wardName ?? matchedFeature.feature.properties?.wardKey ?? "");
  return { ...zone, district, ward };
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

export function ZoneBuilderView() {
  const [zones, setZones] = useState<ZoneShape[]>(readSavedZones);
  const [publishedZones, setPublishedZones] = useState<ZoneShape[]>(() => readCustomZones(PUBLISHED_ZONES_STORAGE_KEY) as ZoneShape[]);
  const [presetZones, setPresetZones] = useState<PresetZone[]>([]);
  const [draftPoints, setDraftPoints] = useState<LatLngTuple[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [ward, setWard] = useState("");
  const [color, setColor] = useState(colors[0]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/data/hcm-legacy-wards.geojson")
      .then((response) => {
        if (!response.ok) throw new Error("Khong tai duoc boundary zone mac dinh");
        return response.json() as Promise<FeatureCollection<Geometry, Record<string, unknown>>>;
      })
      .then((collection) => {
        if (!active) return;
        setPresetZones(
          presetDistricts.map((district) => ({
            ...district,
            features: collection.features
              .filter((feature) => feature.properties?.districtId === district.id)
              .map((feature) => {
                const wardKey = String(feature.properties?.wardKey ?? "");
                return {
                  ...feature,
                  properties: {
                    ...feature.properties,
                    wardName: wardNameByDistrict[district.id]?.[wardKey] ?? wardKey,
                  },
                };
              }),
          })),
        );
      })
      .catch(() => {
        if (active) setPresetZones([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    writeCustomZones(BUILDER_ZONES_STORAGE_KEY, zones);
  }, [zones]);

  const selectedZone = useMemo(
    () => zones.find((zone) => zone.id === selectedId) ?? null,
    [selectedId, zones],
  );
  const selectedPresetZone = useMemo(
    () => presetZones.find((zone) => zone.id === selectedId) ?? null,
    [presetZones, selectedId],
  );

  const addPoint = useCallback((point: LatLngTuple) => {
    setDraftPoints((current) => [...current, point]);
  }, []);

  function startDrawing() {
    setDrawing(true);
    setDraftPoints([]);
    setSelectedId(null);
  }

  function saveDraft() {
    if (draftPoints.length < 3) return;
    const nextZone: ZoneShape = {
      id: crypto.randomUUID(),
      name: name.trim() || `Zone ${zones.length + 1}`,
      district: district.trim(),
      ward: ward.trim(),
      color,
      points: draftPoints,
    };
    setZones((current) => [...current, nextZone]);
    setSelectedId(nextZone.id);
    setDraftPoints([]);
    setDrawing(false);
    setName("");
  }

  function deleteZone(id: string) {
    setZones((current) => current.filter((zone) => zone.id !== id));
    setPublishedZones((current) => {
      const next = current.filter((zone) => zone.id !== id);
      writeCustomZones(PUBLISHED_ZONES_STORAGE_KEY, next);
      return next;
    });
    if (selectedId === id) setSelectedId(null);
  }

  function publishZone(zone: ZoneShape) {
    const enrichedZone = enrichZoneLocation(zone, presetZones);
    setPublishedZones((current) => {
      const next = [enrichedZone, ...current.filter((item) => item.id !== zone.id)];
      writeCustomZones(PUBLISHED_ZONES_STORAGE_KEY, next);
      return next;
    });
    setZones((current) => current.map((item) => (item.id === zone.id ? enrichedZone : item)));
  }

  function exportGeoJson() {
    const collection: FeatureCollection<Polygon, Record<string, unknown>> = {
      type: "FeatureCollection",
      features: [
        ...presetZones.flatMap((zone) =>
          zone.features.map((feature, index) => ({
            ...feature,
            properties: {
              ...feature.properties,
              id: `${zone.id}-${index + 1}`,
              zoneId: zone.id,
              name: zone.name,
              color: zone.color,
              wardName: feature.properties?.wardName,
              source: "rider-ops-zone-builder-preset",
            },
          }) as Feature<Polygon, Record<string, unknown>>),
        ),
        ...zones.map((zone) => ({
          type: "Feature" as const,
          properties: {
            id: zone.id,
            name: zone.name,
            district: zone.district,
            ward: zone.ward,
            color: zone.color,
            source: "rider-ops-zone-builder",
          },
          geometry: {
            type: "Polygon" as const,
            coordinates: [[...zone.points.map(([lat, lng]) => [lng, lat]), [zone.points[0][1], zone.points[0][0]]]],
          },
        })),
      ],
    };
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kv5-6-zones.geojson";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function importGeoJson(file: File) {
    const text = await file.text();
    const parsed = JSON.parse(text) as FeatureCollection<Geometry, Record<string, unknown>>;
    const imported: ZoneShape[] = [];

    for (const feature of parsed.features ?? []) {
      if (feature.geometry?.type !== "Polygon") continue;
      const ring = feature.geometry.coordinates[0] ?? [];
      const points = ring
        .slice(0, ring.length > 1 ? -1 : ring.length)
        .map(([lng, lat]) => [lat, lng] as LatLngTuple);
      if (points.length < 3) continue;
      imported.push({
        id: String(feature.properties?.id ?? crypto.randomUUID()),
        name: String(feature.properties?.name ?? `Zone ${imported.length + 1}`),
        district: String(feature.properties?.district ?? ""),
        ward: String(feature.properties?.ward ?? ""),
        color: String(feature.properties?.color ?? colors[imported.length % colors.length]),
        points,
      });
    }

    if (imported.length > 0) setZones(imported);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Zone drawing</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Zone Builder KV 5,6</h1>
          <p className="mt-1 text-sm text-slate-500">Co san Q12, Go Vap, Hoc Mon, Q2, Q3, Binh Thanh; ve them va xuat GeoJSON.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={16} />
            Import
          </Button>
          <Button type="button" variant="secondary" onClick={exportGeoJson} disabled={zones.length === 0 && presetZones.length === 0}>
            <Download size={16} />
            Export GeoJSON
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.geojson,application/geo+json,application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importGeoJson(file);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <div className="flex items-center gap-2 text-sm font-black text-slate-950">
              <Pencil size={17} className="text-orange-600" />
              Tao zone
            </div>
            <div className="mt-4 space-y-3">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ten zone / khu vuc" />
              <Input value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="Quan / huyen" />
              <Input value={ward} onChange={(event) => setWard(event.target.value)} placeholder="Phuong / xa" />
              <div className="flex flex-wrap gap-2">
                {colors.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setColor(item)}
                    className={cn(
                      "size-8 rounded-full border-2 border-white shadow-sm ring-1 ring-slate-200 transition",
                      color === item && "scale-110 ring-2 ring-slate-950",
                    )}
                    style={{ backgroundColor: item }}
                    aria-label={`Chon mau ${item}`}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={drawing ? "default" : "secondary"} onClick={startDrawing}>
                  <MapPinned size={16} />
                  Ve moi
                </Button>
                <Button type="button" onClick={saveDraft} disabled={draftPoints.length < 3}>
                  <Save size={16} />
                  Luu zone
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setDraftPoints((current) => current.slice(0, -1))}
                  disabled={draftPoints.length === 0}
                >
                  <Undo2 size={16} />
                  Lui diem
                </Button>
                <Button type="button" variant="secondary" onClick={() => setDraftPoints([])} disabled={draftPoints.length === 0}>
                  <Eraser size={16} />
                  Xoa net
                </Button>
              </div>
              <p className="rounded-lg bg-slate-50 p-3 text-xs font-semibold text-slate-500">
                Bat dau ve moi, roi click tren ban do de dat diem. Can toi thieu 3 diem de luu polygon.
              </p>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-black text-slate-950">Zone da ve</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{zones.length}</span>
            </div>
            <div className="mt-3 max-h-[380px] space-y-2 overflow-y-auto pr-1">
              {presetZones.map((zone) => (
                <button
                  key={zone.id}
                  type="button"
                  onClick={() => setSelectedId(zone.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
                    selectedId === zone.id ? "border-slate-300 bg-slate-50" : "border-slate-100 hover:bg-slate-50",
                  )}
                >
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: zone.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-950">{zone.name}</span>
                    <span className="block truncate text-xs text-slate-500">{zone.features.length} phuong/xa boundary</span>
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">San</span>
                </button>
              ))}
              {zones.length === 0 ? <p className="text-sm text-slate-500">Chua co zone nao.</p> : null}
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition",
                    selectedId === zone.id ? "border-slate-300 bg-slate-50" : "border-slate-100 hover:bg-slate-50",
                  )}
                >
                  <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: zone.color }} />
                  <button type="button" onClick={() => setSelectedId(zone.id)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-bold text-slate-950">{zone.name}</span>
                    <span className="block truncate text-xs text-slate-500">{[zone.ward, zone.district].filter(Boolean).join(", ") || "Chua co dia ban"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteZone(zone.id)}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Xoa ${zone.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          {selectedPresetZone ? (
            <Card>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Zone mac dinh</p>
              <h2 className="mt-1 font-black text-slate-950">{selectedPresetZone.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{selectedPresetZone.features.length} boundary phuong/xa</p>
              <div className="mt-3 flex max-h-52 flex-wrap gap-2 overflow-y-auto pr-1">
                {selectedPresetZone.features.map((feature) => (
                  <span
                    key={String(feature.properties?.wardKey)}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600"
                  >
                    {String(feature.properties?.wardName ?? feature.properties?.wardKey)}
                  </span>
                ))}
              </div>
            </Card>
          ) : selectedZone ? (
            <Card>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Dang chon</p>
              <h2 className="mt-1 font-black text-slate-950">{selectedZone.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{selectedZone.points.length} diem polygon</p>
              <Button
                type="button"
                className="mt-4 w-full"
                variant={publishedZones.some((zone) => zone.id === selectedZone.id) ? "secondary" : "default"}
                onClick={() => publishZone(selectedZone)}
              >
                <Save size={16} />
                {publishedZones.some((zone) => zone.id === selectedZone.id) ? "Cap nhat phan khu Zones" : "Them vao phan khu Zones"}
              </Button>
            </Card>
          ) : null}
        </div>

        <ZoneMap
          zones={zones}
          presetZones={presetZones}
          draftPoints={draftPoints}
          drawing={drawing}
          selectedId={selectedId}
          onAddPoint={addPoint}
          onSelectZone={setSelectedId}
        />
      </div>
    </div>
  );
}
