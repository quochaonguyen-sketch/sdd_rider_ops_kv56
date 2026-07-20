export type Role = "admin" | "leader" | "viewer" | "member";

export type Zone = {
  id: string;
  name: string;
  area: string | null;
  hub: string | null;
  raw_data?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type Rider = {
  id: string;
  rider_code: string;
  kv: string | null;
  home_district: string | null;
  cot: string | null;
  full_name: string | null;
  pickup_district: string | null;
  pickup_ward: string | null;
  point_name: string | null;
  delivery_district: string | null;
  delivery_ward: string | null;
  avatar_url: string | null;
  zone_id: string | null;
  status: string | null;
  current_shift: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  zones?: Pick<Zone, "id" | "name" | "area" | "hub"> | null;
};

export type DriverPerformanceDaily = {
  performance_id: string;
  report_date: string;
  driver_id: string;
  driver_name: string | null;
  contract_type_name: string | null;
  delivery_assigned: number | null;
  delivery_delivered: number | null;
  pickup_assigned: number | null;
  pickup_picked: number | null;
  delivery_success_rate: number | null;
  pickup_success_rate: number | null;
  fetched_at: string;
};

export type AttendanceLog = {
  id: string;
  rider_id: string | null;
  rider_code: string;
  work_date: string;
  shift: string | null;
  status: string;
  note: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  riders?: Pick<Rider, "id" | "full_name" | "rider_code" | "zone_id"> & {
    zones?: Pick<Zone, "id" | "name"> | null;
  };
};

export type RiderOffRequest = {
  id: string;
  batch_id: string;
  rider_id: string;
  rider_code: string;
  off_date: string;
  request_type: "WEEKLY" | "PLANNED" | "EMERGENCY";
  shift: "FULL_DAY" | "MORNING" | "AFTERNOON";
  reason: string | null;
  evidence_path: string | null;
  evidence_name: string | null;
  evidence_type: string | null;
  evidence_url?: string | null;
  requester_email: string | null;
  email_notification_status: "PENDING" | "SENT" | "FAILED" | "NOT_CONFIGURED";
  email_notification_error: string | null;
  email_notified_at: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  rider?: Pick<Rider, "full_name" | "kv" | "cot" | "delivery_district" | "current_shift">;
};

export type DeliveryVolume = {
  id: string;
  shipment_id: string;
  create_time: string;
  received_time: string;
  zone_id_raw: string | null;
  zone_id_matched: string | null;
  old_ward: string | null;
  ward: string | null;
  district: string | null;
  area: string | null;
  order_type: string | null;
  cot_group: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ActivityLog = {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  message: string;
  raw_data: Record<string, unknown> | null;
  created_at: string;
};

export type RiderViolationRecord = {
  id: string;
  rider_id: string | null;
  rider_code: string;
  rider_name: string | null;
  work_date: string;
  violation_type: "LATE_CHECKIN" | "NO_SHOW" | "SLA_BREACH" | "SAFETY" | "POLICY" | "OFF_UNEXPECTED" | "WORKING_REST_DAY";
  severity: "LOW" | "MEDIUM" | "HIGH";
  zone: string | null;
  note: string | null;
  status: "OPEN" | "RESOLVED";
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  source: string;
  dedupe_key: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};
