"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarDays, MapPin, PackageCheck, RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

type VolumeKind = "delivery" | "pickup";

type VolumeRow = {
  summary_id?: string;
  report_date?: string;
  district: string | null;
  ward?: string | null;
  old_ward: string | null;
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
  const title = kind === "delivery" ? "Delivery Volume" : "Pickup Volume";
  const accent = kind === "delivery" ? "#2563eb" : "#f97316";
  const [date, setDate] = useState(todayInVietnam());
  const [rows, setRows] = useState<VolumeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVolume = useCallback(async () => {
    const supabase = createClient();
    const loaded: VolumeRow[] = [];
    let offset = 0;

    setLoading(true);
    setError(null);

    while (true) {
      const query =
        kind === "delivery"
          ? supabase
              .from(table)
              .select("summary_id,report_date,old_ward,district,area,cot,total_orders")
              .eq("report_date", date)
              .order("district")
              .range(offset, offset + PAGE_SIZE - 1)
          : supabase
              .from(table)
              .select("summary_id,report_date,old_ward,district,area,cot,ma_tuyen,total_orders")
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
    setLoading(false);
  }, [date, kind, table]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadVolume();
  }, [loadVolume]);

  const refresh = useCallback(() => {
    void loadVolume();
  }, [loadVolume]);

  useSupabaseRealtime({ table, onChange: refresh });

  const summary = useMemo(() => summarizeVolume(rows), [rows]);
  const maxDistrict = Math.max(1, ...summary.districts.map((district) => district.count));

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>
            Volume theo khu vực
          </p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">Tổng lượng đơn theo ngày, quận/huyện và phường/xã.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative block min-w-[190px]">
            <CalendarDays
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="pl-9"
            />
          </label>
          <Button type="button" variant="secondary" onClick={refresh} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} />
            Làm mới
          </Button>
        </div>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        <VolumeTab href="/volume/delivery" active={kind === "delivery"}>
          Delivery
        </VolumeTab>
        <VolumeTab href="/volume/pickup" active={kind === "pickup"}>
          Pickup
        </VolumeTab>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          Không tải được dữ liệu: {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={<PackageCheck size={19} />} label="Tổng đơn" value={summary.total} loading={loading} />
        <MetricCard icon={<Building2 size={19} />} label="Quận/huyện" value={summary.districts.length} loading={loading} />
        <MetricCard icon={<MapPin size={19} />} label="Phường/xã" value={summary.wardCount} loading={loading} />
        <MetricCard
          icon={<PackageCheck size={19} />}
          label="Số COT"
          value={summary.groupCount}
          loading={loading}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {summary.cots.map((cot) => (
          <Card key={cot.cot}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Volume theo COT</p>
                <h2 className="mt-1 text-lg font-black text-slate-950">{cot.cot}</h2>
              </div>
              <strong className="text-2xl font-black" style={{ color: accent }}>
                {loading ? "-" : formatNumber(cot.count)}
              </strong>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-slate-950">Volume ngày {formatVietnameseDate(date)}</h2>
            <p className="mt-0.5 text-sm text-slate-500">Sắp xếp từ khu vực có nhiều đơn nhất.</p>
          </div>
          <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ backgroundColor: accent }}>
            {formatNumber(summary.total)} đơn
          </span>
        </div>

        <div className="mt-5 space-y-4">
          {!loading && summary.districts.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Chưa có dữ liệu {kind} trong ngày này.
            </p>
          ) : null}

          {summary.districts.map((district) => {
            const maxWard = Math.max(1, ...district.wards.map((ward) => ward.count));
            return (
              <section key={district.district} className="overflow-hidden rounded-2xl border border-slate-200">
                <div className="bg-slate-50 px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-black text-slate-950">{district.district}</h3>
                      <p className="text-xs font-semibold text-slate-500">{district.wards.length} phường/xã</p>
                      <CotBadges cots={district.cots} accent={accent} />
                    </div>
                    <strong className="shrink-0 text-lg text-slate-950">{formatNumber(district.count)} đơn</strong>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full"
                      style={{ backgroundColor: accent, width: `${(district.count / maxDistrict) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-3">
                  {district.wards.map((ward) => (
                    <div key={ward.ward} className="bg-white px-4 py-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-semibold text-slate-700">{ward.ward}</span>
                        <strong className="shrink-0 text-slate-950">{formatNumber(ward.count)}</strong>
                      </div>
                      <CotBadges cots={ward.cots} accent={accent} compact />
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full opacity-80"
                          style={{ backgroundColor: accent, width: `${(ward.count / maxWard) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function VolumeTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg px-5 py-2 text-sm font-bold transition",
        active ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900",
      )}
    >
      {children}
    </Link>
  );
}

function CotBadges({
  cots,
  accent,
  compact = false,
}: {
  cots: CotSummary[];
  accent: string;
  compact?: boolean;
}) {
  if (cots.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-1.5", compact ? "mt-2" : "mt-1.5")}>
      {cots.map((cot) => (
        <span
          key={cot.cot}
          className="rounded-full border px-2 py-0.5 text-[11px] font-bold"
          style={{ borderColor: `${accent}40`, color: accent, backgroundColor: `${accent}0d` }}
        >
          {cot.cot}: {formatNumber(cot.count)}
        </span>
      ))}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl">
        {loading ? "-" : formatNumber(value)}
      </p>
    </Card>
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
    const ward = row.ward?.trim() || row.old_ward?.trim() || "Chưa xác định phường/xã";
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

function normalizeCot(value: string | null | undefined) {
  const match = value?.match(/\bCOT\s*([12])\b/i);
  return match ? `COT ${match[1]}` : value?.trim() || null;
}

function sortCotSummaries(cots: Map<string, number>): CotSummary[] {
  return Array.from(cots, ([cot, count]) => ({ cot, count })).sort((a, b) =>
    a.cot.localeCompare(b.cot, "vi", { numeric: true }),
  );
}

function todayInVietnam() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatVietnameseDate(date: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}
