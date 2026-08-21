const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

export type WorkDateScope = {
  mode: "day" | "week";
  start: string;
  end: string;
  referenceDate: string;
  label: string;
};

export function resolveWorkDateScope(question: string, now = new Date()): WorkDateScope {
  const normalized = normalizeForDate(question);

  const range = resolveExplicitDateRange(normalized, now);
  if (range) return { mode: "week", start: range.start, end: range.end, referenceDate: range.start, label: `${range.start}..${range.end}` };

  const explicitDate = resolveExplicitDate(normalized, now);
  if (explicitDate) return { mode: "day", start: explicitDate, end: explicitDate, referenceDate: explicitDate, label: explicitDate };

  const weekNumberMatch = normalized.match(/\btuan\s+(\d{1,2})\b/);
  if (weekNumberMatch) {
    const year = Number(normalized.match(/\b(20\d{2})\b/)?.[1] ?? todayInVietnam(now).slice(0, 4));
    const start = startOfWeekByWeekNumber(year, Number(weekNumberMatch[1]));
    const end = shiftDate(start, 6);
    return {
      mode: "week",
      start,
      end,
      referenceDate: todayInVietnam(now) >= start && todayInVietnam(now) <= end ? todayInVietnam(now) : start,
      label: `tuần ${weekNumberMatch[1]} (${start}..${end})`,
    };
  }

  const weekMatch = normalized.match(/\btuan\s+(nay|toi|sau|truoc)\b/);
  if (weekMatch) {
    const today = todayInVietnam(now);
    const weekOffset = weekMatch[1] === "truoc" ? -1 : weekMatch[1] === "nay" ? 0 : 1;
    const start = startOfWeekUtc(today, weekOffset);
    const end = shiftDate(start, 6);
    return {
      mode: "week",
      start,
      end,
      referenceDate: today >= start && today <= end ? today : start,
      label: `${start}..${end}`,
    };
  }

  const day = resolveWorkDate(question, now);
  return { mode: "day", start: day, end: day, referenceDate: day, label: day };
}

/**
 * Resolve an explicit date range like "24/08 - 30/08" or
 * "24/08/2026 - 30/08/2026" into its start/end dates (yyyy-MM-dd).
 */
function resolveExplicitDateRange(normalized: string, now: Date) {
  const match = normalized.match(
    /\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}))?\s*(?:-|den|toi|tren)\s*(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}))?\b/,
  );
  if (!match) return null;
  const currentYear = Number(todayInVietnam(now).slice(0, 4));
  const start = validDate(
    match[3] ? Number(match[3]) : currentYear,
    Number(match[2]),
    Number(match[1]),
  );
  const end = validDate(
    match[6] ? Number(match[6]) : currentYear,
    Number(match[5]),
    Number(match[4]),
  );
  if (!start || !end) return null;
  if (end < start) {
    const shifted = validDate(currentYear + 1, Number(match[5]), Number(match[4]));
    if (shifted) return { start, end: shifted };
    return null;
  }
  return { start, end };
}

export function resolveWorkDate(question: string, now = new Date()) {
  const normalized = normalizeForDate(question);
  const explicitDate = resolveExplicitDate(normalized, now);
  if (explicitDate) return explicitDate;

  const today = todayInVietnam(now);
  if (/\b(ngay\s+mot|ngay\s+kia|mot)\b/.test(normalized)) return shiftDate(today, 2);
  if (/\b(ngay\s+mai|mai)\b/.test(normalized)) return shiftDate(today, 1);
  if (/\bhom\s+qua\b/.test(normalized)) return shiftDate(today, -1);
  return today;
}

export function todayInVietnam(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startOfWeekUtc(today: string, weekOffset: number) {
  const date = new Date(`${today}T00:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset + weekOffset * 7);
  return date.toISOString().slice(0, 10);
}

/**
 * Start of week number N of a year, using the rule "week 1 = the week that
 * contains 01/01, weeks start on Monday". E.g. week 35 of 2026 is
 * 24/08/2026 - 30/08/2026.
 */
export function startOfWeekByWeekNumber(year: number, weekNumber: number) {
  const week1Start = startOfWeekUtc(`${year}-01-01`, 0);
  return shiftDate(week1Start, (weekNumber - 1) * 7);
}

function resolveExplicitDate(normalized: string, now: Date) {
  const explicitIso = normalized.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (explicitIso) {
    const value = validDate(Number(explicitIso[1]), Number(explicitIso[2]), Number(explicitIso[3]));
    if (value) return value;
  }

  const explicitVietnamese = normalized.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](20\d{2}))?\b/);
  if (!explicitVietnamese) return null;
  const currentYear = Number(todayInVietnam(now).slice(0, 4));
  return validDate(
    explicitVietnamese[3] ? Number(explicitVietnamese[3]) : currentYear,
    Number(explicitVietnamese[2]),
    Number(explicitVietnamese[1]),
  );
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeForDate(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}