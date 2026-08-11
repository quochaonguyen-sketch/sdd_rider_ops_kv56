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

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  });
  function getVietnamDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(dateString: string, days: number) {
  const date = new Date(
    `${dateString}T00:00:00.000Z`,
  );

  date.setUTCDate(
    date.getUTCDate() + days,
  );

  return date
    .toISOString()
    .slice(0, 10);
}

function resolveDateMode(
  dateMode?: z.infer<typeof dateModeSchema>,
) {
  if (!dateMode) return undefined;

  const today = getVietnamDate();

  switch (dateMode) {
    case "TODAY":
      return today;

    case "TOMORROW":
      return addDays(today, 1);

    case "YESTERDAY":
      return addDays(today, -1);

    case "DAY_AFTER_TOMORROW":
      return addDays(today, 2);

    default:
      return undefined;
  }
}

const dateModeSchema = z.enum([
  "TODAY",
  "TOMORROW",
  "YESTERDAY",
  "DAY_AFTER_TOMORROW",
]);

const filtersSchema = z
  .object({
    date: dateSchema.optional(),

    date_from: dateSchema.optional(),
    date_to: dateSchema.optional(),

    date_mode: dateModeSchema.optional(),

    district: z.string().trim().min(1).max(100),

    cot: z.string().trim().max(40).optional().default(""),

    off_status: z
      .enum([
        "OFF_WEEKLY",
        "OFF_APPROVED",
        "OFF_UNEXPECTED",
      ])
      .optional(),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(100),
  })
  .superRefine((data, ctx) => {
    // Phải có ít nhất một kiểu ngày
    if (!data.date && !data.date_from && !data.date_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message:
          "Phải cung cấp date hoặc date_from/date_to",
      });
    }

    // Nếu có date thì không dùng date_from/date_to
    if (data.date && (data.date_from || data.date_to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["date"],
        message:
          "Không được dùng date cùng với date_from/date_to",
      });
    }

    // Nếu có cả from và to thì from <= to
    if (data.date_from && data.date_to) {
      if (data.date_from > data.date_to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["date_to"],
          message:
            "date_to phải lớn hơn hoặc bằng date_from",
        });
      }
    }
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
  work_date: string;
};

const offStatuses = new Set([
  "OFF_WEEKLY",
  "OFF_APPROVED",
  "OFF_UNEXPECTED",
]);

function matchesCot(
  value: string | null,
  requestedCot: string,
) {
  return (
    !requestedCot ||
    normalizeSearch(value).includes(requestedCot)
  );
}

function operatingArea(rider: RiderRow) {
  // COT1 ưu tiên Pickup
  if (isCot1(rider.cot)) {
    return {
      district:
        rider.pickup_district ??
        rider.delivery_district,

      ward:
        rider.pickup_ward ??
        rider.delivery_ward,

      source:
        rider.pickup_district ||
        rider.pickup_ward
          ? "pickup"
          : "delivery_fallback",
    };
  }

  // COT khác ưu tiên Delivery
  return {
    district:
      rider.delivery_district ??
      rider.pickup_district,

    ward:
      rider.delivery_ward ??
      rider.pickup_ward,

    source:
      rider.delivery_district ||
      rider.delivery_ward
        ? "delivery"
        : "pickup_fallback",
  };
}

