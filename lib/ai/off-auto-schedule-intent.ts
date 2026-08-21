import { startOfWeekUtc, shiftDate, todayInVietnam } from "./work-date.ts";

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

  const weekMatch = normalized.match(/\btuan\s+(nay|toi|sau)\b/);
  const weekOffset = weekMatch && weekMatch[1] !== "nay" ? 1 : 0;
  const today = todayInVietnam(now);
  const weekStart = startOfWeekUtc(today, weekOffset);
  const weekEnd = shiftDate(weekStart, 6);

  // Optional ward from known ward names (longest match wins)
  const known = (options.knownWards ?? [])
    .map((ward) => normalizeSearch(ward))
    .filter((ward) => ward.length >= 3);
  const matches = known.filter((ward) => normalized.includes(ward));
  const ward = matches.sort((a, b) => b.length - a.length)[0] ?? null;

  return {
    matched: true,
    district: "Quận 12",
    ward,
    weekOffset,
    weekStart,
    weekEnd,
  };
}
