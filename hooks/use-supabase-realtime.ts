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
  | "pickup_assignments";

type Options<T extends Record<string, unknown>> = {
  table: RealtimeTable;
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void;
};

export function useSupabaseRealtime<T extends Record<string, unknown>>({
  table,
  onChange,
}: Options<T>) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`realtime:${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        (payload) => onChangeRef.current(payload as RealtimePostgresChangesPayload<T>),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table]);
}
