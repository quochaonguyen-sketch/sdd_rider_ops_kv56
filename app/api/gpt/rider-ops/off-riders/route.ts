import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  auditGptRead,
  authorizeGptAction,
  gptJson,
  isCot1,
  normalizeSearch,
} from "@/lib/gpt-actions/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  });

const filtersSchema = z.object({
  date: dateSchema,
  district: z.string().trim().min(1).max(100),
  cot: z.string().trim().max(40).optional().default(""),
  off_status: z.enum(["OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(100),
});

type RiderRow = {
  id: string;
  rider_code: string;
  full_name: string | null;
  kv: string | null;
  cot: string | null;
  status: string | null;
  pickup_district: string | null;
  pickup_ward: string | null;
  delivery_district: string | null;
  delivery_ward: string | null;
  point_name: string | null;
};

type AttendanceRow = {
  rider_id: string | null;
  rider_code: string;
  status: string;
  shift: string | null;
  note: string | null;
};

const offStatuses = new Set(["OFF_WEEKLY", "OFF_APPROVED", "OFF_UNEXPECTED"]);

function matchesCot(value: string | null, requestedCot: string) {
  return !requestedCot || normalizeSearch(value).includes(requestedCot);
}

function operatingArea(rider: RiderRow) {
  if (isCot1(rider.cot)) {
    return {
      district: rider.pickup_district ?? rider.delivery_district,
      ward: rider.pickup_ward ?? rider.delivery_ward,
      source: rider.pickup_district || rider.pickup_ward ? "pickup" : "delivery_fallback",
    };
  }

  return {
    district: rider.delivery_district ?? rider.pickup_district,
    ward: rider.delivery_ward ?? rider.pickup_ward,
    source: rider.delivery_district || rider.delivery_ward ? "delivery" : "pickup_fallback",
  };
}

export async function GET(request: Request) {
  const auth = authorizeGptAction(request);
  if (!auth.ok) return auth.response;

  const searchParams = new URL(request.url).searchParams;
  const parsedFilters = filtersSchema.safeParse({
    date: searchParams.get("date") ?? undefined,
    district: searchParams.get("district") ?? undefined,
    cot: searchParams.get("cot") ?? undefined,
    off_status: searchParams.get("off_status") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsedFilters.success) {
    return gptJson(
      { success: false, error: "Invalid OFF rider filters", issues: parsedFilters.error.flatten() },
      400,
    );
  }

  try {
    const admin = createAdminClient();
    const filters = parsedFilters.data;
    const [riderResult, attendanceResult] = await Promise.all([
      admin
        .from("riders")
        .select(
          "id,rider_code,full_name,kv,cot,status,pickup_district,pickup_ward,delivery_district,delivery_ward,point_name",
        )
        .eq("status", "active")
        .order("rider_code")
        .limit(2000),
      admin
        .from("attendance_logs")
        .select("rider_id,rider_code,status,shift,note")
        .eq("work_date", filters.date),
    ]);

    const firstError = riderResult.error ?? attendanceResult.error;
    if (firstError) throw new Error(firstError.message);

    const district = normalizeSearch(filters.district);
    const cot = normalizeSearch(filters.cot);
    const riders = (riderResult.data ?? []) as RiderRow[];
    const ridersById = new Map(riders.map((rider) => [rider.id, rider]));
    const ridersByCode = new Map(riders.map((rider) => [rider.rider_code, rider]));
    const results = ((attendanceResult.data ?? []) as AttendanceRow[])
      .filter((attendance) =>
        filters.off_status ? attendance.status === filters.off_status : offStatuses.has(attendance.status),
      )
      .map((attendance) => {
        const rider =
          (attendance.rider_id ? ridersById.get(attendance.rider_id) : undefined) ??
          ridersByCode.get(attendance.rider_code);
        if (!rider || !matchesCot(rider.cot, cot)) return null;
        const area = operatingArea(rider);
        if (!normalizeSearch(area.district).includes(district)) return null;

        return {
          rider_id: rider.id,
          rider_code: rider.rider_code,
          full_name: rider.full_name,
          kv: rider.kv,
          cot: rider.cot,
          off_status: attendance.status,
          off_shift: attendance.shift,
          off_note: attendance.note,
          operating_district: area.district,
          operating_ward: area.ward,
          operating_area_source: area.source,
          pickup_district: rider.pickup_district,
          pickup_ward: rider.pickup_ward,
          delivery_district: rider.delivery_district,
          delivery_ward: rider.delivery_ward,
          point_name: rider.point_name,
        };
      })
      .filter((rider): rider is NonNullable<typeof rider> => rider !== null)
      .sort(
        (a, b) =>
          (a.operating_ward ?? "").localeCompare(b.operating_ward ?? "", "vi") ||
          a.rider_code.localeCompare(b.rider_code),
      );

    await auditGptRead(admin, "/api/gpt/rider-ops/off-riders", {
      work_date: filters.date,
      district: filters.district,
      cot: filters.cot || null,
      off_status: filters.off_status ?? null,
      matched: results.length,
    });

    return gptJson({
      success: true,
      work_date: filters.date,
      district: filters.district,
      cot: filters.cot || null,
      off_status: filters.off_status ?? "ALL_OFF_STATUSES",
      total: results.length,
      returned: Math.min(results.length, filters.limit),
      truncated: results.length > filters.limit,
      off_riders: results.slice(0, filters.limit),
      definitions: {
        included_off_statuses: Array.from(offStatuses),
        excluded_statuses: ["NO_PICKUP", "NO_DELIVERY", "ON"],
        operating_area:
          "COT 1 ưu tiên pickup district/ward; các COT khác ưu tiên delivery district/ward. Chỉ fallback khi khu vực ưu tiên bị thiếu.",
      },
    });
  } catch (error) {
    return gptJson(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unable to load OFF riders",
      },
      500,
    );
  }
}
