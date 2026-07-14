"use client";

import { useCallback, useEffect, useState } from "react";
import { Map, RefreshCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import type { Rider } from "@/types";
import { Button } from "@/components/ui/button";
import { HcmZoneMap } from "@/components/zones/hcm-zone-map";

export function ZonesView() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const result = await createClient().from("riders").select("*").order("full_name");
    if (result.error) setError(result.error.message);
    else setRiders((result.data ?? []) as Rider[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useSupabaseRealtime({ table: "riders", onChange: load });

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
