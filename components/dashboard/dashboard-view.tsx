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
        .select("*, riders(id,name,rider_code,zone_id,zones(id,name))")
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
    const weeklyOff = state.attendance.filter((log) => log.status?.toUpperCase().includes("OFF"));
    return {
      totalRiders: state.riders.length,
      onToday: todayLogs.filter((log) => log.status?.toUpperCase() === "ON").length,
      offWeek: weeklyOff.length,
      offApproved: weeklyOff.filter((log) => /approved|xin phep|permission/i.test(log.note ?? "")).length,
      offUnexpected: weeklyOff.filter((log) => !/approved|xin phep|permission/i.test(log.note ?? "")).length,
    };
  }, [state]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Dashboard</h1>
          <p className="text-sm text-slate-500">Realtime overview from Supabase changes.</p>
        </div>
        <Button type="button" variant="secondary" onClick={refresh} disabled={loading}>
          <RefreshCcw size={16} />
          Refresh
        </Button>
      </div>

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Total riders" value={metrics.totalRiders} loading={loading} />
        <MetricCard label="ON today" value={metrics.onToday} loading={loading} />
        <MetricCard label="OFF this week" value={metrics.offWeek} loading={loading} />
        <MetricCard label="Approved OFF" value={metrics.offApproved} loading={loading} />
        <MetricCard label="Unexpected OFF" value={metrics.offUnexpected} loading={loading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <h2 className="mb-4 text-base font-semibold text-slate-950">By zone</h2>
          <div className="space-y-3">
            {state.zones.length === 0 && !loading ? <Empty text="No zones found." /> : null}
            {state.zones.map((zone) => {
              const riders = state.riders.filter((rider) => rider.zone_id === zone.id);
              const on = riders.filter((rider) => rider.status?.toUpperCase() === "ON").length;
              const off = riders.filter((rider) => rider.status?.toUpperCase().includes("OFF")).length;
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
                    <span className="rounded-md bg-emerald-50 p-2 text-emerald-700">ON {on}</span>
                    <span className="rounded-md bg-red-50 p-2 text-red-700">OFF {off}</span>
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

function MetricCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <Card>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-950">{loading ? "-" : value}</p>
    </Card>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">{text}</p>;
}
