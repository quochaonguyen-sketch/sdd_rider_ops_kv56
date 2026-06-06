"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import type { AttendanceLog, Rider, Zone } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function AttendanceView() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [zoneId, setZoneId] = useState("all");
  const [riderCode, setRiderCode] = useState("all");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    setError(null);
    const [logResult, riderResult, zoneResult] = await Promise.all([
      supabase
        .from("attendance_logs")
        .select("*, riders(id,name,rider_code,zone_id,zones(id,name))")
        .order("work_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("riders").select("*, zones(id,name,area,hub)").order("name"),
      supabase.from("zones").select("*").order("name"),
    ]);

    const firstError = logResult.error ?? riderResult.error ?? zoneResult.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      setLogs((logResult.data ?? []) as AttendanceLog[]);
      setRiders((riderResult.data ?? []) as Rider[]);
      setZones((zoneResult.data ?? []) as Zone[]);
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

  useSupabaseRealtime({ table: "attendance_logs", onChange: refresh });
  useSupabaseRealtime({ table: "riders", onChange: refresh });

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      const matchesDate = !date || log.work_date === date;
      const matchesRider = riderCode === "all" || log.rider_code === riderCode;
      const matchesStatus = status === "all" || log.status?.toUpperCase() === status;
      const matchesZone = zoneId === "all" || log.riders?.zone_id === zoneId;
      return matchesDate && matchesRider && matchesStatus && matchesZone;
    });
  }, [date, logs, riderCode, status, zoneId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Attendance</h1>
          <p className="text-sm text-slate-500">Status history with date, zone, rider, and status filters.</p>
        </div>
        <Button type="button" variant="secondary" onClick={refresh} disabled={loading}>
          <RefreshCcw size={16} />
          Refresh
        </Button>
      </div>

      <Card className="grid gap-3 md:grid-cols-4">
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <Select value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
          <option value="all">All zones</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </Select>
        <Select value={riderCode} onChange={(event) => setRiderCode(event.target.value)}>
          <option value="all">All riders</option>
          {riders.map((rider) => (
            <option key={rider.id} value={rider.rider_code}>
              {rider.name ?? rider.rider_code}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="ON">ON</option>
          <option value="OFF">OFF</option>
        </Select>
      </Card>

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Zone</th>
                <th className="px-4 py-3">Shift</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 text-slate-700">{log.work_date}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-950">{log.riders?.name ?? log.rider_code}</p>
                    <p className="text-xs text-slate-500">{log.rider_code}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{log.riders?.zones?.name ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{log.shift ?? "-"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={log.status?.toUpperCase() === "ON" ? "green" : "red"}>{log.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{log.note ?? "-"}</td>
                </tr>
              ))}
              {filtered.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    No attendance logs match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
