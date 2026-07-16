"use client";

import { useCallback, useEffect, useState } from "react";
import { Map, RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { Button } from "@/components/ui/button";
import { HcmZoneMap } from "@/components/zones/hcm-zone-map";
import type { ZoneRider } from "@/components/zones/zone-map-types";

const ZONE_RIDER_COLUMNS = "id,rider_code,full_name,kv,home_district,cot,pickup_district,pickup_ward,delivery_district,delivery_ward,status";

export function ZonesView() {
  const [riders, setRiders] = useState<ZoneRider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const result = await createClient().from("riders").select(ZONE_RIDER_COLUMNS).order("full_name");
    if (result.error) setError(result.error.message);
    else setRiders((result.data ?? []) as ZoneRider[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const applyRealtimeChange = useCallback((payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
    const nextRider = payload.new as Partial<ZoneRider>;
    const previousRider = payload.old as Partial<ZoneRider>;
    if (payload.eventType === "DELETE" && previousRider.id) {
      setRiders((current) => current.filter((rider) => rider.id !== previousRider.id));
      return;
    }
    if ((payload.eventType === "INSERT" || payload.eventType === "UPDATE") && nextRider.id && nextRider.rider_code) {
      setRiders((current) => sortZoneRiders([
        nextRider as ZoneRider,
        ...current.filter((rider) => rider.id !== nextRider.id),
      ]));
      return;
    }
    void load();
  }, [load]);

  useSupabaseRealtime({ table: "riders", onChange: applyRealtimeChange, debounceMs: 250 });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-slate-950 text-white"><Map size={21} /></span>
          <div><h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Quản lý Zones</h1><p className="mt-0.5 text-sm text-slate-500">Bản đồ vận hành khu vực 5 & 6 SDD.</p></div>
        </div>
        <Button type="button" variant="secondary" className="shrink-0 px-3" onClick={() => void load()} disabled={loading}><RefreshCcw className={loading ? "animate-spin" : ""} size={16} /><span className="hidden sm:inline">Tải lại</span></Button>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <HcmZoneMap riders={riders} />
    </div>
  );
}

function sortZoneRiders(riders: ZoneRider[]) {
  return riders.sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? "", "vi") || a.rider_code.localeCompare(b.rider_code, "vi"));
}
