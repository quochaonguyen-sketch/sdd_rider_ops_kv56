"use client";

import { useAppLoading } from "@/components/layout/app-loading-store";

export function RouteReveal({ children }: { children: React.ReactNode }) {
  const loading = useAppLoading();

  return (
    <div
      className={`route-reveal-content ${loading ? "is-loading" : "is-ready"}`}
      aria-busy={loading}
    >
      {children}
    </div>
  );
}
