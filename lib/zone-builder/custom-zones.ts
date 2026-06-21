import type { LatLngTuple } from "leaflet";

export const BUILDER_ZONES_STORAGE_KEY = "rider-ops-zone-builder";
export const PUBLISHED_ZONES_STORAGE_KEY = "rider-ops-zone-tabs";

export type CustomZone = {
  id: string;
  name: string;
  district: string;
  ward: string;
  color: string;
  points: LatLngTuple[];
};

export function isValidCustomZone(value: CustomZone) {
  return Boolean(value.id && value.name && Array.isArray(value.points) && value.points.length >= 3);
}

export function readCustomZones(storageKey: string) {
  if (typeof window === "undefined") return [];
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved) as CustomZone[];
    return parsed.filter(isValidCustomZone);
  } catch {
    return [];
  }
}

export function writeCustomZones(storageKey: string, zones: CustomZone[]) {
  window.localStorage.setItem(storageKey, JSON.stringify(zones.filter(isValidCustomZone)));
}
