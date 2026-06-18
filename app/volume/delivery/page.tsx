import { ProtectedPage } from "@/components/layout/protected-page";
import { VolumeView } from "@/components/volume/volume-view";

export default function DeliveryVolumePage() {
  return (
    <ProtectedPage>
      <VolumeView kind="delivery" />
    </ProtectedPage>
  );
}
