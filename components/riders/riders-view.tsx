"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import type { Rider, Zone } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function RidersView() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [query, setQuery] = useState("");
  const [zoneId, setZoneId] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Rider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    setError(null);
    const [riderResult, zoneResult] = await Promise.all([
      supabase.from("riders").select("*, zones(id,name,area,hub)").order("updated_at", { ascending: false }),
      supabase.from("zones").select("*").order("name"),
    ]);

    const firstError = riderResult.error ?? zoneResult.error;
    if (firstError) {
      setError(firstError.message);
    } else {
      const nextRiders = (riderResult.data ?? []) as Rider[];
      setRiders(nextRiders);
      setZones((zoneResult.data ?? []) as Zone[]);
      setSelected((current) => nextRiders.find((rider) => rider.id === current?.id) ?? current);
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

  useSupabaseRealtime({ table: "riders", onChange: refresh });
  useSupabaseRealtime({ table: "zones", onChange: refresh });

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return riders.filter((rider) => {
      const matchesQuery =
        !normalized ||
        [rider.name, rider.rider_code, rider.phone].some((value) => value?.toLowerCase().includes(normalized));
      const matchesZone = zoneId === "all" || rider.zone_id === zoneId;
      const matchesStatus = status === "all" || rider.status?.toUpperCase() === status;
      return matchesQuery && matchesZone && matchesStatus;
    });
  }, [query, riders, status, zoneId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">Riders</h1>
          <p className="text-sm text-slate-500">Search, filter, and inspect raw rider payloads.</p>
        </div>
        <Button type="button" variant="secondary" onClick={refresh} disabled={loading}>
          <RefreshCcw size={16} />
          Refresh
        </Button>
      </div>

      <Card className="grid gap-3 md:grid-cols-[1fr_220px_180px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} />
          <Input
            className="pl-10"
            placeholder="Search name, code, phone"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Select value={zoneId} onChange={(event) => setZoneId(event.target.value)}>
          <option value="all">All zones</option>
          {zones.map((zone) => (
            <option key={zone.id} value={zone.id}>
              {zone.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="ON">ON</option>
          <option value="OFF">OFF</option>
          <option value="INACTIVE">INACTIVE</option>
        </Select>
      </Card>

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Rider</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Zone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Shift</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rider) => (
                  <tr
                    key={rider.id}
                    className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                    onClick={() => setSelected(rider)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-950">{rider.name ?? "Unnamed rider"}</p>
                      <p className="text-xs text-slate-500">{rider.rider_code}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{rider.phone ?? "-"}</td>
                    <td className="px-4 py-3 text-slate-600">{rider.zones?.name ?? "-"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={rider.status?.toUpperCase() === "ON" ? "green" : "red"}>{rider.status ?? "-"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{rider.current_shift ?? "-"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                      No riders match the current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-slate-950">Rider detail</h2>
          {selected ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-lg font-semibold text-slate-950">{selected.name ?? selected.rider_code}</p>
                <p className="text-sm text-slate-500">{selected.rider_code}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="Phone" value={selected.phone ?? "-"} />
                <Info label="Zone" value={selected.zones?.name ?? "-"} />
                <Info label="Status" value={selected.status ?? "-"} />
                <Info label="Shift" value={selected.current_shift ?? "-"} />
              </div>
              <details className="rounded-md border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Raw data</summary>
                <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                  {JSON.stringify(selected.raw_data ?? {}, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <p className="mt-4 rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
              Select a rider to view details.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-medium text-slate-800">{value}</p>
    </div>
  );
}
