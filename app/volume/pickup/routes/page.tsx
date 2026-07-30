import { notFound, redirect } from "next/navigation";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { canAccessPickupManagement } from "@/lib/auth/permissions";

export default async function PickupRoutesPage() {
  const context = await getCurrentUserContext();

  if (context && !canAccessPickupManagement(context.profile.role)) notFound();
  redirect("/pickup-management");
}