export async function GET(request: Request) {
  const auth = authorizeGptAction(request);

  if (!auth.ok) {
    return auth.response;
  }

  const searchParams = new URL(request.url).searchParams;

  const parsedFilters = filtersSchema.safeParse({
  date:
    searchParams.get("date") ??
    undefined,

  date_from:
    searchParams.get("date_from") ??
    undefined,

  date_to:
    searchParams.get("date_to") ??
    undefined,

  date_mode:
    searchParams.get("date_mode") ??
    undefined,

  district:
    searchParams.get("district") ??
    undefined,

  cot:
    searchParams.get("cot") ??
    undefined,

  off_status:
    searchParams.get("off_status") ??
    undefined,

  limit:
    searchParams.get("limit") ??
    undefined,
});

  if (!parsedFilters.success) {
    return gptJson(
      {
        success: false,
        error: "Invalid OFF rider filters",
        issues: parsedFilters.error.flatten(),
      },
      400,
    );
  }

  try {
    const admin = createAdminClient();
    const filters = parsedFilters.data;
    const resolvedDate =filters.date ?? resolveDateMode(filters.date_mode);

    /*
     * ============================
     * 1. QUERY RIDERS
     * ============================
     */

    const riderQuery = admin
      .from("riders")
      .select(
        [
          "id",
          "rider_code",
          "full_name",
          "kv",
          "cot",
          "status",
          "pickup_district",
          "pickup_ward",
          "delivery_district",
          "delivery_ward",
          "point_name",
        ].join(","),
      )
      .eq("status", "active")
      .order("rider_code")
      .limit(2000);

    /*
     * ============================
     * 2. QUERY ATTENDANCE
     * ============================
     */

    let attendanceQuery = admin
      .from("attendance_logs")
      .select(
        [
          "rider_id",
          "rider_code",
          "status",
          "shift",
          "note",
          "work_date",
        ].join(","),
      );

    // Một ngày cụ thể
      if (resolvedDate) {
        attendanceQuery =
        attendanceQuery.eq(
          "work_date",
          resolvedDate,
    );
}
    // Từ ngày
    if (filters.date_from) {
      attendanceQuery =
        attendanceQuery.gte(
          "work_date",
          filters.date_from,
        );
    }

    // Đến ngày
    if (filters.date_to) {
      attendanceQuery =
        attendanceQuery.lte(
          "work_date",
          filters.date_to,
        );
    }

    /*
     * ============================
     * 3. QUERY SONG SONG
     * ============================
     */

    const [
      riderResult,
      attendanceResult,
    ] = await Promise.all([
      riderQuery,
      attendanceQuery,
    ]);

    const firstError =
      riderResult.error ??
      attendanceResult.error;

    if (firstError) {
      throw new Error(firstError.message);
    }

    /*
     * ============================
     * 4. NORMALIZE FILTER
     * ============================
     */

    const district = normalizeSearch(
      filters.district,
    );

    const cot = normalizeSearch(
      filters.cot,
    );

    const riders =
      (riderResult.data ?? []) as RiderRow[];

    const attendance =
      (attendanceResult.data ??
        []) as AttendanceRow[];

    /*
     * ============================
     * 5. CREATE RIDER MAP
     * ============================
     */

    const ridersById = new Map(
      riders.map((rider) => [
        rider.id,
        rider,
      ]),
    );

    const ridersByCode = new Map(
      riders.map((rider) => [
        rider.rider_code,
        rider,
      ]),
    );

    /*
     * ============================
     * 6. FILTER OFF RIDERS
     * ============================
     */

    const results = attendance

      // OFF status
      .filter((attendance) =>
        filters.off_status
          ? attendance.status ===
            filters.off_status
          : offStatuses.has(
              attendance.status,
            ),
      )

      // Match rider
      .map((attendance) => {
        const rider =
          (
            attendance.rider_id
              ? ridersById.get(
                  attendance.rider_id,
                )
              : undefined
          ) ??
          ridersByCode.get(
            attendance.rider_code,
          );

        if (
          !rider ||
          !matchesCot(
            rider.cot,
            cot,
          )
        ) {
          return null;
        }

        /*
         * Xác định khu vực hoạt động
         */
        const area =
          operatingArea(rider);

        /*
         * Filter district
         */
        if (
          !normalizeSearch(
            area.district,
          ).includes(district)
        ) {
          return null;
        }

        return {
          work_date:
            attendance.work_date,

          rider_id: rider.id,
          rider_code:
            rider.rider_code,

          full_name:
            rider.full_name,

          kv: rider.kv,
          cot: rider.cot,

          off_status:
            attendance.status,

          off_shift:
            attendance.shift,

          off_note:
            attendance.note,

          operating_district:
            area.district,

          operating_ward:
            area.ward,

          operating_area_source:
            area.source,

          pickup_district:
            rider.pickup_district,

          pickup_ward:
            rider.pickup_ward,

          delivery_district:
            rider.delivery_district,

          delivery_ward:
            rider.delivery_ward,

          point_name:
            rider.point_name,
        };
      })

      // Remove null
      .filter(
        (
          rider,
        ): rider is NonNullable<
          typeof rider
        > => rider !== null,
      )

      /*
       * Sort:
       * ngày → phường → rider code
       */
      .sort(
        (a, b) =>
          a.work_date.localeCompare(
            b.work_date,
          ) ||
          (
            a.operating_ward ?? ""
          ).localeCompare(
            b.operating_ward ?? "",
            "vi",
          ) ||
          a.rider_code.localeCompare(
            b.rider_code,
          ),
      );

    /*
     * ============================
     * 7. AUDIT
     * ============================
     */

    await auditGptRead(
      admin,
      "/api/gpt/rider-ops/off-riders",
      {
        work_date:
           resolvedDate ?? null,

        date_from:
          filters.date_from ?? null,

        date_to:
          filters.date_to ?? null,

        district:
          filters.district,

        cot:
          filters.cot || null,

        off_status:
          filters.off_status ?? null,

        matched:
          results.length,
      },
    );

    /*
     * ============================
     * 8. RESPONSE
     * ============================
     */

    const limitedResults =
      results.slice(
        0,
        filters.limit,
      );

    return gptJson({
      success: true,

      work_date:
        resolvedDate ?? null,

      date_mode:
      filters.date_mode ?? null,

      district:
        filters.district,

      cot:
        filters.cot || null,

      off_status:
        filters.off_status ??
        "ALL_OFF_STATUSES",

      total:
        results.length,

      returned:
        limitedResults.length,

      truncated:
        results.length >
        filters.limit,

      off_riders:
        limitedResults,

      definitions: {
        included_off_statuses:
          Array.from(offStatuses),

        excluded_statuses: [
          "NO_PICKUP",
          "NO_DELIVERY",
          "ON",
        ],

        operating_area:
          "COT1 ưu tiên pickup district/ward; các COT khác ưu tiên delivery district/ward. Chỉ fallback khi khu vực ưu tiên bị thiếu.",

        date_behavior:
          "Có thể tra cứu một ngày cụ thể bằng date hoặc một khoảng ngày bằng date_from/date_to. Không giới hạn chỉ ngày hiện tại.",
      },
    });
  } catch (error) {
    return gptJson(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load OFF riders",
      },
      500,
    );
  }
}