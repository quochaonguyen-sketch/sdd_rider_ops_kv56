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
 * Assign each rider a DIFFERENT off day within the week per (ward, COT) group,
 * so no group ever has two riders off on the same day. COT1 and COT2 of the
 * same ward are independent: they may share a day. Riders that already have an
 * OFF in the week keep their schedule and are not touched.
 */
export function buildOffAutoScheduleProposal(input: OffAutoScheduleInput): OffAutoScheduleProposal {
  const today = input.today ?? "2000-01-01";
  const weekDates: string[] = [];
  for (let index = 0; index < 7; index += 1) weekDates.push(shiftDate(input.weekStart, index));

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

      const freeDay = weekDates.find((date) => {
        if (date < today) return false;
        if (wardTaken.has(date)) return false;
        if (assignments.some((assignment) => assignment.off_date === date)) return false;
        if (riderTaken?.has(date)) return false;
        return true;
      });

      if (!freeDay) {
        totalSkipped += 1;
        skipped.push({
          rider_id: rider.id,
          rider_code: rider.rider_code,
          full_name: rider.full_name,
          ward,
          reason: "Hết ngày trống trong phường/COT (không được trùng ngày OFF cùng COT)",
        });
        continue;
      }

      wardTaken.add(freeDay);
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
