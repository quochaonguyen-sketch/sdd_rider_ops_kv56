import { ProtectedPage } from "@/components/layout/protected-page";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export default function DashboardPage() {
  return (
    <ProtectedPage>
      <DashboardView />
    </ProtectedPage>
  );
}
