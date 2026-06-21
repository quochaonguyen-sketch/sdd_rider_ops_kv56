import { ProtectedPage } from "@/components/layout/protected-page";
import { ZoneBuilderView } from "@/components/zone-builder/zone-builder-view";

export default function ZoneBuilderPage() {
  return (
    <ProtectedPage>
      <ZoneBuilderView />
    </ProtectedPage>
  );
}
