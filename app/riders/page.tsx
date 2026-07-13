import { ProtectedPage } from "@/components/layout/protected-page";
import { RidersView } from "@/components/riders/riders-view";
import { canManageRiders } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function RidersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await createAdminClient().from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };

  return (
    <ProtectedPage>
      <RidersView canManageRiders={canManageRiders(profile?.role)} />
    </ProtectedPage>
  );
}
