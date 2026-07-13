import { ProtectedPage } from "@/components/layout/protected-page";
import { PickupToolsView } from "@/components/pickup/pickup-tools-view";
import { notFound } from "next/navigation";
import { canAccessPickupManagement } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function PickupManagementPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await createAdminClient().from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };

  if (user && !canAccessPickupManagement(profile?.role)) notFound();

  return (
    <ProtectedPage>
      <PickupToolsView />
    </ProtectedPage>
  );
}
