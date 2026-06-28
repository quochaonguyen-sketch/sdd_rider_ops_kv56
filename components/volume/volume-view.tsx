"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { PickupVolumeDashboard, type PickupDistrict } from "@/components/volume/pickup-volume-dashboard";
import {
  DeliveryVolumeDashboard,
  type DeliveryTrendPoint,
  type DeliveryViewMode,
} from "@/components/volume/delivery-volume-dashboard";

type VolumeKind = "delivery" | "pickup";

type VolumeRow = {
  summary_id?: string;
  report_date?: string;
  district: string | null;
  ward?: string | null;
  old_ward?: string | null;
  new_ward?: string | null;
  area: string | null;
  order_type?: string | null;
  cot_group?: string | null;
  cot?: string | null;
  ma_tuyen?: string | null;
  total_orders?: number | null;
};

type WardSummary = {
  ward: string;
  count: number;
  cots: CotSummary[];
};

type DistrictSummary = {
  district: string;
  count: number;
  wards: WardSummary[];
  cots: CotSummary[];
};

type CotSummary = {
  cot: string;
  count: number;
};

const PAGE_SIZE = 1000;

export function VolumeView({ kind }: { kind: VolumeKind }) {
  const table = kind === "delivery" ? "delivery_order" : "pickup_volume";
  const [date, setDate] = useState(todayInVietnam());
  const [rows, setRows] = useState<VolumeRow[]>([]);
  const [comparisonRows, setComparisonRows] = useState<VolumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deliveryViewMode, setDeliveryViewMode] = useState<DeliveryViewMode>("day");

  const loadVolume = useCallback(async () => {
    const supabase = createClient();
    const loaded: VolumeRow[] = [];
    let offset = 0;

    setLoading(true);
    setError(null);
    const deliveryRange = deliveryDateRange(date, deliveryViewMode);
    const comparisonRange = deliveryComparisonRange(date, deliveryViewMode);

    while (true) {
      const query =
        kind === "delivery"
          ? supabase
              .from(table)
              .select("summary_id,report_date,old_ward,district,area,cot,total_orders")
              .gte("report_date", deliveryRange.start)
              .lte("report_date", deliveryRange.end)
              .order("district")
              .range(offset, offset + PAGE_SIZE - 1)
          : supabase
              .from(table)
              .select("summary_id,report_date,new_ward,district,area,cot,ma_tuyen,total_orders")
              .eq("report_date", date)
              .order("district")
              .range(offset, offset + PAGE_SIZE - 1);

      const { data, error: queryError } = await query;

      if (queryError) {
        setError(queryError.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const batch = (data ?? []) as VolumeRow[];
      loaded.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    setRows(loaded);

    if (kind === "delivery") {
      const comparisonLoaded: VolumeRow[] = [];
      let comparisonOffset = 0;
      while (true) {
        const { data, error: comparisonError } = await supabase
          .from(table)
          .select("summary_id,report_date,old_ward,district,area,cot,total_orders")
          .gte("report_date", comparisonRange.start)
          .lte("report_date", comparisonRange.end)
          .order("district")
          .range(comparisonOffset, comparisonOffset + PAGE_SIZE - 1);

        if (comparisonError) {
          setError(comparisonError.message);
          setComparisonRows([]);
          setLoading(false);
          return;
        }

        const batch = (data ?? []) as VolumeRow[];
        comparisonLoaded.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        comparisonOffset += PAGE_SIZE;
      }
      setComparisonRows(comparisonLoaded);
    } else {
      setComparisonRows([]);
    }
    setLoading(false);
  }, [date, deliveryViewMode, kind, table]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadVolume();
  }, [loadVolume]);

  const refresh = useCallback(() => {
    void loadVolume();
  }, [loadVolume]);

  useSupabaseRealtime({ table, onChange: refresh });

  const summary = useMemo(() => summarizeVolume(rows), [rows]);
  const deliveryDayCount = useMemo(() => countReportDays(rows), [rows]);
  const deliverySummary = useMemo(
    () => (kind === "delivery" && deliveryViewMode !== "day" ? averageVolumeSummary(summary, deliveryDayCount) : summary),
    [deliveryDayCount, deliveryViewMode, kind, summary],
  );
  const comparisonRawSummary = useMemo(() => summarizeVolume(comparisonRows), [comparisonRows]);
  const comparisonDayCount = useMemo(() => countReportDays(comparisonRows), [comparisonRows]);
  const comparisonSummary = useMemo(
    () =>
      kind === "delivery" && deliveryViewMode !== "day"
        ? averageVolumeSummary(comparisonRawSummary, comparisonDayCount)
        : comparisonRawSummary,
    [comparisonDayCount, comparisonRawSummary, deliveryViewMode, kind],
  );
  const pickupDistricts = useMemo(() => summarizePickupDistrictRoutes(rows), [rows]);
  const pickupRouteCount = useMemo(() => countPickupRoutes(pickupDistricts), [pickupDistricts]);
  const deliveryTrend = useMemo(() => summarizeDeliveryTrend(rows), [rows]);

  if (kind === "pickup") {
    return (
      <PickupVolumeDashboard
        date={date}
        onDateChange={setDate}
        onRefresh={refresh}
        loading={loading}
        error={error}
        totalOrders={summary.total}
        totalRoutes={pickupRouteCount}
        wardCount={summary.wardCount}
        cotVolumes={summary.cots}
        districts={pickupDistricts}
      />
    );
  }

  return (
    <DeliveryVolumeDashboard
      date={date}
      onDateChange={setDate}
      viewMode={deliveryViewMode}
      onViewModeChange={setDeliveryViewMode}
      onRefresh={refresh}
      loading={loading}
      error={error}
      totalOrders={deliverySummary.total}
      wardCount={deliverySummary.wardCount}
      cotVolumes={deliverySummary.cots}
      districts={deliverySummary.districts}
      trend={deliveryTrend}
      averageDays={deliveryViewMode === "day" ? 1 : deliveryDayCount}
      comparisonTotalOrders={comparisonSummary.total}
      comparisonDistricts={comparisonSummary.districts}
      comparisonLabel={deliveryComparisonLabel(deliveryViewMode)}
    />
  );
}

function summarizeVolume(rows: VolumeRow[]) {
  const districts = new Map<
    string,
    {
      wards: Map<string, { count: number; cots: Map<string, number> }>;
      cots: Map<string, number>;
    }
  >();
  const groups = new Set<string>();
  const totalCots = new Map<string, number>();

  for (const row of rows) {
    const district = row.district?.trim() || "Chưa xác định quận/huyện";
    const ward = row.ward?.trim() || row.new_ward?.trim() || row.old_ward?.trim() || "Chưa xác định phường/xã";
    const count = row.total_orders ?? 1;
    const cot = normalizeCot(row.cot || row.cot_group);
    const districtData = districts.get(district) ?? {
      wards: new Map<string, { count: number; cots: Map<string, number> }>(),
      cots: new Map<string, number>(),
    };
    const wardData = districtData.wards.get(ward) ?? { count: 0, cots: new Map<string, number>() };

    wardData.count += count;
    if (cot) {
      wardData.cots.set(cot, (wardData.cots.get(cot) ?? 0) + count);
      districtData.cots.set(cot, (districtData.cots.get(cot) ?? 0) + count);
      totalCots.set(cot, (totalCots.get(cot) ?? 0) + count);
    }

    districtData.wards.set(ward, wardData);
    districts.set(district, districtData);

    const group = cot || row.ma_tuyen?.trim() || row.order_type?.trim();
    if (group) groups.add(group);
  }

  const districtSummaries: DistrictSummary[] = Array.from(districts, ([district, districtData]) => {
    const wardSummaries = Array.from(districtData.wards, ([ward, wardData]) => ({
      ward,
      count: wardData.count,
      cots: sortCotSummaries(wardData.cots),
    })).sort(
      (a, b) => b.count - a.count || a.ward.localeCompare(b.ward, "vi"),
    );
    return {
      district,
      count: wardSummaries.reduce((total, ward) => total + ward.count, 0),
      wards: wardSummaries,
      cots: sortCotSummaries(districtData.cots),
    };
  }).sort((a, b) => b.count - a.count || a.district.localeCompare(b.district, "vi"));

  return {
    total: districtSummaries.reduce((total, district) => total + district.count, 0),
    districts: districtSummaries,
    wardCount: districtSummaries.reduce((total, district) => total + district.wards.length, 0),
    groupCount: groups.size,
    cots: sortCotSummaries(totalCots),
  };
}

function summarizePickupDistrictRoutes(rows: VolumeRow[]): PickupDistrict[] {
  const districts = new Map<
    string,
    {
      count: number;
      cots: Map<string, number>;
      wards: Map<
        string,
        {
          count: number;
          cots: Map<string, number>;
          routes: Map<string, { count: number; cots: Map<string, number> }>;
        }
      >;
    }
  >();

  for (const row of rows) {
    const districtName = row.district?.trim() || "Chưa xác định quận/huyện";
    const wardName = row.new_ward?.trim() || row.ward?.trim() || "Chưa xác định phường/xã";
    const cot = normalizeCot(row.cot);
    const district = districts.get(districtName) ?? { count: 0, cots: new Map(), wards: new Map() };
    const ward = district.wards.get(wardName) ?? { count: 0, cots: new Map(), routes: new Map() };

    for (const entry of parseRouteBreakdown(row.ma_tuyen, row.total_orders ?? 0)) {
      const route = ward.routes.get(entry.route) ?? { count: 0, cots: new Map() };
      route.count += entry.count;
      if (cot) {
        route.cots.set(cot, (route.cots.get(cot) ?? 0) + entry.count);
        ward.cots.set(cot, (ward.cots.get(cot) ?? 0) + entry.count);
        district.cots.set(cot, (district.cots.get(cot) ?? 0) + entry.count);
      }
      ward.routes.set(entry.route, route);
      ward.count += entry.count;
      district.count += entry.count;
    }

    district.wards.set(wardName, ward);
    districts.set(districtName, district);
  }

  return Array.from(districts, ([district, districtData]) => ({
    district,
    count: districtData.count,
    cots: sortCotSummaries(districtData.cots),
    wards: Array.from(districtData.wards, ([ward, wardData]) => ({
      ward,
      count: wardData.count,
      cots: sortCotSummaries(wardData.cots),
      routes: Array.from(wardData.routes, ([route, routeData]) => ({
        route,
        count: routeData.count,
        cots: sortCotSummaries(routeData.cots),
      })).sort((a, b) => b.count - a.count || a.route.localeCompare(b.route, "vi", { numeric: true })),
    })).sort((a, b) => b.count - a.count || a.ward.localeCompare(b.ward, "vi")),
  })).sort((a, b) => b.count - a.count || a.district.localeCompare(b.district, "vi"));
}

function countPickupRoutes(districts: PickupDistrict[]) {
  return new Set(
    districts.flatMap((district) => district.wards.flatMap((ward) => ward.routes.map((route) => route.route))),
  ).size;
}

function parseRouteBreakdown(value: string | null | undefined, fallbackCount: number) {
  const raw = value?.trim();
  if (!raw) return [{ route: "Chưa có mã tuyến", count: fallbackCount }];

  const entries = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.lastIndexOf(":");
      if (separator < 1) return null;
      const route = part.slice(0, separator).trim();
      const count = Number(part.slice(separator + 1).trim().replace(/[.,\s]/g, ""));
      return route && Number.isFinite(count) ? { route, count } : null;
    })
    .filter((entry): entry is { route: string; count: number } => entry !== null);

  if (entries.length > 0) return entries;
  return [{ route: raw, count: fallbackCount }];
}

