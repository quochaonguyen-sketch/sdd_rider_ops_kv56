import { ProtectedPage } from "@/components/layout/protected-page";
import { VolumeView } from "@/components/volume/volume-view";

export default function PickupVolumePage() {
  return (
    <ProtectedPage>
      <VolumeView kind="pickup" />
    </ProtectedPage>
  );
}
