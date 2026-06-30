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
import { HcmZoneMap } from "@/components/zones/hcm-zone-map";

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
      supabase.from("riders").select("*, zones(id,name,area,hub)").order("full_name"),
      supabase.from("attendance_logs").select("*, riders(id,full_name,rider_code,zone_id,zones(id,name))").eq("work_date", today),
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
        on: todayLogs.filter((log) =>
          ["ON", "WORKING_REST_DAY", "NO_PICKUP"].includes(log.status?.toUpperCase() ?? ""),
        ).length,
        off: todayLogs.filter((log) => log.status?.toUpperCase().includes("OFF")).length,
      };
    });
  }, [attendance, riders, zones]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Zones</h1>
          <p className="mt-0.5 text-sm text-slate-500">Quân số và trạng thái theo khu vực.</p>
        </div>
        <Button type="button" variant="secondary" className="shrink-0 px-3" onClick={refresh} disabled={loading}>
          <RefreshCcw size={16} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <HcmZoneMap riders={riders} />

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
