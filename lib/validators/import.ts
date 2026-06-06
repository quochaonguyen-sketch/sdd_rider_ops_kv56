import { z } from "zod";

export const riderImportItemSchema = z.object({
  rider_code: z.string().min(1),
  name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  zone: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  hub: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
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
