import test from "node:test";
import assert from "node:assert/strict";

import { computeWardOffConflicts, type ConflictRequest, type ConflictRiderInfo } from "../lib/off-schedule/conflicts.ts";
import { normalizeWard, operatingArea, offArea, normalizeDistrict, isDistrict12 } from "../lib/off-schedule/ward.ts";

function req(id: string, riderId: string, code: string, date: string, status: ConflictRequest["status"]): ConflictRequest {
  return { id, rider_id: riderId, rider_code: code, off_date: date, status };
}

function rider(id: string, ward: string, district = "Quận 12", cot: string | null = null): ConflictRiderInfo {
  return { full_name: `Name ${id}`, cot, delivery_district: district, delivery_ward: ward, pickup_district: null, pickup_ward: null };
}

test("two riders of the same ward on the same day conflict", () => {
  const conflicts = computeWardOffConflicts(
    [
      req("a", "r1", "R001", "2026-08-18", "PENDING"),
      req("b", "r2", "R002", "2026-08-18", "PENDING"),
    ],
    new Map([
      ["r1", rider("r1", "Tân Chánh Hiệp")],
      ["r2", rider("r2", "Tân Chánh Hiệp")],
    ]),
  );

  assert.ok(conflicts.has("a"));
  assert.ok(conflicts.has("b"));
  assert.equal(conflicts.get("a")?.count, 1);
  assert.equal(conflicts.get("a")?.ward, "Tân Chánh Hiệp");
});

test("same day but different wards do not conflict", () => {
  const conflicts = computeWardOffConflicts(
    [
      req("a", "r1", "R001", "2026-08-18", "APPROVED"),
      req("b", "r2", "R002", "2026-08-18", "APPROVED"),
    ],
    new Map([
      ["r1", rider("r1", "Tân Chánh Hiệp")],
      ["r2", rider("r2", "Hiệp Thành")],
    ]),
  );

  assert.equal(conflicts.size, 0);
});

test("rejected requests are ignored", () => {
  const conflicts = computeWardOffConflicts(
    [
      req("a", "r1", "R001", "2026-08-18", "APPROVED"),
      req("b", "r2", "R002", "2026-08-18", "REJECTED"),
    ],
    new Map([
      ["r1", rider("r1", "Tân Chánh Hiệp")],
      ["r2", rider("r2", "Tân Chánh Hiệp")],
    ]),
  );

  assert.equal(conflicts.size, 0);
});

test("approved conflict is flagged as has_approved", () => {
  const conflicts = computeWardOffConflicts(
    [
      req("a", "r1", "R001", "2026-08-18", "PENDING"),
      req("b", "r2", "R002", "2026-08-18", "APPROVED"),
    ],
    new Map([
      ["r1", rider("r1", "Tân Chánh Hiệp")],
      ["r2", rider("r2", "Tân Chánh Hiệp")],
    ]),
  );

  assert.equal(conflicts.get("a")?.has_approved, true);
  assert.equal(conflicts.get("a")?.riders[0].rider_code, "R002");
});

test("same ward but DIFFERENT COT on the same day does not conflict", () => {
  const conflicts = computeWardOffConflicts(
    [
      req("a", "r1", "R001", "2026-08-18", "PENDING"),
      req("b", "r2", "R002", "2026-08-18", "PENDING"),
    ],
    new Map([
      ["r1", rider("r1", "Tân Chánh Hiệp", "Quận 12", "COT1")],
      ["r2", rider("r2", "Tân Chánh Hiệp", "Quận 12", "COT2")],
    ]),
  );

  assert.equal(conflicts.size, 0);
});

test("same ward AND same COT on the same day conflicts and reports the COT", () => {
  const conflicts = computeWardOffConflicts(
    [
      req("a", "r1", "R001", "2026-08-18", "APPROVED"),
      req("b", "r2", "R002", "2026-08-18", "APPROVED"),
    ],
    new Map([
      ["r1", rider("r1", "Tân Chánh Hiệp", "Quận 12", "COT2")],
      ["r2", rider("r2", "Tân Chánh Hiệp", "Quận 12", "COT2")],
    ]),
  );

  assert.equal(conflicts.size, 2);
  assert.equal(conflicts.get("a")?.cot, "COT2");
  assert.equal(conflicts.get("a")?.ward, "Tân Chánh Hiệp");
});

test("ward helpers normalize spelling differences", () => {
  assert.equal(normalizeWard("Tân Thới  Nhất"), "tan thoi nhat");
  assert.equal(normalizeWard("Trung Mỹ tây"), "trung my tay");
  assert.equal(normalizeDistrict("Quận 12"), "quan12");
  assert.equal(normalizeDistrict("Q.12"), "quan12");
  assert.equal(isDistrict12("Quận 12"), true);
  assert.equal(isDistrict12("Quận Bình Thạnh"), false);
});

test("operating area prefers delivery for non-COT1 riders", () => {
  const area = operatingArea({ cot: "2", delivery_district: "Quận 12", delivery_ward: "Tân Chánh Hiệp", pickup_district: null, pickup_ward: null });
  assert.equal(area.ward, "Tân Chánh Hiệp");
  assert.equal(area.source, "delivery");
});

test("operating area prefers pickup for COT1 riders", () => {
  const area = operatingArea({ cot: "1", pickup_district: "Quận 12", pickup_ward: "Tân Chánh Hiệp", delivery_district: null, delivery_ward: null });
  assert.equal(area.ward, "Tân Chánh Hiệp");
  assert.equal(area.source, "pickup");
});

test("off area always prefers the delivery (giao) ward, even for COT1", () => {
  const area = offArea({ cot: "1", delivery_district: "Quận 12", delivery_ward: "Tân Chánh Hiệp", pickup_district: "Quận 2", pickup_ward: "Thảo Điền" });
  assert.equal(area.ward, "Tân Chánh Hiệp");
  assert.equal(area.district, "Quận 12");
  assert.equal(area.source, "delivery");
});

test("off area falls back to pickup when delivery ward is missing", () => {
  const area = offArea({ cot: null, delivery_district: null, delivery_ward: null, pickup_district: "Quận 12", pickup_ward: "Hiệp Thành" });
  assert.equal(area.ward, "Hiệp Thành");
  assert.equal(area.source, "pickup_fallback");
});

test("conflicts are grouped by the delivery ward, not pickup", () => {
  const conflicts = computeWardOffConflicts(
    [
      req("a", "r1", "R001", "2026-08-18", "PENDING"),
      req("b", "r2", "R002", "2026-08-18", "PENDING"),
    ],
    new Map([
      // Same pickup ward, different delivery wards -> no conflict
      ["r1", { full_name: "Name r1", cot: "1", delivery_district: "Quận 12", delivery_ward: "Tân Chánh Hiệp", pickup_district: "Quận 2", pickup_ward: "Thảo Điền" }],
      ["r2", { full_name: "Name r2", cot: "1", delivery_district: "Quận 12", delivery_ward: "Hiệp Thành", pickup_district: "Quận 2", pickup_ward: "Thảo Điền" }],
    ]),
  );
  assert.equal(conflicts.size, 0);
});
