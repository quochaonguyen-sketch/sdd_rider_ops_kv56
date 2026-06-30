"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { startOfWeek, format } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import type { ActivityLog, AttendanceLog, Rider, Zone } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type DashboardState = {
  riders: Rider[];
  zones: Zone[];
  attendance: AttendanceLog[];
  activity: ActivityLog[];
};

const emptyState: DashboardState = {
  riders: [],
  zones: [],
  attendance: [],
  activity: [],
};

export function DashboardView() {
  const [state, setState] = useState<DashboardState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    const supabase = createClient();
    setError(null);
    const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

    const [riders, zones, attendance, activity] = await Promise.all([
      supabase.from("riders").select("*, zones(id,name,area,hub)").order("updated_at", { ascending: false }),
      supabase.from("zones").select("*").order("name"),
      supabase
        .from("attendance_logs")
        .select("*, riders(id,full_name,rider_code,zone_id,zones(id,name))")
        .gte("work_date", weekStart)
        .order("created_at", { ascending: false }),
      supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(20),
    ]);

    const firstError = riders.error ?? zones.error ?? attendance.error ?? activity.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      setState({
        riders: (riders.data ?? []) as Rider[],
        zones: (zones.data ?? []) as Zone[],
        attendance: (attendance.data ?? []) as AttendanceLog[],
        activity: (activity.data ?? []) as ActivityLog[],
      });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDashboard();
  }, [loadDashboard]);

  const refresh = useCallback(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useSupabaseRealtime({ table: "riders", onChange: refresh });
  useSupabaseRealtime({ table: "attendance_logs", onChange: refresh });
  useSupabaseRealtime({ table: "zones", onChange: refresh });
  useSupabaseRealtime({ table: "activity_logs", onChange: refresh });

  const metrics = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    const todayLogs = state.attendance.filter((log) => log.work_date === today);
    const activeRiders = state.riders.filter((rider) => rider.status === "active");
    const activeCodes = new Set(activeRiders.map((rider) => rider.rider_code));
    const todayByRider = new Map<string, AttendanceLog>();

    for (const log of todayLogs) {
      if (activeCodes.has(log.rider_code) && !todayByRider.has(log.rider_code)) {
        todayByRider.set(log.rider_code, log);
      }
    }

    const onToday = Array.from(todayByRider.values()).filter((log) =>
      ["ON", "WORKING_REST_DAY", "NO_PICKUP"].includes(log.status?.toUpperCase() ?? ""),
    ).length;
    const offToday = Array.from(todayByRider.values()).filter((log) =>
      log.status?.toUpperCase().includes("OFF"),
    ).length;
    const weeklyOff = state.attendance.filter(
      (log) => activeCodes.has(log.rider_code) && log.status?.toUpperCase().includes("OFF"),
    );

    return {
      totalRiders: activeRiders.length,
      onToday,
      offToday,
      unassignedToday: Math.max(0, activeRiders.length - onToday - offToday),
      offApproved: weeklyOff.filter(
        (log) => log.status === "OFF_APPROVED" || /approved|xin phep|permission/i.test(log.note ?? ""),
      ).length,
      offUnexpected: weeklyOff.filter(
        (log) => log.status === "OFF_UNEXPECTED" || /unexpected|dot xuat|đột xuất/i.test(log.note ?? ""),
      ).length,
    };
  }, [state]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500">Tổng quan vận hành rider theo thời gian thực.</p>
        </div>
        <Button type="button" variant="secondary" className="shrink-0 px-3" onClick={refresh} disabled={loading}>
          <RefreshCcw size={16} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <MetricCard label="Rider active" value={metrics.totalRiders} loading={loading} tone="blue" />
        <MetricCard label="Đi làm hôm nay" value={metrics.onToday} loading={loading} tone="green" />
        <MetricCard label="Nghỉ hôm nay" value={metrics.offToday} loading={loading} tone="red" />
        <MetricCard label="Chưa xếp lịch" value={metrics.unassignedToday} loading={loading} tone="amber" />
        <MetricCard label="OFF phép tuần" value={metrics.offApproved} loading={loading} tone="slate" />
        <MetricCard
          label="OFF đột xuất tuần"
          value={metrics.offUnexpected}
          loading={loading}
          tone="red"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <h2 className="mb-4 text-base font-semibold text-slate-950">By zone</h2>
          <div className="space-y-3">
            {state.zones.length === 0 && !loading ? <Empty text="No zones found." /> : null}
            {state.zones.map((zone) => {
              const riders = state.riders.filter((rider) => rider.zone_id === zone.id);
              const active = riders.filter((rider) => rider.status === "active").length;
              const inactive = riders.filter((rider) => rider.status === "inactive").length;
              return (
                <div key={zone.id} className="rounded-md border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">{zone.name}</p>
                      <p className="text-sm text-slate-500">{zone.area ?? zone.hub ?? "No area assigned"}</p>
                    </div>
                    <Badge tone="blue">{riders.length} riders</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <span className="rounded-md bg-emerald-50 p-2 text-emerald-700">Active {active}</span>
                    <span className="rounded-md bg-red-50 p-2 text-red-700">Inactive {inactive}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-semibold text-slate-950">Recent updates</h2>
          <div className="space-y-3">
            {state.activity.length === 0 && !loading ? <Empty text="No recent updates yet." /> : null}
            {state.activity.map((log) => (
              <div key={log.id} className="border-b border-slate-100 pb-3 last:border-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{log.entity_type}</Badge>
                  <span className="text-xs text-slate-400">{new Date(log.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-sm font-medium text-slate-800">{log.message}</p>
                <p className="text-xs uppercase text-slate-400">{log.action}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  loading,
  tone,
  className,
}: {
  label: string;
  value: number;
  loading: boolean;
  tone: "blue" | "green" | "amber" | "red" | "slate";
  className?: string;
}) {
  const accents = {
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    slate: "bg-slate-500",
  };
  return (
    <Card className={className}>
      <span className={`block h-1 w-8 rounded-full ${accents[tone]}`} />
      <p className="mt-3 text-xs font-medium text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950 sm:text-3xl">{loading ? "-" : value}</p>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">{text}</p>;
}
