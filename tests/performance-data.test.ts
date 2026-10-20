import test from "node:test";
import assert from "node:assert/strict";
import { summarizePerformance, type PerformanceProfile, type PerformanceRecord } from "../lib/performance/performance-data.ts";
import type { PerformanceFilters } from "../lib/performance/driver-performance.ts";

const filters: PerformanceFilters = { date: "2026-10-12", period: "day", q: "", kv: "all", district: "all", ward: "all", cot: "all", sort: "delivery", dir: "desc", page: 1, pageSize: 100 };
const profile = (code: string, district = "Thủ Đức", overrides: Partial<PerformanceProfile> = {}): PerformanceProfile => ({
  rider_code: code, full_name: code, kv: "KV5", cot: "COT1", pickup_district: null, delivery_district: district,
  delivery_ward: "Tam Bình", status: "active", ...overrides,
});
const record = (code: string, assigned: number, delivered: number, overrides: Partial<PerformanceRecord> = {}): PerformanceRecord => ({
  driver_id: code, driver_name: code, report_date: filters.date, contract_type_name: "Fulltime",
  delivery_assigned: assigned, delivery_delivered: delivered, pickup_assigned: 0, pickup_picked: 0, ...overrides,
});

test("Performance includes current riders and BK, excludes deleted/inactive/former-area riders", () => {
  const profiles = [profile("TD"), profile("GV", "Quận Gò Vấp"), profile("BK", "Backup"), profile("OLD", "Quận 3"), profile("OFF", "Thủ Đức", { status: "inactive" })];
  const result = summarizePerformance(filters, profiles, ["TD", "GV", "BK", "OLD", "OFF", "DELETED"].map((code) => record(code, 10, 5)));
  assert.equal(result.summary.active_riders, 3);
  assert.equal(result.summary.delivery_assigned, 30);
  assert.deepEqual(new Set(result.rows.map((row) => row.delivery_district)), new Set(["Thủ Đức", "Gò Vấp", "BK"]));
  assert.ok(!result.options.districts.includes("Quận 3"));
});

test("multiple contracts sum before calculating rates and summary stays complete on an empty page", () => {
  const result = summarizePerformance({ ...filters, page: 2 }, [profile("TD")], [record("TD", 10, 8), record("TD", 20, 10, { contract_type_name: "Parttime" })]);
  assert.equal(result.rows.length, 0);
  assert.equal(result.summary.groups, 1);
  assert.equal(result.summary.delivery_assigned, 30);
  assert.equal(result.summary.delivery_delivered, 18);
  const firstPage = summarizePerformance(filters, [profile("TD")], [record("TD", 10, 8), record("TD", 20, 10)]);
  assert.equal(firstPage.rows[0].delivery_rate, 60);
  assert.equal(firstPage.wardOnHold[0].on_hold, 12);
});

test("district, ward, COT, KV and search filters use the current profile", () => {
  const profiles = [profile("A", "Quận Gò Vấp", { cot: "COT2", delivery_ward: "1", full_name: "Tên mới" }), profile("B")];
  const records = [record("A", 20, 10), record("B", 30, 15)];
  const result = summarizePerformance({ ...filters, district: "Gò Vấp", ward: "1", cot: "COT2", q: "Tên mới" }, profiles, records);
  assert.equal(result.rows[0].driver_id, "A");
  assert.equal(result.summary.delivery_assigned, 20);
  assert.equal(summarizePerformance({ ...filters, kv: "KV6" }, profiles, records).rows.length, 0);
  assert.equal(summarizePerformance({ ...filters, cot: "COT3" }, profiles, records).rows.length, 0);
});

test("weekly aggregation combines each rider across dates without duplicating active-rider counts", () => {
  const result = summarizePerformance({ ...filters, period: "week" }, [profile("TD")], [record("TD", 10, 7), record("TD", 20, 11, { report_date: "2026-10-11" })]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].report_date, filters.date);
  assert.equal(result.summary.active_riders, 1);
  assert.equal(result.rows[0].delivery_rate, 60);
});

test("rate sorting keeps riders with no assigned orders last in both directions", () => {
  const profiles = [profile("ZERO"), profile("LOW"), profile("HIGH")];
  const records = [record("ZERO", 0, 0), record("LOW", 10, 2), record("HIGH", 10, 9)];
  for (const dir of ["asc", "desc"] as const) {
    const result = summarizePerformance({ ...filters, sort: "deliveryRate", dir }, profiles, records);
    assert.equal(result.rows.at(-1)?.driver_id, "ZERO");
    assert.equal(result.rows[0].driver_id, dir === "asc" ? "LOW" : "HIGH");
  }
});
