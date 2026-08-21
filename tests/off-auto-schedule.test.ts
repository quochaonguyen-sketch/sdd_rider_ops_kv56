import test from "node:test";
import assert from "node:assert/strict";

import { buildOffAutoScheduleProposal, type AutoScheduleRider } from "../lib/ai/off-auto-schedule.ts";
import { parseOffAutoScheduleIntent } from "../lib/ai/off-auto-schedule-intent.ts";
import { resolveWorkDateScope } from "../lib/ai/work-date.ts";

const WEEK_START = "2026-08-17"; // Monday
const WEEK_END = "2026-08-23";

function rider(id: number, ward: string, code?: string, cot?: string | null): AutoScheduleRider {
  return {
    id: `r${id}`,
    rider_code: code ?? `R00${id}`,
    full_name: `Rider ${id}`,
    ward,
    cot: cot ?? null,
    district: "Quận 12",
  };
}

test("three riders in one ward get three different off days", () => {
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    wardScope: null,
    riders: [rider(1, "tan chanh hiep"), rider(2, "tan chanh hiep"), rider(3, "tan chanh hiep")],
    riderTakenDates: new Map(),
    wardTakenDates: new Map(),
    today: "2026-08-01",
  });

  assert.equal(proposal.total_assignments, 3);
  assert.equal(proposal.wards.length, 1);
  const days = new Set(proposal.wards[0].assignments.map((a) => a.off_date));
  assert.equal(days.size, 3);
  for (const date of days) {
    assert.ok(date >= WEEK_START && date <= WEEK_END);
  }
});

test("more riders than free days: the rest are skipped with a reason", () => {
  // Week 17/08 - 23/08 has no forbidden sale days. Max capacity for a group of
  // >= 4 riders is 3 (Sunday) + 6 x 2 = 15 slots, so 20 riders leave 5 skipped.
  const riders = Array.from({ length: 20 }, (_, index) => rider(index + 1, "dong hung thuan"));
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    wardScope: null,
    riders,
    riderTakenDates: new Map(),
    wardTakenDates: new Map(),
    today: "2026-08-01",
  });

  assert.equal(proposal.total_assignments, 15);
  assert.equal(proposal.total_skipped, 5);
  assert.match(proposal.wards[0].skipped[0].reason, /Hết ngày trống/);
});

test("riders that already have OFF in the week are not rescheduled", () => {
  const taken = new Map<string, Set<string>>();
  taken.set("r1", new Set(["2026-08-19"]));
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    wardScope: null,
    riders: [rider(1, "tan chanh hiep"), rider(2, "tan chanh hiep"), rider(3, "tan chanh hiep")],
    riderTakenDates: taken,
    wardTakenDates: new Map(),
    today: "2026-08-01",
  });

  assert.equal(proposal.total_assignments, 2);
  assert.equal(proposal.already_have_off, 1);
  const assignedDates = proposal.wards[0].assignments.map((a) => a.off_date);
  assert.ok(!assignedDates.includes("2026-08-19"), "taken day must be avoided");
  assert.ok(new Set(assignedDates).size === 2);
});

test("ward already has a confirmed OFF on a day: that day is not reused", () => {
  const wardTaken = new Map<string, Set<string>>();
  wardTaken.set("tan chanh hiep|", new Set(["2026-08-18"])); // key = ward|COT, empty COT here
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    wardScope: null,
    riders: [rider(1, "tan chanh hiep"), rider(2, "tan chanh hiep"), rider(3, "tan chanh hiep")],
    riderTakenDates: new Map(),
    wardTakenDates: wardTaken,
    today: "2026-08-01",
  });

  const assignedDates = proposal.wards[0].assignments.map((a) => a.off_date);
  assert.ok(!assignedDates.includes("2026-08-18"));
});

test("COT1 and COT2 of the same ward are independent and may share a day", () => {
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    wardScope: null,
    riders: [rider(1, "tan chanh hiep", "R101", "COT1"), rider(2, "tan chanh hiep", "R102", "COT2")],
    riderTakenDates: new Map(),
    wardTakenDates: new Map(),
    today: "2026-08-01",
  });

  assert.equal(proposal.total_assignments, 2);
  assert.equal(proposal.wards.length, 2);
  const cot1 = proposal.wards.find((plan) => plan.cot === "COT1");
  const cot2 = proposal.wards.find((plan) => plan.cot === "COT2");
  assert.ok(cot1 && cot2, "both COT groups get their own plan");
  // Separate groups mean they may land on the same day (allowed).
  assert.equal(cot1.assignments[0].off_date, cot2.assignments[0].off_date);
});

