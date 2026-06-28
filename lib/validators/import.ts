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

export const deliveryVolumeImportItemSchema = z.object({
  shipment_id: z.string().min(1),
  create_time: z.coerce.date(),
  received_time: z.coerce.date(),
  zone_id_raw: z.string().optional().nullable(),
  zone_id_matched: z.string().optional().nullable(),
  old_ward: z.string().optional().nullable(),
  ward: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  order_type: z.string().optional().nullable(),
  cot_group: z.string().optional().nullable(),
  raw_data: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const pickupVolumeImportItemSchema = z.object({
  summary_id: z.string().min(1),
  report_date: z.coerce.date(),
  new_ward: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  cot: z.string().optional().nullable(),
  ma_tuyen: z.string().optional().nullable(),
  total_orders: z.coerce.number().int().nonnegative().default(0),
  raw_data: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const pickupAssignmentImportItemSchema = z.object({
  assignment_key: z.string().optional().nullable(),
  assigned_at: z.coerce.date().optional().nullable(),
  cot: z.string().optional().nullable(),
  route_name: z.string().optional().nullable(),
  mapped_pickup_point_group: z.string().optional().nullable(),
  pickup_point_id: z.string().optional().nullable(),
  pup_code: z.string().optional().nullable(),
  shop_name: z.string().optional().nullable(),
  shop_address: z.string().optional().nullable(),
  ward: z.string().optional().nullable(),
  district: z.string().optional().nullable(),
  pickup_status: z.coerce.number().int().optional().nullable(),
  pickup_retry_assign_type: z.coerce.number().int().optional().nullable(),
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
export type DeliveryVolumeImportItem = z.infer<typeof deliveryVolumeImportItemSchema>;
export type PickupVolumeImportItem = z.infer<typeof pickupVolumeImportItemSchema>;
export type PickupAssignmentImportItem = z.infer<typeof pickupAssignmentImportItemSchema>;
