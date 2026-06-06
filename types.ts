export type Role = "admin" | "leader" | "viewer";

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
  name: string | null;
  phone: string | null;
  zone_id: string | null;
  status: string | null;
  current_shift: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  zones?: Pick<Zone, "id" | "name" | "area" | "hub"> | null;
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
  riders?: Pick<Rider, "id" | "name" | "rider_code" | "zone_id"> & {
    zones?: Pick<Zone, "id" | "name"> | null;
  };
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