test("two riders of the same ward AND same COT get different days", () => {
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    wardScope: null,
    riders: [rider(1, "tan chanh hiep", "R101", "COT1"), rider(2, "tan chanh hiep", "R102", "COT1")],
    riderTakenDates: new Map(),
    wardTakenDates: new Map(),
    today: "2026-08-01",
  });

  assert.equal(proposal.wards.length, 1);
  assert.equal(proposal.wards[0].cot, "COT1");
  const days = new Set(proposal.wards[0].assignments.map((a) => a.off_date));
  assert.equal(days.size, 2);
});

test("past days are never scheduled when scheduling the current week", () => {
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    wardScope: null,
    riders: [rider(1, "tan chanh hiep"), rider(2, "tan chanh hiep")],
    riderTakenDates: new Map(),
    wardTakenDates: new Map(),
    today: "2026-08-19", // Wednesday
  });

  for (const date of proposal.wards[0].assignments.map((a) => a.off_date)) {
    assert.ok(date >= "2026-08-19");
  }
});

test("intent: xep lich off quan 12 defaults to the current week", () => {
  const intent = parseOffAutoScheduleIntent("xếp lịch off quận 12", {}, new Date("2026-08-18T02:00:00Z"));
  assert.equal(intent.matched, true);
  assert.equal(intent.district, "Quận 12");
  assert.equal(intent.weekOffset, 0);
  assert.equal(intent.weekStart, "2026-08-17");
  assert.equal(intent.weekEnd, "2026-08-23");
});

test("intent: tuan toi schedules the next week", () => {
  const intent = parseOffAutoScheduleIntent("xếp lịch off quận 12 tuần tới", {}, new Date("2026-08-18T02:00:00Z"));
  assert.equal(intent.matched, true);
  assert.equal(intent.weekOffset, 1);
  assert.equal(intent.weekStart, "2026-08-24");
  assert.equal(intent.weekEnd, "2026-08-30");
});

test("intent: tuan nay keeps the current week", () => {
  const intent = parseOffAutoScheduleIntent("xếp off quận 12 tuần này", {}, new Date("2026-08-18T02:00:00Z"));
  assert.equal(intent.matched, true);
  assert.equal(intent.weekOffset, 0);
  assert.equal(intent.weekStart, "2026-08-17");
});

test("intent: ward name resolved from known ward list", () => {
  const intent = parseOffAutoScheduleIntent(
    "xếp lịch off phường Tân Chánh Hiệp quận 12",
    { knownWards: ["Tân Chánh Hiệp", "Hiệp Thành"] },
    new Date("2026-08-18T02:00:00Z"),
  );
  assert.equal(intent.matched, true);
  assert.equal(intent.ward, "tan chanh hiep");
});

test("intent: tuan 35 resolves to the exact week (24/08 - 30/08/2026)", () => {
  const intent = parseOffAutoScheduleIntent("xếp lịch off quận 12 tuần 35", {}, new Date("2026-08-18T02:00:00Z"));
  assert.equal(intent.matched, true);
  assert.equal(intent.weekStart, "2026-08-24");
  assert.equal(intent.weekEnd, "2026-08-30");
});

test("intent: explicit date range 24/08 - 30/08 wins over week number", () => {
  const intent = parseOffAutoScheduleIntent("xếp lịch off quận 12 tuần 35 24/08 - 30/08", {}, new Date("2026-08-18T02:00:00Z"));
  assert.equal(intent.matched, true);
  assert.equal(intent.weekStart, "2026-08-24");
  assert.equal(intent.weekEnd, "2026-08-30");
});

test("intent: explicit date range with year 24/08/2026 - 30/08/2026", () => {
  const intent = parseOffAutoScheduleIntent("xếp lịch off quận 12 24/08/2026 - 30/08/2026", {}, new Date("2026-08-18T02:00:00Z"));
  assert.equal(intent.matched, true);
  assert.equal(intent.weekStart, "2026-08-24");
  assert.equal(intent.weekEnd, "2026-08-30");
});

test("intent: tuan 1 is the week containing 01/01", () => {
  const intent = parseOffAutoScheduleIntent("xếp off quận 12 tuần 1", {}, new Date("2026-08-18T02:00:00Z"));
  assert.equal(intent.matched, true);
  assert.equal(intent.weekStart, "2025-12-29");
  assert.equal(intent.weekEnd, "2026-01-04");
});

test("work-date: resolveWorkDateScope understands tuần 35", () => {
  const scope = resolveWorkDateScope("xếp lịch off quận 12 tuần 35", new Date("2026-08-18T02:00:00Z"));
  assert.equal(scope.mode, "week");
  assert.equal(scope.start, "2026-08-24");
  assert.equal(scope.end, "2026-08-30");
});

test("work-date: resolveWorkDateScope understands date range 24/08 - 30/08", () => {
  const scope = resolveWorkDateScope("off từ 24/08 - 30/08", new Date("2026-08-18T02:00:00Z"));
  assert.equal(scope.mode, "week");
  assert.equal(scope.start, "2026-08-24");
  assert.equal(scope.end, "2026-08-30");
});

