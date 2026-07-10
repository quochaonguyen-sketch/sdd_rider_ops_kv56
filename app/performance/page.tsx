import { ProtectedPage } from "@/components/layout/protected-page";
import { DriverPerformanceView } from "@/components/performance/driver-performance-view";
import { getDriverPerformance, parsePerformanceFilters, type PerformanceResult } from "@/lib/performance/driver-performance";

export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ProtectedPage>
      <PerformanceContent searchParams={searchParams} />
    </ProtectedPage>
  );
}

async function PerformanceContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parsePerformanceFilters(await searchParams);
  let result: PerformanceResult | null = null;
  let error: string | null = null;

  try {
    result = await getDriverPerformance(filters);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Không thể tải dữ liệu performance";
  }

  return <DriverPerformanceView result={result} filters={filters} error={error} />;
}
