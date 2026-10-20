import { isBackupDistrict, operationalDistrict, riderDeliveryDistrict } from "../locations/operational-districts.ts";
import type { PerformanceFilters, PerformanceResult, PerformanceRow, PerformanceSummary } from "./driver-performance.ts";

export type PerformanceProfile = {
  rider_code: string; full_name: string | null; kv: string | null; cot: string | null;
  pickup_district: string | null; delivery_district: string | null; delivery_ward: string | null; status: string;
};
export type PerformanceRecord = {
  report_date: string; driver_id: string; driver_name: string | null; contract_type_name: string | null;
  delivery_assigned: number | null; delivery_delivered: number | null; pickup_assigned: number | null; pickup_picked: number | null;
};

const codeKey = (value: string) => value.trim().toUpperCase();
const options = (values: Array<string | null>) => [...new Set(values.filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
const rate = (done: number, assigned: number) => assigned > 0 ? done / assigned * 100 : null;

export function summarizePerformance(filters: PerformanceFilters, profiles: PerformanceProfile[], records: PerformanceRecord[]): PerformanceResult {
  const byCode = new Map(profiles.filter((profile) => profile.status === "active"
    && /^(KV5|KV6)$/.test(profile.kv?.trim().toUpperCase() ?? "")
    && (operationalDistrict(profile.delivery_district) || isBackupDistrict(profile.delivery_district)))
    .map((profile) => [codeKey(profile.rider_code), {
      ...profile, kv: profile.kv!.trim().toUpperCase(), delivery_district: riderDeliveryDistrict(profile.delivery_district),
    }]));
  const joined = records.flatMap((record) => {
    const profile = byCode.get(codeKey(record.driver_id));
    return profile && (filters.kv === "all" || filters.kv === profile.kv) ? [{ record, profile }] : [];
  });
  const districtRows = joined.filter(({ profile }) => filters.district === "all" || profile.delivery_district === filters.district);
  const groups = new Map<string, PerformanceRow>();
  const query = filters.q.toLocaleLowerCase("vi");
  for (const { record, profile } of districtRows) {
    if (filters.ward !== "all" && profile.delivery_ward !== filters.ward) continue;
    if (filters.cot !== "all" && profile.cot !== filters.cot) continue;
    if (query && ![record.driver_id, record.driver_name, record.contract_type_name, profile.full_name, profile.kv, profile.cot,
      profile.pickup_district, profile.delivery_district, profile.delivery_ward].some((value) => value?.toLocaleLowerCase("vi").includes(query))) continue;
    const driverId = profile.rider_code;
    const reportDate = filters.period === "day" ? record.report_date : filters.date;
    const key = `${reportDate}:${driverId}`;
    const row = groups.get(key) ?? {
      report_date: reportDate, driver_id: driverId, driver_name: record.driver_name, rider_name: profile.full_name,
      kv: profile.kv, cot: profile.cot, pickup_district: profile.pickup_district,
      delivery_district: profile.delivery_district, delivery_ward: profile.delivery_ward,
      delivery_assigned: 0, delivery_delivered: 0, pickup_assigned: 0, pickup_picked: 0, delivery_rate: null, pickup_rate: null,
    };
    row.delivery_assigned += Number(record.delivery_assigned ?? 0);
    row.delivery_delivered += Number(record.delivery_delivered ?? 0);
    row.pickup_assigned += Number(record.pickup_assigned ?? 0);
    row.pickup_picked += Number(record.pickup_picked ?? 0);
    row.delivery_rate = rate(row.delivery_delivered, row.delivery_assigned);
    row.pickup_rate = rate(row.pickup_picked, row.pickup_assigned);
    groups.set(key, row);
  }
  const allRows = [...groups.values()];
  const summary: PerformanceSummary = {
    groups: allRows.length, active_riders: new Set(allRows.map((row) => row.driver_id)).size,
    delivery_assigned: 0, delivery_delivered: 0, pickup_assigned: 0, pickup_picked: 0,
  };
  for (const row of allRows) {
    summary.delivery_assigned += row.delivery_assigned; summary.delivery_delivered += row.delivery_delivered;
    summary.pickup_assigned += row.pickup_assigned; summary.pickup_picked += row.pickup_picked;
  }
  const byArea = (a: PerformanceRow, b: PerformanceRow, direction = 1) =>
    compare(a.kv, b.kv, direction) || compare(a.delivery_district, b.delivery_district, direction) || compare(a.cot, b.cot, direction)
    || compare(a.rider_name ?? a.driver_name ?? a.driver_id, b.rider_name ?? b.driver_name ?? b.driver_id, direction);
  const sortValue = (row: PerformanceRow) => {
    if (filters.sort === "rider") return row.rider_name ?? row.driver_name ?? row.driver_id;
    if (filters.sort === "pickup") return row.pickup_picked;
    if (filters.sort === "deliveryRate") return row.delivery_rate;
    if (filters.sort === "pickupRate") return row.pickup_rate;
    return row.delivery_delivered;
  };
  const direction = filters.dir === "asc" ? 1 : -1;
  allRows.sort((a, b) => {
    const primary = filters.sort === "area" ? byArea(a, b, direction) : compare(sortValue(a), sortValue(b), direction);
    return primary || byArea(a, b) || b.delivery_delivered - a.delivery_delivered || b.pickup_picked - a.pickup_picked || compare(a.driver_id, b.driver_id);
  });
  const wards = new Map<string, { district: string | null; ward: string | null; assigned: number; delivered: number }>();
  for (const { record, profile } of districtRows) {
    const key = `${profile.delivery_district}:${profile.delivery_ward}`;
    const ward = wards.get(key) ?? { district: profile.delivery_district, ward: profile.delivery_ward, assigned: 0, delivered: 0 };
    ward.assigned += Number(record.delivery_assigned ?? 0); ward.delivered += Number(record.delivery_delivered ?? 0);
    wards.set(key, ward);
  }
  const offset = (filters.page - 1) * filters.pageSize;
  return {
    filters, rows: allRows.slice(offset, offset + filters.pageSize), summary,
    wardOnHold: [...wards.values()].filter((ward) => ward.assigned > 0).map((ward) => ({
      district: ward.district, ward: ward.ward, delivery_assigned: ward.assigned, delivery_delivered: ward.delivered,
      on_hold: Math.max(0, ward.assigned - ward.delivered), rate: rate(Math.max(0, ward.assigned - ward.delivered), ward.assigned),
    })).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.on_hold - a.on_hold),
    options: {
      districts: options(joined.map(({ profile }) => profile.delivery_district)),
      cots: options(joined.map(({ profile }) => profile.cot)),
      wards: options(districtRows.map(({ profile }) => profile.delivery_ward)),
    },
  };
}

function compare(a: string | number | null, b: string | number | null, direction = 1) {
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "vi", { numeric: true })) * direction;
}
