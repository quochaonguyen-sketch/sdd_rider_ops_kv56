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
  | "realtime_delivery_riders"
  | "pickup_realtime_riders"
  | "pickup_48h_summary"
  | "pickup_48h_realtime_riders"
  | "pickup_48h_summary_groups"
  | "pickup_48h_rider_groups"
  | "pickup_48h_no_api2"
  | "pickup_assigned_rider_pivot"
  | "pickup_inventory_assigned"
  | "pickup_inventory_onhold"
  | "pickup_inventory_created"
  | "lmhub_inventory_rows"
  | "lmhub_fetch_jobs";

type Options<T extends Record<string, unknown>> = {
  table: RealtimeTable;
  onChange: (payload: RealtimePostgresChangesPayload<T>) => void;
  debounceMs?: number;
};

export function useSupabaseRealtime<T extends Record<string, unknown>>({
  table,
  onChange,
  debounceMs = 500,
}: Options<T>) {
  const onChangeRef = useRef(onChange);
  // Mỗi hook 1 channel riêng: trước đây channel đặt tên theo bảng nên 2 hook
  // cùng bảng (VD pickup_48h_realtime_riders) dùng chung channel -> supabase-js
  // ném "cannot add postgres_changes callbacks after subscribe()".
  const channelNameRef = useRef<string | null>(null);
  if (channelNameRef.current === null) {
    channelNameRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `realtime:${table}:${crypto.randomUUID()}`
        : `realtime:${table}:${Math.random().toString(36).slice(2)}`;
  }

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let latestPayload: RealtimePostgresChangesPayload<T> | undefined;
    const channel = supabase
      .channel(channelNameRef.current ?? `realtime:${table}`)
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
