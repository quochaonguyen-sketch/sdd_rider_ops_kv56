import { ProtectedPage } from "@/components/layout/protected-page";
import { ZonesView } from "@/components/zones/zones-view";

export default function ZonesPage() {
  return (
    <ProtectedPage>
      <ZonesView />
    </ProtectedPage>
  );
}
