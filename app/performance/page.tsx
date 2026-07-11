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
  const params = await searchParams;
  const filters = parsePerformanceFilters(params);
  let result: PerformanceResult | null = null;
  let error: string | null = null;

  try {
    result = await getDriverPerformance(filters);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Không thể tải dữ liệu performance";
  }

  const loadedKey = [
    filters.date,
    filters.q,
    filters.sort,
    filters.dir,
    filters.page,
    filters.pageSize,
    Array.isArray(params._r) ? params._r[0] : params._r ?? "",
    result?.summary.groups ?? 0,
    result?.rows.length ?? 0,
  ].join("|");

  return <DriverPerformanceView result={result} filters={filters} error={error} loadedKey={loadedKey} />;
}
