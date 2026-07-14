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

export const MAP_DISTRICTS: MapDistrict[] = [
  { id: "go-vap", code: "GV", name: "Quận Gò Vấp", shortName: "Gò Vấp", aliases: ["go vap", "quan go vap", "q go vap", "qgv"], area: "KV6", wards: ["1", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17"] },
  { id: "quan-12", code: "Q12", name: "Quận 12", shortName: "Quận 12", aliases: ["12", "quan 12", "q12", "district 12"], area: "KV6", wards: ["An Phú Đông", "Đông Hưng Thuận", "Hiệp Thành", "Tân Chánh Hiệp", "Tân Hưng Thuận", "Tân Thới Hiệp", "Tân Thới Nhất", "Thạnh Lộc", "Thạnh Xuân", "Thới An", "Trung Mỹ Tây"] },
  { id: "hoc-mon", code: "HM", name: "Huyện Hóc Môn", shortName: "Hóc Môn", aliases: ["hoc mon", "huyen hoc mon", "hocmon", "hm"], area: "KV6", wards: ["Bà Điểm", "Đông Thạnh", "Hóc Môn", "Nhị Bình", "Tân Hiệp", "Tân Thới Nhì", "Tân Xuân", "Thới Tam Thôn", "Trung Chánh", "Xuân Thới Đông", "Xuân Thới Sơn", "Xuân Thới Thượng"] },
  { id: "binh-thanh", code: "BT", name: "Quận Bình Thạnh", shortName: "Bình Thạnh", aliases: ["binh thanh", "quan binh thanh", "q binh thanh", "qbt"], area: "KV5", wards: ["1", "2", "3", "5", "6", "7", "11", "12", "13", "14", "15", "17", "19", "21", "22", "24", "25", "26", "27", "28"] },
  { id: "quan-3", code: "Q3", name: "Quận 3", shortName: "Quận 3", aliases: ["3", "quan 3", "q3", "district 3"], area: "KV5", wards: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"] },
  { id: "quan-2", code: "Q2", name: "Quận 2", shortName: "Quận 2", aliases: ["2", "quan 2", "q2", "district 2", "thu duc quan 2"], area: "KV5", wards: ["An Khánh", "An Lợi Đông", "An Phú", "Bình An", "Bình Khánh", "Bình Trưng Đông", "Bình Trưng Tây", "Cát Lái", "Thạnh Mỹ Lợi", "Thảo Điền", "Thủ Thiêm"] },
  { id: "quan-9", code: "Q9", name: "Quận 9", shortName: "Quận 9", aliases: ["9", "quan 9", "q9", "district 9", "thu duc quan 9"], area: "KV5", wards: ["Hiệp Phú", "Long Bình", "Long Phước", "Long Thạnh Mỹ", "Long Trường", "Phú Hữu", "Phước Bình", "Phước Long A", "Phước Long B", "Tân Phú", "Tăng Nhơn Phú A", "Tăng Nhơn Phú B", "Trường Thạnh"] },
];

export function compactZoneName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").replace(/phuong/gi, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
}

export function zoneId(districtId: string, ward: string) {
  return `${districtId}:${compactZoneName(ward)}`;
}

export function wardLabel(ward: string) {
  return /^\d+$/.test(ward) ? `Phường ${ward}` : ward;
}
