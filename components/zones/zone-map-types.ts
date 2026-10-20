import { hcmDistricts } from "@/lib/locations/hcm";
import { operationalDistrict } from "@/lib/locations/operational-districts";
import type { Rider } from "@/types";

export type ZoneRider = Pick<
  Rider,
  | "id"
  | "rider_code"
  | "full_name"
  | "kv"
  | "home_district"
  | "cot"
  | "pickup_district"
  | "pickup_ward"
  | "delivery_district"
  | "delivery_ward"
  | "status"
>;

export type ZoneArea = "KV5" | "KV6";
export type ZoneStatus = "active" | "inactive" | "full";
export type LocationMode = "pickup" | "delivery" | "home";

export type AddressPin = {
  lat: number;
  lng: number;
  displayName: string;
  sourceWard: string | null;
  sourceDistrict: string | null;
};

export type ZoneFilters = {
  query: string;
  area: "all" | ZoneArea;
  districtId: string;
  wardId: string;
  status: "all" | ZoneStatus;
};

export type OperationalZone = {
  id: string;
  code: string;
  name: string;
  districtId: string;
  districtName: string;
  ward: string;
  area: ZoneArea;
  color: string;
  status: ZoneStatus;
  riderCount: number;
  activeRiderCount: number;
  capacity: number | null;
};

export type MapDistrict = {
  id: string;
  code: string;
  name: string;
  shortName: string;
  aliases: string[];
  area: ZoneArea;
  wards: string[];
};

export const ZONE_COLORS = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#7c3aed",
  "#ea580c",
  "#0891b2",
  "#c026d3",
  "#ca8a04",
  "#e11d48",
  "#4f46e5",
] as const;

export const MAP_DEFAULT_CENTER: [number, number] = [10.835, 106.69];
export const MAP_DEFAULT_ZOOM = 11;
export const MAP_MIN_ZOOM = 10;
export const MAP_MAX_ZOOM = 17;
export const MAP_FOCUS_PADDING: [number, number] = [36, 36];
export const ZONE_OPACITY_MIN = 12;
export const ZONE_OPACITY_MAX = 78;
export const ZONE_OPACITY_DEFAULT = 46;

export const MAP_DISTRICTS: MapDistrict[] = hcmDistricts.map((district) => ({
  id: district.id,
  code: operationalDistrict(district.name)!.code,
  name: district.name,
  shortName: district.shortName,
  aliases: [district.name, ...district.aliases],
  area: operationalDistrict(district.name)!.area,
  wards: district.wards.map((ward) => ward.name.replace(/^Phường\s+/i, "")),
}));

export function compactZoneName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").replace(/phuong/gi, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function zoneId(districtId: string, ward: string) {
  return `${districtId}:${compactZoneName(ward)}`;
}

export function wardLabel(ward: string) {
  return /^\d+$/.test(ward) ? `Phường ${ward}` : ward;
}
