import { ProtectedPage } from "@/components/layout/protected-page";
import { PickupRealtimeView } from "@/components/pickup-realtime/pickup-realtime-view";
import { notFound } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";

export default async function PickupRealtimePage() {
  const context = await getCurrentUserContext();

  if (context && !canAccessPickupManagement(context.profile.role)) notFound();

  return (
    <ProtectedPage>
      <PickupRealtimeView />
    </ProtectedPage>
  );
}
