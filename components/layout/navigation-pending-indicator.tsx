"use client";

import { useEffect, useId } from "react";
import { useLinkStatus } from "next/link";
import { setAppLoading } from "@/components/layout/app-loading-store";

/**
 * Must be rendered inside a Next.js <Link>.
 * The state starts with the click and ends when the destination route is ready.
 */
export function NavigationPendingIndicator() {
  const { pending } = useLinkStatus();
  const instanceId = useId();
  const loadingKey = `route:${instanceId}`;

  useEffect(() => {
    setAppLoading(loadingKey, pending, pending ? 0 : 900);
    return () => setAppLoading(loadingKey, false, 900);
  }, [loadingKey, pending]);

  return (
    <span className={`app-navigation-pending${pending ? " is-pending" : ""}`}>
      <span className="app-navigation-progress" aria-hidden="true" />
      <span className="sr-only" role="status" aria-live="polite">
        {pending ? "Đang chuyển trang và tải dữ liệu" : ""}
      </span>
    </span>
  );
}
