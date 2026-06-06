import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";

export async function ProtectedPage({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <AppShell
      user={{
        email: user.email ?? "",
        fullName: profile?.full_name ?? null,
        role: profile?.role ?? "viewer",
      }}
    >
      {children}
    </AppShell>
  );
}