function normalizeCot(value: string | null | undefined) {
  const match = value?.match(/\bCOT\s*([12])\b/i);
  return match ? `COT ${match[1]}` : value?.trim() || null;
}

function sortCotSummaries(cots: Map<string, number>): CotSummary[] {
  return Array.from(cots, ([cot, count]) => ({ cot, count })).sort((a, b) =>
    a.cot.localeCompare(b.cot, "vi", { numeric: true }),
  );
}

function summarizeDeliveryTrend(rows: VolumeRow[]): DeliveryTrendPoint[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const reportDate = row.report_date?.slice(0, 10);
    if (!reportDate) continue;
    counts.set(reportDate, (counts.get(reportDate) ?? 0) + (row.total_orders ?? 1));
  }
  return Array.from(counts, ([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}

function countReportDays(rows: VolumeRow[]) {
  const dates = new Set(rows.map((row) => row.report_date?.slice(0, 10)).filter(Boolean));
  return Math.max(1, dates.size);
}

function averageVolumeSummary(summary: ReturnType<typeof summarizeVolume>, dayCount: number) {
  const average = (value: number) => Math.round(value / dayCount);
  const averageCots = (cots: CotSummary[]) => cots.map((cot) => ({ ...cot, count: average(cot.count) }));

  return {
    ...summary,
    total: average(summary.total),
    cots: averageCots(summary.cots),
    districts: summary.districts.map((district) => ({
      ...district,
      count: average(district.count),
      cots: averageCots(district.cots),
      wards: district.wards.map((ward) => ({
        ...ward,
        count: average(ward.count),
        cots: averageCots(ward.cots),
      })),
    })),
  };
}

function deliveryDateRange(date: string, viewMode: DeliveryViewMode) {
  const value = new Date(`${date}T00:00:00Z`);
  if (viewMode === "month") {
    const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
    const end = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));
    return { start: isoDate(start), end: isoDate(end) };
  }
  if (viewMode === "week") {
    const mondayOffset = (value.getUTCDay() + 6) % 7;
    const start = new Date(value);
    start.setUTCDate(start.getUTCDate() - mondayOffset);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { start: isoDate(start), end: isoDate(end) };
  }
  return { start: date, end: date };
}

function deliveryComparisonRange(date: string, viewMode: DeliveryViewMode) {
  const current = deliveryDateRange(date, viewMode);
  const currentStart = new Date(`${current.start}T00:00:00Z`);

  if (viewMode === "month") {
    const start = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), 0));
    return { start: isoDate(start), end: isoDate(end) };
  }

  const start = new Date(currentStart);
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(`${current.end}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 7);
  return { start: isoDate(start), end: isoDate(end) };
}

function deliveryComparisonLabel(viewMode: DeliveryViewMode) {
  if (viewMode === "month") return "so với tháng trước";
  if (viewMode === "week") return "so với tuần trước";
  return "so với cùng thứ tuần trước";
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function todayInVietnam() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
