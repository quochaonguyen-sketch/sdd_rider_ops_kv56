import { ProtectedPage } from "@/components/layout/protected-page";
import { RidersView } from "@/components/riders/riders-view";

export default function RidersPage() {
  return (
    <ProtectedPage>
      <RidersView />
    </ProtectedPage>
  );
}
