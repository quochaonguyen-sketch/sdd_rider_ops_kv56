import test from "node:test";
import assert from "node:assert/strict";

import {
  cotFamily,
  districtKey,
  recommendReplacementRiders,
  wardKey,
} from "../lib/pickup/recommendations.ts";
import type { Rider } from "../types.ts";

function rider(
  id: string,
  code: string,
  overrides: Partial<Rider> = {},
): Rider {
  return {
    id,
    rider_code: code,
    kv: null,
    home_district: null,
    cot: null,
    full_name: `Rider ${code}`,
    pickup_district: null,
    pickup_ward: null,
    point_name: null,
    delivery_district: null,
    delivery_ward: null,
    avatar_url: null,
    zone_id: null,
    status: "active",
    current_shift: null,
    raw_data: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const TCH = rider("tch", "R001", {
  cot: "COT1",
  pickup_district: "Quận 12",
  pickup_ward: "Phường Tân Chánh Hiệp",
  point_name: "SHOP-A",
});

test("cotFamily groups COT1 variants", () => {
  assert.equal(cotFamily("COT1"), "COT1");
  assert.equal(cotFamily("COT 1"), "COT1");
  assert.equal(cotFamily("1"), "COT1");
  assert.equal(cotFamily("cot1.1"), "COT1");
  assert.equal(cotFamily("COT2"), "COT2");
  assert.equal(cotFamily("2"), "COT2");
  assert.equal(cotFamily(null), "");
  assert.equal(cotFamily(""), "");
});

test("districtKey tolerates prefixes", () => {
  assert.equal(districtKey("Quận 12"), "12");
  assert.equal(districtKey("Q12"), "12");
  assert.equal(districtKey("12"), "12");
  assert.equal(districtKey("Quận Gò Vấp"), "go vap");
});

test("wardKey tolerates phường prefixes", () => {
  assert.equal(wardKey("Quận 12", "Phường Tân Chánh Hiệp"), "12|tan chanh hiep");
  assert.equal(wardKey("Quận 12", "Tân Chánh Hiệp"), "12|tan chanh hiep");
  assert.equal(wardKey("Quận 12", "P12"), "12|12");
  assert.equal(wardKey("Quận 12", "12"), "12|12");
});

test("same-COT candidates are recommended first; cross-COT excluded", () => {
  const sameCot = rider("b", "R002", {
    cot: "COT1",
    pickup_district: "Quận 12",
    pickup_ward: "Tân Chánh Hiệp",
  });
  const crossCot = rider("c", "R003", {
    cot: "COT2",
    pickup_district: "Quận 12",
    pickup_ward: "Tân Chánh Hiệp",
  });
  const result = recommendReplacementRiders({
    rider: TCH,
    candidates: [crossCot, sameCot],
  });
  assert.deepEqual(result.map((item) => item.rider.rider_code), ["R002"]);
  assert.equal(result[0]?.reason, "ward");
});

test("history tier beats same-ward tier", () => {
  const historyRider = rider("h", "R100", {
    cot: "COT1",
    pickup_district: "Quận Gò Vấp",
    pickup_ward: "Phường 12",
  });
  const sameWardRider = rider("w", "R200", {
    cot: "COT1",
    pickup_district: "Quận 12",
    pickup_ward: "Tân Chánh Hiệp",
  });
  const history = new Map([["R001|R100", 3]]);
  const result = recommendReplacementRiders({
    rider: TCH,
    candidates: [sameWardRider, historyRider],
    history,
  });
  assert.deepEqual(result.map((item) => item.rider.rider_code), ["R100", "R200"]);
  assert.equal(result[0]?.reason, "history");
  assert.equal(result[0]?.historyCount, 3);
});

test("history count sorts most frequent first", () => {
  const once = rider("a", "R100", { cot: "COT1" });
  const thrice = rider("b", "R101", { cot: "COT1" });
  const history = new Map([
    ["R001|R100", 1],
    ["R001|R101", 4],
  ]);
  const result = recommendReplacementRiders({
    rider: TCH,
    candidates: [once, thrice],
    history,
  });
  assert.deepEqual(result.map((item) => item.rider.rider_code), ["R101", "R100"]);
});

test("same-ward tier beats nearby (same district) tier", () => {
  const sameWard = rider("w", "R200", {
    cot: "COT1",
    pickup_district: "Quận 12",
    pickup_ward: "Tân Chánh Hiệp",
  });
  const nearby = rider("n", "R300", {
    cot: "COT1",
    pickup_district: "Quận 12",
    pickup_ward: "Hiệp Thành",
  });
  const far = rider("f", "R400", {
    cot: "COT1",
    pickup_district: "Quận Gò Vấp",
    pickup_ward: "Phường 7",
  });
  const result = recommendReplacementRiders({
    rider: TCH,
    candidates: [far, nearby, sameWard],
  });
  assert.deepEqual(
    result.map((item) => item.rider.rider_code),
    ["R200", "R300"],
  );
});

test("volume sorts nearby wards low-first", () => {
  const low = rider("n1", "R301", {
    cot: "COT1",
    pickup_district: "Quận 12",
    pickup_ward: "Hiệp Thành",
  });
  const high = rider("n2", "R302", {
    cot: "COT1",
    pickup_district: "Quận 12",
    pickup_ward: "Thạnh Xuân",
  });
  const wardVolume = new Map([
    [wardKey("Quận 12", "Hiệp Thành"), 12],
    [wardKey("Quận 12", "Thạnh Xuân"), 500],
  ]);
  const result = recommendReplacementRiders({
    rider: TCH,
    candidates: [high, low],
    wardVolume,
  });
  assert.deepEqual(result.map((item) => item.rider.rider_code), ["R301", "R302"]);
});

test("limit caps the number of recommendations", () => {
  const candidates = ["R201", "R202", "R203", "R204", "R205", "R206", "R207"].map(
    (code, index) =>
      rider(code, code, {
        cot: "COT1",
        pickup_district: "Quận 12",
        pickup_ward: `Phường ${index + 1}`,
      }),
  );
  const result = recommendReplacementRiders({
    rider: TCH,
    candidates,
    limit: 3,
  });
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((item) => item.priority),
    [1, 2, 3],
  );
});

test("riders without a COT accept any candidate COT", () => {
  const noCot = rider("x", "R001", {
    cot: null,
    pickup_district: "Quận 12",
    pickup_ward: "Tân Chánh Hiệp",
  });
  const cot1 = rider("y", "R500", {
    cot: "COT1",
    pickup_district: "Quận 12",
    pickup_ward: "Tân Chánh Hiệp",
  });
  const cot2 = rider("z", "R501", {
    cot: "COT2",
    pickup_district: "Quận 12",
    pickup_ward: "Tân Chánh Hiệp",
  });
  const result = recommendReplacementRiders({
    rider: noCot,
    candidates: [cot1, cot2],
  });
  assert.deepEqual(
    new Set(result.map((item) => item.rider.rider_code)),
    new Set(["R500", "R501"]),
  );
});

test("unrelated candidates are not recommended", () => {
  const unrelated = rider("u", "R900", {
    cot: "COT1",
    pickup_district: "Bình Thạnh",
    pickup_ward: "Phường 25",
  });
  const result = recommendReplacementRiders({
    rider: TCH,
    candidates: [unrelated],
  });
  assert.equal(result.length, 0);
});