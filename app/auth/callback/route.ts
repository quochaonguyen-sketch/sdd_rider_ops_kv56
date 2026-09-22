import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_DOMAIN = "@spxexpress.com";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (!code) return NextResponse.redirect(new URL("/login?error=oauth", origin));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const email = data.user?.email?.trim().toLowerCase() ?? "";

  if (error || !data.user) return NextResponse.redirect(new URL("/login?error=oauth", origin));

  if (!email.endsWith(ALLOWED_DOMAIN)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=domain", origin));
  }

  const fullName = typeof data.user.user_metadata.full_name === "string" ? data.user.user_metadata.full_name : null;
  const { error: profileError } = await createAdminClient()
    .from("profiles")
    .upsert({ id: data.user.id, email, full_name: fullName, role: "viewer" }, { onConflict: "id", ignoreDuplicates: true });

  if (profileError) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=oauth", origin));
  }

  return NextResponse.redirect(new URL("/dashboard", origin));
}
