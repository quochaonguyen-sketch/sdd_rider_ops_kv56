import { ProtectedPage } from "@/components/layout/protected-page";
import { PickupToolsView } from "@/components/pickup/pickup-tools-view";

export default function PickupManagementPage() {
  return (
    <ProtectedPage>
      <PickupToolsView />
    </ProtectedPage>
  );
}
