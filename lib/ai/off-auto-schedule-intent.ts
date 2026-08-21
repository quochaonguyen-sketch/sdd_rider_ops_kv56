import { startOfWeekByWeekNumber, startOfWeekUtc, shiftDate, todayInVietnam } from "./work-date.ts";

export type OffAutoScheduleIntent = {
  matched: boolean;
  error?: string;
  district?: string;
  ward?: string | null;
  weekOffset: number;
  weekStart: string;
  weekEnd: string;
};

const SCHEDULE_VERB = /\b(?:xep|sap|phan|ke\s+hoach|tu\s+dong|xep\s+lich|lich\s+off|auto)\b/;

function normalizeSearch(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi");
}

/**
 * Detect "tự xếp lịch OFF" requests, e.g. "xếp lịch off quận 12",
 * "tự xếp off phường Tân Chánh Hiệp tuần này".
 *
 * Ward names are database values, so the caller passes the known ward list of
 * the district; the parser only resolves district + week, the caller resolves
 * the optional ward against real data.
 */
export function parseOffAutoScheduleIntent(
  message: string,
  options: { knownWards?: string[] } = {},
  now = new Date(),
): OffAutoScheduleIntent {
  const normalized = normalizeSearch(message).replace(/\s+/g, " ").trim();
  if (!/\boff\b/.test(normalized) || !SCHEDULE_VERB.test(normalized)) {
    return { matched: false, weekOffset: 0, weekStart: "", weekEnd: "" };
  }

  const districtMatch = normalized.match(/\b(?:quan|q)\s*0*12\b/);
  if (!districtMatch) {
    return {
      matched: true,
      error:
        "AI hiện chỉ tự xếp lịch OFF cho Quận 12. Hãy nói rõ, ví dụ: “xếp lịch off quận 12” hoặc “xếp off phường Tân Chánh Hiệp”.",
      weekOffset: 0,
      weekStart: "",
      weekEnd: "",
    };
  }

  let weekStart: string;
  let weekEnd: string;
  const explicitRange = resolveExplicitDateRange(normalized, now);
  const weekNumberMatch = normalized.match(/\btuan\s+(\d{1,2})\b/);
  if (explicitRange) {
    weekStart = explicitRange.start;
    weekEnd = explicitRange.end;
  } else if (weekNumberMatch) {
    const year = Number(normalized.match(/\b(20\d{2})\b/)?.[1] ?? todayInVietnam(now).slice(0, 4));
    weekStart = startOfWeekByWeekNumber(year, Number(weekNumberMatch[1]));
    weekEnd = shiftDate(weekStart, 6);
  } else {
    const weekMatch = normalized.match(/\btuan\s+(nay|toi|sau)\b/);
    const weekOffset = weekMatch && weekMatch[1] !== "nay" ? 1 : 0;
    const today = todayInVietnam(now);
    weekStart = startOfWeekUtc(today, weekOffset);
    weekEnd = shiftDate(weekStart, 6);
  }

  // Optional ward from known ward names (longest match wins)
  const known = (options.knownWards ?? [])
    .map((ward) => normalizeSearch(ward))
    .filter((ward) => ward.length >= 3);
  const matches = known.filter((ward) => normalized.includes(ward));
  const ward = matches.sort((a, b) => b.length - a.length)[0] ?? null;

  const today = todayInVietnam(now);
  const currentWeekStart = startOfWeekUtc(today, 0);
  const weekOffset = Math.round(
    (Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${currentWeekStart}T00:00:00Z`)) / 604_800_000,
  );

  return {
    matched: true,
    district: "Quận 12",
    ward,
    weekOffset,
    weekStart,
    weekEnd,
  };
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

function validDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}