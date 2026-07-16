import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  auditGptRead,
  authorizeGptAction,
  gptJson,
  normalizeSearch,
} from "@/lib/gpt-actions/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filtersSchema = z.object({
  query: z.string().trim().max(100).optional().default(""),
  district: z.string().trim().max(100).optional().default(""),
  ward: z.string().trim().max(100).optional().default(""),
  cot: z.string().trim().max(40).optional().default(""),
  status: z.enum(["active", "inactive"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

type RiderRow = {
  id: string;
  rider_code: string;
  full_name: string | null;
  kv: string | null;
  cot: string | null;
  status: string | null;
  home_district: string | null;
  pickup_district: string | null;
  pickup_ward: string | null;
  delivery_district: string | null;
  delivery_ward: string | null;
  point_name: string | null;
  current_shift: string | null;
  updated_at: string;
};

function includesNormalized(value: string | null | undefined, search: string) {
  return !search || normalizeSearch(value).includes(search);
}

export async function GET(request: Request) {
  const auth = authorizeGptAction(request);
  if (!auth.ok) return auth.response;

  const searchParams = new URL(request.url).searchParams;
  const parsedFilters = filtersSchema.safeParse({
    query: searchParams.get("query") ?? undefined,
    district: searchParams.get("district") ?? undefined,
    ward: searchParams.get("ward") ?? undefined,
    cot: searchParams.get("cot") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsedFilters.success) {
    return gptJson(
      {
        success: false,
        error: "Invalid rider filters",
        issues: parsedFilters.error.flatten(),
      },
      400,
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("riders")
      .select(
        "id,rider_code,full_name,kv,cot,status,home_district,pickup_district,pickup_ward,delivery_district,delivery_ward,point_name,current_shift,updated_at",
      )
      .order("rider_code")
      .limit(2000);
    if (error) throw new Error(error.message);

    const filters = parsedFilters.data;
    const query = normalizeSearch(filters.query);
    const district = normalizeSearch(filters.district);
    const ward = normalizeSearch(filters.ward);
    const cot = normalizeSearch(filters.cot);
    const filtered = ((data ?? []) as RiderRow[]).filter((rider) => {
      if (filters.status && rider.status !== filters.status) return false;
      if (
        query &&
        ![rider.rider_code, rider.full_name, rider.point_name].some((value) =>
          includesNormalized(value, query),
        )
      ) {
        return false;
      }
      if (
        district &&
        ![rider.home_district, rider.pickup_district, rider.delivery_district].some((value) =>
          includesNormalized(value, district),
        )
      ) {
        return false;
      }
      if (
        ward &&
        ![rider.pickup_ward, rider.delivery_ward].some((value) =>
          includesNormalized(value, ward),
        )
      ) {
        return false;
      }
      return !cot || includesNormalized(rider.cot, cot);
    });

    await auditGptRead(admin, "/api/gpt/rider-ops/riders", {
      query: filters.query,
      district: filters.district,
      ward: filters.ward,
      cot: filters.cot,
      status: filters.status ?? null,
      limit: filters.limit,
      matched: filtered.length,
    });

    return gptJson({
      success: true,
      total: filtered.length,
      returned: Math.min(filtered.length, filters.limit),
      truncated: filtered.length > filters.limit,
      riders: filtered.slice(0, filters.limit),
      applied_filters: {
        query: filters.query || null,
        district: filters.district || null,
        ward: filters.ward || null,
        cot: filters.cot || null,
        status: filters.status ?? null,
        limit: filters.limit,
      },
    });
  } catch (error) {
    return gptJson(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unable to search riders",
      },
      500,
    );
  }
}

