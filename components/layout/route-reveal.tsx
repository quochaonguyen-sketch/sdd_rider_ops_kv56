"use client";

import { useEffect, useState } from "react";
import { RiderPageLoader } from "@/components/ui/rider-page-loader";

const LOADER_DURATION_MS = 2000;

export function RouteReveal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), LOADER_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="relative">
      <div className={ready ? "route-reveal-content" : "route-content-loading"}>{children}</div>
      {!ready ? (
        <div className="absolute inset-0 z-10 bg-slate-50/25 backdrop-blur-[1px]">
          <RiderPageLoader />
        </div>
      ) : null}
    </div>
  );
}
