import { notFound, redirect } from "next/navigation";
import { canAccessPickupManagement } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function PickupRoutesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await createAdminClient().from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };

  if (user && !canAccessPickupManagement(profile?.role)) notFound();
  redirect("/pickup-management");
}
