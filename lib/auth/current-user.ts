import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CurrentUserContext = {
  user: {
    id: string;
    email: string;
  };
  profile: {
    full_name: string | null;
    role: string;
  };
};

/**
 * Resolves the signed-in operator once per Server Component render.
 *
 * getClaims verifies the session JWT and avoids an unnecessary Auth server
 * round-trip when the Supabase project uses asymmetric signing keys.
 */
export const getCurrentUserContext = cache(async (): Promise<CurrentUserContext | null> => {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub;

  if (claimsError || !userId) {
    return null;
  }

  const { data: profile, error: profileError } = await createAdminClient()
    .from("profiles")
    .select("full_name, role")
    .eq("id", userId)
    .single();

  if (profileError) {
    throw new Error(`Unable to load the signed-in user's profile: ${profileError.message}`);
  }

  return {
    user: {
      id: userId,
      email: typeof claimsData.claims.email === "string" ? claimsData.claims.email : "",
    },
    profile,
  };
});
