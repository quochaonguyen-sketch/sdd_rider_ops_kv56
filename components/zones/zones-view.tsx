"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import type { AttendanceLog, Rider, Zone } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ZonesView() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    setError(null);
    const today = format(new Date(), "yyyy-MM-dd");
    const [zoneResult, riderResult, attendanceResult] = await Promise.all([
      supabase.from("zones").select("*").order("name"),
      supabase.from("riders").select("*, zones(id,name,area,hub)").order("name"),
      supabase.from("attendance_logs").select("*, riders(id,name,rider_code,zone_id,zones(id,name))").eq("work_date", today),
    ]);

    const firstError = zoneResult.error ?? riderResult.error ?? attendanceResult.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      setZones((zoneResult.data ?? []) as Zone[]);
      setRiders((riderResult.data ?? []) as Rider[]);
      setAttendance((attendanceResult.data ?? []) as AttendanceLog[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  useSupabaseRealtime({ table: "zones", onChange: refresh });
  useSupabaseRealtime({ table: "riders", onChange: refresh });
  useSupabaseRealtime({ table: "attendance_logs", onChange: refresh });

  const summaries = useMemo(() => {
    return zones.map((zone) => {
      const zoneRiders = riders.filter((rider) => rider.zone_id === zone.id);
      const todayLogs = attendance.filter((log) => log.riders?.zone_id === zone.id);
      return {
        zone,
        total: zoneRiders.length,
        on: todayLogs.filter((log) => log.status?.toUpperCase() === "ON").length,
        off: todayLogs.filter((log) => log.status?.toUpperCase().includes("OFF")).length,
      };
    });
  }, [attendance, riders, zones]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Zones</h1>
          <p className="text-sm text-slate-500">Zone roster and ON/OFF counts for today.</p>
        </div>
        <Button type="button" variant="secondary" onClick={refresh} disabled={loading}>
          <RefreshCcw size={16} />
          Refresh
        </Button>
      </div>

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {summaries.map(({ zone, total, on, off }) => (
          <Card key={zone.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{zone.name}</h2>
                <p className="text-sm text-slate-500">{[zone.area, zone.hub].filter(Boolean).join(" / ") || "No area or hub"}</p>
              </div>
              <Badge tone="blue">{total} riders</Badge>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-md bg-emerald-50 p-3">
                <p className="text-sm text-emerald-700">ON today</p>
                <p className="text-2xl font-semibold text-emerald-800">{on}</p>
              </div>
              <div className="rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-700">OFF today</p>
                <p className="text-2xl font-semibold text-red-800">{off}</p>
              </div>
            </div>
          </Card>
        ))}
        {summaries.length === 0 && !loading ? (
          <Card className="md:col-span-2 xl:col-span-3">
            <p className="text-sm text-slate-500">No zones found.</p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
