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
 * - Days with heavy volume are avoided: the 15th and 25th of the month and all
 *   double sale days 01/01–12/12 are never used for a NEW OFF
 *   (trừ ngày sale đặc biệt).
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

  // Theo dõi tải theo (district|COT) để chia đều T3–T7 ở cấp quận, mỗi COT riêng.
  const districtCotDayCounts = new Map<string, Map<string, number>>();
  for (const [wardCotKey, dates] of input.wardTakenDates) {
    const [, cotPart] = wardCotKey.split("|");
    const ward = wardCotKey.split("|")[0];
    // Tìm district của ward này từ riders (ward -> district)
    const sampleRider = input.riders.find((r) => r.ward === ward && (r.cot ?? "") === (cotPart ?? ""));
    const district = sampleRider?.district ?? ward;
    const dKey = `${district}|${cotPart ?? ""}`;
    const map = districtCotDayCounts.get(dKey) ?? new Map<string, number>();
    for (const d of dates) map.set(d, (map.get(d) ?? 0) + 1);
    districtCotDayCounts.set(dKey, map);
  }

  const plans: AutoScheduleWardPlan[] = [];
  let totalAssignments = 0;
  let totalSkipped = 0;
  let alreadyHaveOff = 0;

  for (const [key, groupRiders] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi"))) {
    const [ward, cotRaw] = key.split("|");
    const cot = cotRaw || null;
    const district = groupRiders[0]?.district ?? ward;
    const dKey = `${district}|${cot ?? ""}`;
    const sorted = [...groupRiders].sort((a, b) => a.rider_code.localeCompare(b.rider_code, "vi"));
    const assignments: AutoScheduleAssignment[] = [];
    const skipped: AutoScheduleSkipped[] = [];
    const wardTaken = new Set(input.wardTakenDates.get(key) ?? []);
    const districtDayCounts = districtCotDayCounts.get(dKey) ?? new Map<string, number>();
    if (!districtCotDayCounts.has(dKey)) districtCotDayCounts.set(dKey, districtDayCounts);

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
        let bestWardScore = Infinity;
        let bestDistrictScore = Infinity;
        for (const date of candidates) {
          if (wardTaken.has(date)) continue;
          if (riderTaken?.has(date)) continue;
          const countOnDay = assignments.filter((assignment) => assignment.off_date === date).length;
          const capacity = isSunday(date) ? sundayMaxOff : maxOffPerDay;
          if (countOnDay >= capacity) continue;
          const dCount = districtDayCounts.get(date) ?? 0;
          // Chủ Nhật cho phép tải cao hơn (3 vs 2) nên dùng tỉ lệ tải để cân: CN được ưu tiên hơn khi tính theo tỉ lệ
          const wardScore = isSunday(date) ? countOnDay / 1.5 : countOnDay;
          const districtScore = isSunday(date) ? dCount / 1.5 : dCount;
          if (wardScore < bestWardScore || (wardScore === bestWardScore && districtScore < bestDistrictScore)) {
            bestWardScore = wardScore;
            bestDistrictScore = districtScore;
            best = date;
          }
        }
        return best;
      };

      // Gộp T3–T7 + CN để CN được cân cùng và có nhiều hơn (nhờ tỉ lệ tải), T2 chỉ khi hết chỗ
      const eligibleCore = [...eligibleTueSat, ...eligibleSun];
      const freeDay = pickLeastLoaded(eligibleCore) ?? pickLeastLoaded(eligibleMon);

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
      wardTaken.add(freeDay);
      districtDayCounts.set(freeDay, (districtDayCounts.get(freeDay) ?? 0) + 1);
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

/** Days that should never host a NEW OFF: 15th/25th and all double sale days 01/01–12/12. Ngày 1,2 không cấm riêng nhưng 1/1 và 2/2 vẫn cấm do là ngày đôi. */
function isForbiddenOffDay(date: string) {
  const day = Number(date.slice(8, 10));
  const month = Number(date.slice(5, 7));
  if (day === 15 || day === 25) return true;
  if (day === month) return true;
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