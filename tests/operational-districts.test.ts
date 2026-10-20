import test from "node:test";
import assert from "node:assert/strict";
import { BACKUP_DISTRICT, OPERATIONAL_DISTRICT_NAMES, isBackupDistrict, operationalDistrict, operationalDistrictValues, riderDeliveryDistrict } from "../lib/locations/operational-districts.ts";
import { canonicalDistrictShortName, canonicalWardNames, hcmDistricts } from "../lib/locations/hcm.ts";

test("current delivery coverage contains four districts assigned to KV5", () => {
  assert.deepEqual(OPERATIONAL_DISTRICT_NAMES, ["Thủ Đức", "Gò Vấp", "Quận 12", "Hóc Môn"]);
  for (const name of OPERATIONAL_DISTRICT_NAMES) assert.equal(operationalDistrict(name)?.area, "KV5");
});

test("district spellings from rider plans and raw snapshots resolve to the same groups", () => {
  for (const value of ["TP. Thủ Đức", "THÀNH PHỐ THỦ ĐỨC", "Thu Duc"]) {
    assert.equal(operationalDistrict(value)?.name, "Thủ Đức");
  }
  assert.equal(operationalDistrict(" QUẬN GÒ VẤP ")?.name, "Gò Vấp");
  assert.equal(operationalDistrict("Q.12")?.name, "Quận 12");
  assert.equal(operationalDistrict("Huyện Hóc Môn")?.name, "Hóc Môn");
});

test("former districts and unknown locations do not enter delivery totals", () => {
  for (const value of ["Quận Bình Thạnh", "Bình Thạnh", "Quận 3", "Quận 1", "Quận 2", "Quận 9", "Q2", "Q9", "District 2", "District 9", "", null]) {
    assert.equal(operationalDistrict(value), null);
  }
});

test("BK is a separate backup group and is never assigned to a delivery district", () => {
  for (const value of ["BK", "bk", "Backup", " BACK UP "]) {
    assert.equal(isBackupDistrict(value), true);
    assert.equal(riderDeliveryDistrict(value), BACKUP_DISTRICT);
    assert.equal(operationalDistrict(value), null);
  }
  assert.equal(isBackupDistrict("Thủ Đức"), false);
  assert.equal(riderDeliveryDistrict(null), null);
});

test("raw snapshot query values include aliases and exclude former districts", () => {
  const values = operationalDistrictValues();
  assert.ok(values.includes("Quận Gò Vấp"));
  assert.ok(values.includes("GÒ VẤP"));
  assert.ok(values.includes("Huyện Hóc Môn"));
  assert.ok(values.includes("Thành phố Thủ Đức"));
  assert.ok(!values.includes("Quận Bình Thạnh"));
  assert.ok(!values.includes("Quận 3"));
  assert.ok(!values.includes("Quận 2"));
  assert.ok(!values.includes("Quận 9"));
  assert.ok(operationalDistrictValues("Gò Vấp").every((value) => operationalDistrict(value)?.name === "Gò Vấp"));
  assert.deepEqual(operationalDistrictValues("Quận 3"), []);
});

test("rider location filters and map wards share the same four district groups", () => {
  assert.deepEqual(hcmDistricts.map((district) => district.shortName), OPERATIONAL_DISTRICT_NAMES);
  assert.equal(canonicalDistrictShortName("Quận Gò Vấp"), "Gò Vấp");
  assert.equal(canonicalDistrictShortName("Thành phố Thủ Đức"), "Thủ Đức");
  assert.deepEqual(canonicalWardNames("Thủ Đức", "Tam Bình/Tam Phú"), ["Tam Bình", "Tam Phú"]);
  assert.deepEqual(canonicalWardNames("Quận 2", "Thảo Điền"), []);
  assert.deepEqual(canonicalWardNames("Quận 9", "Long Bình"), []);
  assert.equal(hcmDistricts.find((district) => district.id === "thu-duc")?.wards.length, 12);
  assert.deepEqual(canonicalWardNames("Gò Vấp", "1,5"), ["Phường 1", "Phường 5"]);
});
