import test from "node:test";
import assert from "node:assert/strict";
import { classifyAttendance, cotForRider, deadlineFor, hasPickupRoute, parseStoredAttendance, resolveScannedRider, vietnamDate, type Cot } from "../lib/attendance/cot-attendance.ts";

const day = "2026-10-14";
test("scanner accepts the complete rider code with Enter/Tab terminators and preserves leading zeroes", () => {
  const riders = [{ rider_code: "RD007" }, { rider_code: "000123" }, { rider_code: "123" }];
  assert.deepEqual(resolveScannedRider(" rd007\r\n", riders), { code: "RD007", rider: riders[0] });
  assert.deepEqual(resolveScannedRider("000123\t", riders), { code: "000123", rider: riders[1] });
  assert.equal("error" in resolveScannedRider("RD00", riders), true);
  assert.equal("error" in resolveScannedRider("RD007\n123", riders), true);
  assert.equal("error" in resolveScannedRider(" ", riders), true);
});

test("scanner rejects unknown codes and ambiguous duplicated rider identifiers", () => {
  assert.equal("error" in resolveScannedRider("RD999", [{ rider_code: "RD007" }]), true);
  assert.equal("error" in resolveScannedRider("rd007", [{ rider_code: "RD007" }, { rider_code: "rd007" }]), true);
});
const at = (time: string) => new Date(`${day}T${time}+07:00`);
const cases: Array<[Cot, boolean, string]> = [
  ["COT1", false, "11:00"], ["COT1", true, "12:00"],
  ["COT2", false, "16:00"], ["COT2", true, "16:20"],
];

for (const [cot, hasPickup, time] of cases) {
  test(`${cot}, pickup=${hasPickup}: exact deadline is on time; afterward is absent or late`, () => {
    const limit = at(`${time}:00`);
    assert.equal(deadlineFor(cot, hasPickup, day).toISOString(), limit.toISOString());
    const classify = (now: Date, checkinTime?: Date) => classifyAttendance({ cot, hasPickup, day, now, checkin: checkinTime ? { at: checkinTime.toISOString(), cot, hasPickup } : undefined });
    assert.equal(classify(new Date(limit.getTime() - 1000)).status, "pending");
    assert.equal(classify(limit).status, "pending");
    assert.equal(classify(limit, limit).status, "ontime");
    const past = new Date(limit.getTime() + 1000);
    assert.equal(classify(past).status, "absent");
    assert.equal(classify(past, past).status, "late");
    assert.equal(classify(past, past).lateMinutes, 1);
    assert.equal(classify(new Date(limit.getTime() + 7 * 60_000), new Date(limit.getTime() + 7 * 60_000)).lateMinutes, 7);
  });
}

test("a rider with a pickup route remains pending at 16:05 while a rider without one is absent", () => {
  assert.equal(classifyAttendance({ cot: "COT2", hasPickup: true, day, now: at("16:05:00") }).status, "pending");
  assert.equal(classifyAttendance({ cot: "COT2", hasPickup: false, day, now: at("16:05:00") }).status, "absent");
});

test("late arrival transitions from absent to late; the pickup snapshot protects the recorded deadline", () => {
  const input = { cot: "COT2" as const, hasPickup: false, day, now: at("16:26:00") };
  assert.equal(classifyAttendance(input).status, "absent");
  const result = classifyAttendance({ ...input, checkin: { at: at("16:26:00").toISOString(), cot: "COT2", hasPickup: true } });
  assert.equal(result.status, "late");
  assert.equal(result.lateMinutes, 6);
});

test("records from another date or COT and future checkins are ignored", () => {
  const input = { cot: "COT2" as const, hasPickup: false, day, now: at("16:35:00") };
  for (const checkin of [
    { at: "2026-10-13T15:55:00+07:00", cot: "COT2" as const, hasPickup: false },
    { at: at("10:50:00").toISOString(), cot: "COT1" as const, hasPickup: false },
    { at: at("17:00:00").toISOString(), cot: "COT2" as const, hasPickup: false },
  ]) assert.equal(classifyAttendance({ ...input, checkin }).status, "absent");
});

test("approved days off are excluded from absence; Vietnamese midnight is independent of host timezone", () => {
  assert.equal(classifyAttendance({ cot: "COT2", hasPickup: false, day, now: at("17:00:00"), scheduledOff: true }).status, "off");
  assert.equal(vietnamDate(new Date("2026-10-13T17:01:00Z")), day);
  assert.equal(vietnamDate(new Date("2026-10-14T16:59:59Z")), day);
});

test("pickup placeholders are empty; NO_PICKUP overrides an assigned district", () => {
  const noRoute = { pickup_district: "-", pickup_ward: "Không có", point_name: null };
  assert.equal(hasPickupRoute(noRoute), false);
  assert.equal(hasPickupRoute({ ...noRoute, pickup_district: "Quận 1" }), true);
  assert.equal(hasPickupRoute({ ...noRoute, pickup_district: "Quận 1" }, { status: "NO_PICKUP" }), false);
  assert.equal(cotForRider(" cot 2 "), "COT2");
  assert.equal(cotForRider("COT3"), null);
});

test("corrupt stored records cannot become attendance entries", () => {
  const result = parseStoredAttendance({ checkins: {
    valid: { at: at("15:55:00").toISOString(), cot: "COT2", hasPickup: false },
    badDate: { at: "broken", cot: "COT2", hasPickup: false },
    badCot: { at: at("15:55:00").toISOString(), cot: "COT3", hasPickup: false },
  }, pickup: { valid: true, broken: "true" } });
  assert.deepEqual(Object.keys(result.checkins), ["valid"]);
  assert.deepEqual(result.pickup, { valid: true });
});
