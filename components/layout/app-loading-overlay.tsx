"use client";

import { useAppLoading } from "@/components/layout/app-loading-store";
import { RiderLoaderVisual } from "@/components/ui/rider-page-loader";

export function AppLoadingOverlay() {
  const loading = useAppLoading();

  return (
    <div
      className={`app-navigation-scrim app-loading-overlay${loading ? " is-pending" : ""}`}
      aria-hidden={!loading}
      role={loading ? "status" : undefined}
      aria-live="polite"
      aria-label={loading ? "Đang tải dữ liệu vận hành" : undefined}
    >
      <RiderLoaderVisual compact />
    </div>
  );
}
