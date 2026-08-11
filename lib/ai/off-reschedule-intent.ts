import { todayInVietnam } from "@/lib/ai/work-date";

export type OffRescheduleIntent = {
  matched: boolean;
  riderName?: string;
  fromDate?: string;
  toDate?: string;
  error?: string;
};

export function parseOffRescheduleIntent(message: string, now = new Date()): OffRescheduleIntent {
  const normalized = normalize(message).replace(/\s+/g, " ").trim();
  if (!/\b(?:doi|chuyen)\b/.test(normalized) || !/\boff\b/.test(normalized)) return { matched: false };

  const match = normalized.match(/\b(?:doi|chuyen)\s+(?:lich\s+)?off\s+(?:cua\s+)?(.+?)\s+tu\s+(.+?)\s+sang\s+(.+?)(?:\s+tuan\s+(nay|toi))?$/);
  if (!match) {
    return { matched: true, error: "Hãy nói theo mẫu: đổi OFF của [tên rider] từ [thứ/ngày] sang [thứ/ngày] tuần này." };
  }

  const weekOffset = match[4] === "toi" ? 1 : 0;
  const fromDate = resolveActionDate(match[2], weekOffset, now);
  const toDate = resolveActionDate(match[3], weekOffset, now);
  if (!fromDate || !toDate) {
    return { matched: true, error: "Chưa hiểu ngày cũ hoặc ngày mới. Hãy dùng thứ 2–Chủ nhật hoặc ngày dd/mm/yyyy." };
  }
  if (fromDate === toDate) return { matched: true, error: "Ngày OFF cũ và ngày mới đang trùng nhau." };

  return {
    matched: true,
    riderName: match[1].trim(),
    fromDate,
    toDate,
  };
}

function resolveActionDate(value: string, weekOffset: number, now: Date) {
  const explicit = value.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}))?\b/);
  if (explicit) {
    const currentYear = Number(todayInVietnam(now).slice(0, 4));
    return validDate(
      explicit[3] ? Number(explicit[3]) : currentYear,
      Number(explicit[2]),
      Number(explicit[1]),
    );
  }

  const numericWeekday = value.match(/\bthu\s*([2-7])\b/)?.[1];
  const wordWeekday = value.match(/\bthu\s+(hai|ba|tu|nam|sau|bay)\b/)?.[1];
  const wordOffset = wordWeekday ? ({ hai: 0, ba: 1, tu: 2, nam: 3, sau: 4, bay: 5 } as const)[wordWeekday as "hai" | "ba" | "tu" | "nam" | "sau" | "bay"] : null;
  const weekdayOffset = numericWeekday ? Number(numericWeekday) - 2 : wordOffset ?? (/\bchu\s*nhat\b/.test(value) ? 6 : null);
  if (weekdayOffset === null) return null;

  const today = todayInVietnam(now);
  const todayDate = new Date(`${today}T00:00:00Z`);
  const mondayOffset = (todayDate.getUTCDay() + 6) % 7;
  todayDate.setUTCDate(todayDate.getUTCDate() - mondayOffset + weekOffset * 7 + weekdayOffset);
  return todayDate.toISOString().slice(0, 10);
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}
