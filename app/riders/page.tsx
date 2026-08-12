import { ProtectedPage } from "@/components/layout/protected-page";
import { RidersView } from "@/components/riders/riders-view";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canManageRiders } from "@/lib/auth/permissions";
import {
  DEFAULT_RIDER_REGISTRY_QUERY,
  emptyRiderRegistryData,
  getRiderRegistryData,
} from "@/lib/riders/rider-registry";

export default async function RidersPage() {
  const context = await getCurrentUserContext();
  let initialData = emptyRiderRegistryData();
  let initialError: string | null = null;

  if (context) {
    try {
      initialData = await getRiderRegistryData(DEFAULT_RIDER_REGISTRY_QUERY);
    } catch (error) {
      initialError = error instanceof Error ? error.message : "Không thể tải danh sách rider";
    }
  }

  return (
    <ProtectedPage>
      <RidersView
        canManageRiders={canManageRiders(context?.profile.role)}
        initialData={initialData}
        initialError={initialError}
      />
    </ProtectedPage>
  );
}
