import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizePermissions, type MemberPermissions } from "@/lib/auth/permissions";

export type CurrentUserContext = {
  user: {
    id: string;
    email: string;
  };
  profile: {
    full_name: string | null;
    role: string;
    permissions: MemberPermissions;
  };
};

export const getCurrentUserContext = cache(async (): Promise<CurrentUserContext | null> => {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (claimsError || !userId) {
    return null;
  }

  const email = typeof claimsData.claims.email === "string" ? claimsData.claims.email.trim().toLowerCase() : "";
  if (!email.endsWith("@spxexpress.com")) return null;

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("full_name, role, email")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Unable to load the signed-in user's profile: ${profileError.message}`);
  }

  const { data: byEmail } = profile
    ? { data: profile }
    : await admin.from("profiles").select("full_name, role, email").eq("email", email).maybeSingle();

  if (!byEmail) return null;

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const permissions = normalizePermissions(authUser.user?.app_metadata?.permissions, byEmail.role);

  return {
    user: {
      id: userId,
      email,
    },
    profile: {
      full_name: byEmail.full_name,
      role: byEmail.role,
      permissions,
    },
  };
});
