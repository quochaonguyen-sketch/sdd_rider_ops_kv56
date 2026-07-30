import { ProtectedPage } from "@/components/layout/protected-page";
import { RidersView } from "@/components/riders/riders-view";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canManageRiders } from "@/lib/auth/permissions";

export default async function RidersPage() {
  const context = await getCurrentUserContext();

  return (
    <ProtectedPage>
      <RidersView canManageRiders={canManageRiders(context?.profile.role)} />
    </ProtectedPage>
  );
}
