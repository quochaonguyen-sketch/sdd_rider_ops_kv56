import { ProtectedPage } from "@/components/layout/protected-page";
import { MorningDeliveryView } from "@/components/morning-delivery/morning-delivery-view";

export default function MorningDeliveryPage() {
  return (
    <ProtectedPage>
      <MorningDeliveryView />
    </ProtectedPage>
  );
}
