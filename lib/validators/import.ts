import { z } from "zod";

export const riderImportItemSchema = z.object({
  kv: z.string().optional().nullable(),
  home_district: z.string().optional().nullable(),
  cot: z.string().optional().nullable(),
  rider_code: z.string().min(1),
  full_name: z.string().optional().nullable(),
  pickup_district: z.string().optional().nullable(),
  pickup_ward: z.string().optional().nullable(),
  point_name: z.string().optional().nullable(),
  delivery_district: z.string().optional().nullable(),
  delivery_ward: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  zone: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  hub: z.string().optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
  shift: z.string().optional().nullable(),
  raw_data: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const attendanceImportItemSchema = z.object({
  rider_code: z.string().min(1),
  work_date: z.coerce.date(),
  shift: z.string().optional().nullable(),
  status: z.string().min(1),
  note: z.string().optional().nullable(),
  zone: z.string().optional().nullable(),
  raw_data: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const importBodySchema = <T extends z.ZodType>(itemSchema: T) =>
  z.union([
    z.array(itemSchema),
    z.object({
      source: z.string().optional(),
      records: z.array(itemSchema),
    }),
  ]);

export type RiderImportItem = z.infer<typeof riderImportItemSchema>;
export type AttendanceImportItem = z.infer<typeof attendanceImportItemSchema>;
