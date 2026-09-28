import { ProtectedPage } from "@/components/layout/protected-page";
import { LmhubInventoryView } from "@/components/lmhub-inventory/lmhub-inventory-view";
import { notFound } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";

export default async function LmhubInventoryPage() {
  const context = await getCurrentUserContext();

  if (context && !canAccessPickupManagement(context.profile.role)) notFound();

  return (
    <ProtectedPage>
      <LmhubInventoryView />
    </ProtectedPage>
  );
}
