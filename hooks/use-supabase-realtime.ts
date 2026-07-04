"use client";

import { useEffect, useRef } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type RealtimeTable =
  | "riders"
  | "attendance_logs"
  | "zones"
  | "activity_logs"
  | "delivery_order"
  | "delivery_volume"
  | "pickup_volume"
  | "pickup_assignments"
  | "morning_delivery_assignments"
  | "morning_delivery_absence_notes"
  | "realtime_delivery_riders";

type Options<T extends Record<string, unknown>> = {
  table: RealtimeTable;
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void;
  /** Coalesce bulk database changes into one UI refresh. */
  debounceMs?: number;
};

export function useSupabaseRealtime<T extends Record<string, unknown>>({
  table,
  onChange,
  debounceMs = 500,
}: Options<T>) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latestPayload: RealtimePostgresChangesPayload<T> | undefined;
    const channel = supabase
      .channel(`realtime:${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload: RealtimePostgresChangesPayload<T>) => {
          const typedPayload = payload;
          if (debounceMs <= 0) {
            onChangeRef.current(typedPayload);
            return;
          }
          latestPayload = typedPayload;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            if (latestPayload) onChangeRef.current(latestPayload);
          }, debounceMs);
        },
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [debounceMs, table]);
}
