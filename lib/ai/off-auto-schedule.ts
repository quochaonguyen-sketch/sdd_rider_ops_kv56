import { shiftDate } from "./work-date.ts";

export type AutoScheduleRider = {
  id: string;
  rider_code: string;
  full_name: string | null;
  ward: string;
  cot: string | null;
  district: string | null;
};

export type AutoScheduleAssignment = {
  rider_id: string;
  rider_code: string;
  full_name: string | null;
  ward: string;
  off_date: string;
};

export type AutoScheduleSkipped = {
  rider_id: string;
  rider_code: string;
  full_name: string | null;
  ward: string;
  reason: string;
};

export type AutoScheduleWardPlan = {
  ward: string;
  cot: string | null;
  total_riders: number;
  assignments: AutoScheduleAssignment[];
  skipped: AutoScheduleSkipped[];
};

export type OffAutoScheduleProposal = {
  district: string;
  week_start: string;
  week_end: string;
  ward_scope: string | null;
  wards: AutoScheduleWardPlan[];
  total_assignments: number;
  total_skipped: number;
  already_have_off: number;
};

export type OffAutoScheduleInput = {
  district: string;
  weekStart: string;
  weekEnd: string;
  wardScope: string | null;
  riders: AutoScheduleRider[];
  /** rider_id -> dates the rider already has an OFF (pending/approved/attendance) */
  riderTakenDates: Map<string, Set<string>>;
  /**
   * "${ward}|${cot}" -> dates that already have a confirmed OFF for that
   * ward+COT group. COT1 and COT2 are kept separate, so the same day can host
   * one COT1 rider and one COT2 rider of the same ward.
   */
  wardTakenDates: Map<string, Set<string>>;
  /** today in yyyy-MM-dd; past days are never scheduled */
  today?: string;
};

/**
 * Assign each rider an OFF day within the week per (ward, COT) group, following
 * operational rules:
 *
 * - COT1 and COT2 of the same ward are independent: they may share a day.
 * - Riders that already have an OFF in the week keep their schedule.
 * - Days with heavy volume are avoided: the 1st and 2nd of the month, the 15th
 *   and 25th of the month, and the yearly sale days 06/06 and 07/07 are never
 *   used for a NEW OFF (trừ ngày sale đặc biệt).
 * - Tue–Sat (thứ 3–7) are treated as EQUAL priority and distributed evenly via
 *   least-loaded selection. Sunday and Monday are deprioritized and only used
 *   when Tue–Sat are full.
 * - Capacity per (ward, COT) group per day: groups with >= 4 riders may have
 *   up to 2 riders off on a normal day (3 on Sunday); smaller groups only 1.
 */
export function buildOffAutoScheduleProposal(input: OffAutoScheduleInput): OffAutoScheduleProposal {
  const today = input.today ?? "2000-01-01";
  const weekDates: string[] = [];
  for (let index = 0; index < 7; index += 1) weekDates.push(shiftDate(input.weekStart, index));

  const eligibleDays = weekDates
    .filter((date) => date >= today)
    .filter((date) => !isForbiddenOffDay(date));

  const eligibleTueSat = eligibleDays.filter((date) => {
    const w = new Date(`${date}T00:00:00Z`).getUTCDay();
    return w >= 2 && w <= 6;
  });
  const eligibleSun = eligibleDays.filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0);
  const eligibleMon = eligibleDays.filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() === 1);

  const byGroup = new Map<string, AutoScheduleRider[]>();
  for (const rider of input.riders) {
    if (!rider.ward) continue;
    const key = `${rider.ward}|${rider.cot ?? ""}`;
    const list = byGroup.get(key) ?? [];
    list.push(rider);
    byGroup.set(key, list);
  }

  const plans: AutoScheduleWardPlan[] = [];
  let totalAssignments = 0;
  let totalSkipped = 0;
  let alreadyHaveOff = 0;

  for (const [key, groupRiders] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi"))) {
    const [ward, cotRaw] = key.split("|");
    const cot = cotRaw || null;
    const sorted = [...groupRiders].sort((a, b) => a.rider_code.localeCompare(b.rider_code, "vi"));
    const assignments: AutoScheduleAssignment[] = [];
    const skipped: AutoScheduleSkipped[] = [];
    const wardTaken = new Set(input.wardTakenDates.get(key) ?? []);

    const maxOffPerDay = sorted.length >= 4 ? 2 : 1;
    const sundayMaxOff = sorted.length >= 4 ? 3 : 1;

    for (const rider of sorted) {
      const riderTaken = input.riderTakenDates.get(rider.id);
      if (riderTaken && riderTaken.size > 0) {
        alreadyHaveOff += 1;
        totalSkipped += 1;
        skipped.push({
          rider_id: rider.id,
          rider_code: rider.rider_code,
          full_name: rider.full_name,
          ward,
          reason: "Đã có lịch OFF trong tuần",
        });
        continue;
      }

      const pickLeastLoaded = (candidates: string[]) => {
        let best: string | null = null;
        let bestCount = Infinity;
        for (const date of candidates) {
          if (wardTaken.has(date)) continue;
          if (riderTaken?.has(date)) continue;
          const countOnDay = assignments.filter((assignment) => assignment.off_date === date).length;
          const capacity = isSunday(date) ? sundayMaxOff : maxOffPerDay;
          if (countOnDay >= capacity) continue;
          if (countOnDay < bestCount) {
            bestCount = countOnDay;
            best = date;
          }
        }
        return best;
      };

      const freeDay = pickLeastLoaded(eligibleTueSat) ?? pickLeastLoaded(eligibleSun) ?? pickLeastLoaded(eligibleMon);

      if (!freeDay) {
        totalSkipped += 1;
        skipped.push({
          rider_id: rider.id,
          rider_code: rider.rider_code,
          full_name: rider.full_name,
          ward,
          reason: "Hết ngày trống trong phường/COT (chia đều T3–T7, trừ ngày sale/cao điểm)",
        });
        continue;
      }

      totalAssignments += 1;
      assignments.push({
        rider_id: rider.id,
        rider_code: rider.rider_code,
        full_name: rider.full_name,
        ward,
        off_date: freeDay,
      });
    }

    plans.push({ ward, cot, total_riders: sorted.length, assignments, skipped });
  }

  return {
    district: input.district,
    week_start: input.weekStart,
    week_end: input.weekEnd,
    ward_scope: input.wardScope,
    wards: plans,
    total_assignments: totalAssignments,
    total_skipped: totalSkipped,
    already_have_off: alreadyHaveOff,
  };
}

/** Days that should never host a NEW OFF: 1st/2nd/15th/25th of month and yearly sale days 06/06, 07/07. */
function isForbiddenOffDay(date: string) {
  const day = Number(date.slice(8, 10));
  const month = Number(date.slice(5, 7));
  if (day === 1 || day === 2 || day === 15 || day === 25) return true;
  if ((month === 6 && day === 6) || (month === 7 && day === 7)) return true;
  return false;
}

/** Lower = preferred. Sunday(0) first, then Sat(6), Fri(5), Thu(4), Wed(3), Tue(2), Mon(1) last. */
function weekdayPriority(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const order = [0, 6, 5, 4, 3, 2, 1];
  return order.indexOf(weekday);
}

function isSunday(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
}