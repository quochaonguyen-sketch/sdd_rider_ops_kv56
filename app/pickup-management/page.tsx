import { ProtectedPage } from "@/components/layout/protected-page";
import { PickupToolsView } from "@/components/pickup/pickup-tools-view";
import { notFound } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";

export default async function PickupManagementPage() {
  const context = await getCurrentUserContext();

  if (context && !canAccessPickupManagement(context.profile.role)) notFound();

  return (
    <ProtectedPage>
      <PickupToolsView />
    </ProtectedPage>
  );
}
