import { ProtectedPage } from "@/components/layout/protected-page";
import { RealtimeDashboardView } from "@/components/realtime-dashboard/realtime-dashboard-view";

export default function RealtimeDashboardPage() {
  return <ProtectedPage><RealtimeDashboardView /></ProtectedPage>;
}
