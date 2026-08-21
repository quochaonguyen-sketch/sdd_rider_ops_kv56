import test from "node:test";
import assert from "node:assert/strict";

import { buildOffAutoScheduleProposal, type AutoScheduleRider } from "../lib/ai/off-auto-schedule.ts";
import { parseOffAutoScheduleIntent } from "../lib/ai/off-auto-schedule-intent.ts";

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
  const proposal = buildOffAutoScheduleProposal({
    district: "Quận 12",
    weekStart: WEEK_START,
    weekEnd: WEEK_END,
    wardScope: null,
    riders: [rider(1, "dong hung thuan"), rider(2, "dong hung thuan"), rider(3, "dong hung thuan"), rider(4, "dong hung thuan"), rider(5, "dong hung thuan"), rider(6, "dong hung thuan"), rider(7, "dong hung thuan"), rider(8, "dong hung thuan")],
    riderTakenDates: new Map(),
    wardTakenDates: new Map(),
    today: "2026-08-01",
  });

  assert.equal(proposal.total_assignments, 7);
  assert.equal(proposal.total_skipped, 1);
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

test("intent: not a scheduling request", () => {
  const intent = parseOffAutoScheduleIntent("ai đang off hôm nay?", {}, new Date("2026-08-18T02:00:00Z"));
  assert.equal(intent.matched, false);
});
