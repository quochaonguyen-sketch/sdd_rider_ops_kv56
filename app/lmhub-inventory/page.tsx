import { ProtectedPage } from "@/components/layout/protected-page";
import { PickupInventoryView } from "@/components/lmhub-inventory/pickup-inventory-view";
import { notFound } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement, canManageOperations } from "@/lib/auth/permissions";

export default async function LmhubInventoryPage() {
  const context = await getCurrentUserContext();

  if (context && !canAccessPickupManagement(context.profile.role, context.profile.permissions)) notFound();

  return (
    <ProtectedPage>
      <PickupInventoryView canQueue={canManageOperations(context?.profile.role)} />
    </ProtectedPage>
  );
}
