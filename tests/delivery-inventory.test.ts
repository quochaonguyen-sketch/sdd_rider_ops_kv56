import test from "node:test";
import assert from "node:assert/strict";
import { THU_DUC_LEGACY_WARDS, legacyThuDucWardName } from "../lib/locations/operational-districts.ts";
import { buildAnalytics, buildDeliveryDistrictBoards, deliveryInventoryRows, filterBoard, type InventoryRow } from "../components/lmhub-inventory/lmhub-inventory-model.ts";

const order = (ward: string, district = "Thành phố Thủ Đức", cot = "COT1"): InventoryRow => ({
  snapshot_id: "snapshot", snapshot_at: null, shipment_id: ward, received_time: null, ward, district,
  area: "KV5", zone_id: "", status: "Delivering", order_type: "", cot_group: cot,
});

test("only the twelve legacy Thu Duc wards qualify, with source name normalization", () => {
  for (const ward of THU_DUC_LEGACY_WARDS) assert.equal(legacyThuDucWardName(`Phường ${ward}`), ward);
  assert.equal(legacyThuDucWardName("P. LINH XUÂN"), "Linh Xuân");
  assert.equal(legacyThuDucWardName("phuong hiep binh chanh"), "Hiệp Bình Chánh");
  assert.equal(deliveryInventoryRows([order("P. Tam Bình")])[0].ward, "Phường Tam Bình");
});

test("District 2 and District 9 wards are excluded even when the source labels them Thu Duc", () => {
  const outside = ["Cát Lái", "An Phú", "Thảo Điền", "Phước Long B", "An Khánh", "Phước Long A", "Bình Trưng Tây", "Thạnh Mỹ Lợi", "Phước Bình", "Bình Trưng Đông", "An Lợi Đông", "Thủ Thiêm"];
  const rows = [...outside.map((ward) => order(`Phường ${ward}`)), order("Linh Đông"), order("", "Thủ Đức"), order("Chưa xác định", "Thủ Đức")];
  assert.deepEqual(deliveryInventoryRows(rows).map((row) => row.ward), ["Phường Linh Đông"]);
});

test("coverage totals and COT counts exclude outside wards while retaining the other districts", () => {
  const boards = buildDeliveryDistrictBoards([order("Cát Lái"), order("Linh Đông"), order("Tam Phú", "Thủ Đức", "COT2"), order("Phường 1", "Gò Vấp"), order("Hiệp Thành", "Quận 12"), order("Bà Điểm", "Hóc Môn")]);
  assert.equal(boards.length, 4);
  assert.equal(boards[0].totals.total, 2);
  assert.equal(boards[0].totals.cot1, 1);
  assert.equal(boards[0].totals.cot2, 1);
  assert.equal(buildAnalytics(boards, [], "all").visible, 5);
});

test("an out-of-scope snapshot shows a zero-data Thu Duc group without its former wards", () => {
  const boards = buildDeliveryDistrictBoards([order("Cát Lái"), order("Thảo Điền")]);
  assert.equal(boards[0].district, "Thủ Đức");
  assert.equal(boards[0].totals.total, 0);
  assert.equal(boards[0].wards.length, 0);
  assert.equal(filterBoard(boards, "Thủ Đức cũ", "all", "all").length, 1);
});

test("search and priority filters recompute totals from the wards actually displayed", () => {
  const boards = buildDeliveryDistrictBoards([order("Linh Đông"), order("Tam Phú", "Thủ Đức", "COT2")]);
  const filtered = filterBoard(boards, "Linh Đông", "all", "all");
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].totals.total, 1);
  assert.equal(filtered[0].totals.cot2, 0);
  assert.equal(filterBoard(boards, "", "all", "hot").length, 0);
});
