import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/layout/app-shell";

export async function ProtectedPage({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await createAdminClient()
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error(`Unable to load the signed-in user's profile: ${profileError.message}`);
  }

  return (
    <AppShell
      user={{
        email: user.email ?? "",
        fullName: profile.full_name,
        role: profile.role,
      }}
    >
      {children}
    </AppShell>
  );
}
