import { ProtectedPage } from "@/components/layout/protected-page";
import { PickupManagementView } from "@/components/pickup/pickup-management-view";

export default function PickupManagementPage() {
  return (
    <ProtectedPage>
      <PickupManagementView />
    </ProtectedPage>
  );
}
