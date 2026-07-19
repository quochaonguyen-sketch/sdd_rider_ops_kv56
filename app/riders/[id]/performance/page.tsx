import { ProtectedPage } from "@/components/layout/protected-page";
import { RiderPerformanceView } from "@/components/riders/rider-performance-view";

export default async function RiderPerformancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedPage>
      <RiderPerformanceView riderId={id} />
    </ProtectedPage>
  );
}