test("new rule: OFF prefers Sunday first (least volume)", () => {
  // Week 24/08 - 30/08/2026: Sunday is 30/08. Monday 24/08 and sale day 25/08 are forbidden.
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: "2026-08-24",
    weekEnd: "2026-08-30",
    wardScope: null,
    riders: [rider(1, "tan chanh hiep"), rider(2, "tan chanh hiep")],
    riderTakenDates: new Map(),
    wardTakenDates: new Map(),
    today: "2026-08-01",
  });
  assert.equal(proposal.total_assignments, 2);
  const dates = proposal.wards[0].assignments.map((a) => a.off_date);
  assert.ok(dates.includes("2026-08-30"), "Sunday (least volume) must be preferred");
  assert.ok(!dates.includes("2026-08-24"), "Monday must not be used");
  assert.ok(!dates.includes("2026-08-25"), "sale day 25 must not be used");
});

test("new rule: forbidden days (1st, 2nd, 15th, 25th) never host OFF", () => {
  // Week 14/09 - 20/09/2026 contains 15/09 (forbidden) and Sunday 20/09.
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: "2026-09-14",
    weekEnd: "2026-09-20",
    wardScope: null,
    riders: [rider(1, "tan chanh hiep"), rider(2, "tan chanh hiep"), rider(3, "tan chanh hiep"), rider(4, "tan chanh hiep"), rider(5, "tan chanh hiep")],
    riderTakenDates: new Map(),
    wardTakenDates: new Map(),
    today: "2026-09-01",
  });
  const dates = proposal.wards[0].assignments.map((a) => a.off_date);
  assert.ok(!dates.includes("2026-09-15"), "15th must not host OFF");
  // All assigned dates are in the week.
  for (const date of dates) assert.ok(date >= "2026-09-14" && date <= "2026-09-20");
});

test("new rule: yearly sale days 06/06 and 07/07 never host OFF", () => {
  // Week 01/06 - 07/06/2026 contains 06/06 (forbidden) and Sunday 07/06.
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: "2026-06-01",
    weekEnd: "2026-06-07",
    wardScope: null,
    riders: [rider(1, "tan chanh hiep"), rider(2, "tan chanh hiep"), rider(3, "tan chanh hiep"), rider(4, "tan chanh hiep"), rider(5, "tan chanh hiep"), rider(6, "tan chanh hiep"), rider(7, "tan chanh hiep"), rider(8, "tan chanh hiep")],
    riderTakenDates: new Map(),
    wardTakenDates: new Map(),
    today: "2026-05-30",
  });
  const dates = proposal.wards[0].assignments.map((a) => a.off_date);
  assert.ok(!dates.includes("2026-06-06"), "06/06 must not host OFF");
});

test("new rule: group with >= 4 riders may have 2 OFF per day (3 on Sunday)", () => {
  // 4 riders, one ward, same COT -> they can share days up to capacity.
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: "2026-08-24",
    weekEnd: "2026-08-30",
    wardScope: null,
    riders: [rider(1, "tan chanh hiep", "R101", "COT1"), rider(2, "tan chanh hiep", "R102", "COT1"), rider(3, "tan chanh hiep", "R103", "COT1"), rider(4, "tan chanh hiep", "R104", "COT1")],
    riderTakenDates: new Map(),
    wardTakenDates: new Map(),
    today: "2026-08-01",
  });
  assert.equal(proposal.total_assignments, 4);
  const dates = proposal.wards[0].assignments.map((a) => a.off_date);
  const countByDay = new Map<string, number>();
  for (const date of dates) countByDay.set(date, (countByDay.get(date) ?? 0) + 1);
  for (const [, count] of countByDay) assert.ok(count <= 3, "max 3 on Sunday");
  // Sunday 30/08 must be preferred and can hold 2+ riders (2 riders share Sunday at most 3).
  assert.ok(countByDay.get("2026-08-30")! >= 2, "Sunday holds multiple riders for big groups");
});

test("new rule: group of 3 riders only allows 1 OFF per day", () => {
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: "2026-08-24",
    weekEnd: "2026-08-30",
    wardScope: null,
    riders: [rider(1, "tan chanh hiep"), rider(2, "tan chanh hiep"), rider(3, "tan chanh hiep")],
    riderTakenDates: new Map(),
    wardTakenDates: new Map(),
    today: "2026-08-01",
  });
  const dates = proposal.wards[0].assignments.map((a) => a.off_date);
  const unique = new Set(dates);
  assert.equal(unique.size, 3, "3 riders -> 3 distinct days (1 OFF per day)");
});

test("intent: not a scheduling request", () => {
  const intent = parseOffAutoScheduleIntent("ai đang off hôm nay?", {}, new Date("2026-08-18T02:00:00Z"));
  assert.equal(intent.matched, false);
});