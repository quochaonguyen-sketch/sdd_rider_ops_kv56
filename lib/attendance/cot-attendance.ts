import type { AttendanceLog, Rider } from "../../types.ts";

export type Cot = "COT1" | "COT2";
export type CheckinStatus = "pending" | "ontime" | "late" | "absent" | "off";
export type Checkin = { at: string; cot: Cot; hasPickup: boolean };
export type DayAttendance = { checkins: Record<string, Checkin>; pickup: Record<string, boolean> };
export type RiderScanResult = {
  kind: "success" | "duplicate" | "error";
  code: string;
  message: string;
  detail?: string;
};

// Match the full identifier, preserving leading zeroes. Never check in a partial or fuzzy match.
export function resolveScannedRider<T extends { rider_code: string }>(rawCode: string, riders: T[]):
  { code: string; rider: T } | { code: string; error: string } {
  const code = rawCode.trim();
  if (!code || code.length > 120 || /[\x00-\x1f\x7f]/.test(code)) return { code, error: "Mã quét không hợp lệ. Hãy quét lại một mã rider." };
  const matches = riders.filter((rider) => rider.rider_code.trim().toUpperCase() === code.toUpperCase());
  if (matches.length > 1) return { code, error: "Mã rider bị trùng trong danh sách. Cần kiểm tra trước khi điểm danh." };
  if (!matches.length) return { code, error: "Không tìm thấy mã rider. Kiểm tra mã trên thẻ hoặc danh sách Riders." };
  return { code: matches[0].rider_code, rider: matches[0] };
}
export const COT_DEADLINES = {
  COT1: { noPickup: "11:00", pickup: "12:00" },
  COT2: { noPickup: "16:00", pickup: "16:20" },
} as const;
export const STATUS_LABELS: Record<CheckinStatus, string> = {
  pending: "Chờ điểm danh", ontime: "Đúng giờ", late: "Đi trễ", absent: "Vắng mặt", off: "Nghỉ theo lịch",
};

export function vietnamDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function cotForRider(value: string | null): Cot | null {
  const normalized = value?.toUpperCase().replace(/[\s_-]/g, "");
  return normalized === "COT1" || normalized === "COT2" ? normalized : null;
}

export function hasPickupRoute(rider: Pick<Rider, "pickup_district" | "pickup_ward" | "point_name">, log?: Pick<AttendanceLog, "status">) {
  if (log?.status.toUpperCase() === "NO_PICKUP") return false;
  const emptyValues = new Set(["", "-", "—", "n/a", "none", "null", "không", "không có"]);
  return [rider.pickup_ward, rider.pickup_district, rider.point_name].some((v) => !emptyValues.has((v ?? "").trim().toLowerCase()));
}

export function isScheduledOff(log?: Pick<AttendanceLog, "status">) {
  return ["OFF_WEEKLY", "OFF_APPROVED"].includes(log?.status.trim().toUpperCase() ?? "");
}

export function deadlineFor(cot: Cot, hasPickup: boolean, day: string) {
  return new Date(`${day}T${COT_DEADLINES[cot][hasPickup ? "pickup" : "noPickup"]}:00+07:00`);
}

export function classifyAttendance({ cot, hasPickup, day, now, checkin, scheduledOff = false }: {
  cot: Cot; hasPickup: boolean; day: string; now: Date; checkin?: Checkin; scheduledOff?: boolean;
}): { status: CheckinStatus; lateMinutes: number; deadline: Date } {
  const recorded = checkin && checkin.cot === cot && vietnamDate(new Date(checkin.at)) === day && new Date(checkin.at) <= now ? checkin : undefined;
  const deadline = deadlineFor(cot, recorded?.hasPickup ?? hasPickup, day);
  if (recorded) {
    const difference = new Date(recorded.at).getTime() - deadline.getTime();
    return { status: difference > 0 ? "late" : "ontime", lateMinutes: Math.max(0, Math.ceil(difference / 60_000)), deadline };
  }
  if (scheduledOff) return { status: "off", lateMinutes: 0, deadline };
  return { status: now > deadline ? "absent" : "pending", lateMinutes: 0, deadline };
}

export function parseStoredAttendance(value: unknown): DayAttendance {
  const result: DayAttendance = { checkins: {}, pickup: {} };
  if (!value || typeof value !== "object") return result;
  const data = value as Partial<DayAttendance>;
  if (data.checkins && typeof data.checkins === "object") for (const [key, record] of Object.entries(data.checkins)) {
    if (record && typeof record.at === "string" && Number.isFinite(Date.parse(record.at)) && (record.cot === "COT1" || record.cot === "COT2") && typeof record.hasPickup === "boolean") result.checkins[key] = record;
  }
  if (data.pickup && typeof data.pickup === "object") for (const [key, value] of Object.entries(data.pickup)) if (typeof value === "boolean") result.pickup[key] = value;
  return result;
}

export function normalizeSearch(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}
