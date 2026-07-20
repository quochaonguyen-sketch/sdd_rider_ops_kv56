import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canManageOperations } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const querySchema = z.object({
  from: dateSchema,
  to: dateSchema,
  status: z.enum(["ALL", "PENDING", "APPROVED", "REJECTED"]).default("ALL"),
});

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    status: url.searchParams.get("status") ?? "ALL",
  });
  if (!parsed.success || parsed.data.from > parsed.data.to) {
    return NextResponse.json({ success: false, error: "Khoảng ngày không hợp lệ." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  let query = admin
    .from("rider_off_requests")
    .select("*")
    .gte("off_date", parsed.data.from)
    .lte("off_date", parsed.data.to)
    .order("off_date")
    .order("created_at");
  if (parsed.data.status !== "ALL") query = query.eq("status", parsed.data.status);

  const { data: requests, error } = await query;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const riderIds = Array.from(new Set((requests ?? []).map((item) => item.rider_id)));
  const { data: riders, error: riderError } = riderIds.length
    ? await admin.from("riders").select("id,full_name,kv,cot,delivery_district,current_shift").in("id", riderIds)
    : { data: [], error: null };
  if (riderError) return NextResponse.json({ success: false, error: riderError.message }, { status: 500 });

  const riderById = new Map((riders ?? []).map((rider) => [rider.id, rider]));
  const evidencePaths = Array.from(new Set((requests ?? []).map((item) => item.evidence_path).filter((path): path is string => Boolean(path))));
  const signedEvidence = new Map<string, string>();
  await Promise.all(evidencePaths.map(async (path) => {
    const { data } = await admin.storage.from("off-request-evidence").createSignedUrl(path, 60 * 60);
    if (data?.signedUrl) signedEvidence.set(path, data.signedUrl);
  }));
  return NextResponse.json({
    success: true,
    can_edit: canManageOperations(profile?.role),
    requests: (requests ?? []).map((item) => ({
      ...item,
      evidence_url: item.evidence_path ? signedEvidence.get(item.evidence_path) ?? null : null,
      rider: riderById.get(item.rider_id) ?? null,
    })),
  });
}
