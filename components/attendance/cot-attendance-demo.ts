import type { Rider } from "@/types";
import type { Cot, DayAttendance } from "@/lib/attendance/cot-attendance";

const data: Array<[string, Cot, string | null, string | null]> = [
  ["Nguyễn Văn Minh", "COT2", null, "15:48"],
  ["Trần Quốc Huy", "COT2", "Bình Thạnh", "16:12"],
  ["Lê Hoàng Nam", "COT2", null, "16:07"],
  ["Phạm Đức Anh", "COT2", "Thủ Đức", null],
  ["Võ Thành Đạt", "COT2", null, "15:55"],
  ["Đặng Minh Khang", "COT2", "Gò Vấp", "16:26"],
  ["Bùi Anh Tuấn", "COT2", null, null],
  ["Đỗ Thanh Phong", "COT2", "Quận 7", "16:16"],
  ["Nguyễn Gia Bảo", "COT2", null, "15:58"],
  ["Trần Nhật Long", "COT2", "Tân Bình", null],
  ["Lê Đức Tài", "COT2", null, "15:52"],
  ["Phạm Quốc Cường", "COT2", "Quận 3", "16:18"],
  ["Nguyễn Hữu Phúc", "COT1", null, "10:54"],
  ["Trần Văn Sơn", "COT1", "Quận 1", "11:48"],
  ["Lê Minh Trí", "COT1", null, "11:08"],
  ["Võ Quốc Bình", "COT1", "Quận 5", null],
];

export const demoRiders: Rider[] = data.map(([name, cot, pickup], index) => ({
  id: `demo-${index + 1}`, rider_code: `RD${String(index + 1).padStart(3, "0")}`,
  full_name: name, cot, pickup_district: pickup, pickup_ward: null, point_name: null,
  kv: "KV5", home_district: null, delivery_district: null, delivery_ward: null,
  avatar_url: null, zone_id: null, status: "ACTIVE", current_shift: null,
  raw_data: null, created_at: "", updated_at: "",
}));

export function demoAttendance(day: string): DayAttendance {
  return { pickup: {}, checkins: Object.fromEntries(data.flatMap(([, cot, pickup, at], index) => at ? [[`${cot}:demo-${index + 1}`, { at: new Date(`${day}T${at}:00+07:00`).toISOString(), cot, hasPickup: Boolean(pickup) }]] : [])) };
}
