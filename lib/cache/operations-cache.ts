import type { AttendanceLog, Rider, RiderRegistryItem } from "@/types";
import { createAdminClient } from "@/lib/supabase/admin";

type NoteStatus = "ACTIVE" | "ARCHIVED";

export type CachedPersonalNote = {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  status: NoteStatus;
  created_at: string;
  updated_at: string;
};

export type AttendanceSchedulePayload = {
  riders: Rider[];
  logs: AttendanceLog[];
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const ridersCache = new Map<string, CacheEntry<Rider[]>>();
const riderRegistryCache = new Map<string, CacheEntry<RiderRegistryItem[]>>();
const notesCache = new Map<string, CacheEntry<CachedPersonalNote[]>>();
const attendanceCache = new Map<string, CacheEntry<AttendanceSchedulePayload>>();

const RIDERS_CACHE_KEY = "all";
const RIDERS_TTL_MS = 60_000;
const NOTES_TTL_MS = 45_000;
const ATTENDANCE_TTL_MS = 30_000;

export function invalidateRidersCache() {
  ridersCache.clear();
  riderRegistryCache.clear();
  attendanceCache.clear();
}

export function invalidateNotesCache(userId: string) {
  notesCache.delete(userId);
}

export function invalidateAttendanceCache(month?: string) {
  if (month) attendanceCache.delete(month);
  else attendanceCache.clear();
}

export async function getCachedRiders() {
  const now = Date.now();
  const cached = ridersCache.get(RIDERS_CACHE_KEY);
  if (cached && cached.expiresAt > now) {
    return { data: cached.value, cache: cacheState(cached) };
  }

  const riders = await fetchAll<Rider>((from, to) =>
    createAdminClient()
      .from("riders")
      .select("*")
      .order("updated_at", { ascending: false })
      .range(from, to),
  );

  ridersCache.set(RIDERS_CACHE_KEY, { value: riders, expiresAt: now + RIDERS_TTL_MS });
  return { data: riders, cache: cacheState<Rider[]>(undefined) };
}

export async function getCachedRiderRegistry() {
  const now = Date.now();
  const cached = riderRegistryCache.get(RIDERS_CACHE_KEY);
  if (cached && cached.expiresAt > now) {
    return { data: cached.value, cache: cacheState(cached) };
  }

  const rows = await fetchAll<RiderRegistryRow>((from, to) =>
    createAdminClient()
      .from("riders")
      .select(RIDER_REGISTRY_SELECT)
      .order("updated_at", { ascending: false })
      .range(from, to)
      .overrideTypes<RiderRegistryRow[], { merge: false }>(),
  );
  const riders = rows.map(toRiderRegistryItem);

  riderRegistryCache.set(RIDERS_CACHE_KEY, { value: riders, expiresAt: now + RIDERS_TTL_MS });
  return { data: riders, cache: cacheState<RiderRegistryItem[]>(undefined) };
}

export async function getCachedPersonalNotes(
  userId: string,
  fetchNotes: () => Promise<{ data: CachedPersonalNote[] | null; error: { message: string } | null }>,
) {
  const now = Date.now();
  const cached = notesCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return { data: cached.value, error: null, cache: cacheState(cached) };
  }

  const { data, error } = await fetchNotes();
  if (error) return { data: null, error, cache: cacheState<CachedPersonalNote[]>(undefined) };

  const notes = data ?? [];
  notesCache.set(userId, { value: notes, expiresAt: now + NOTES_TTL_MS });
  return { data: notes, error: null, cache: cacheState<CachedPersonalNote[]>(undefined) };
}

export async function getCachedAttendanceSchedule(month: string, load: () => Promise<AttendanceSchedulePayload>) {
  const now = Date.now();
  const cached = attendanceCache.get(month);
  if (cached && cached.expiresAt > now) {
    return { data: cached.value, cache: cacheState(cached) };
  }

  const payload = await load();
  attendanceCache.set(month, { value: payload, expiresAt: now + ATTENDANCE_TTL_MS });
  return { data: payload, cache: cacheState<AttendanceSchedulePayload>(undefined) };
}

function cacheState<T>(entry: CacheEntry<T> | undefined) {
  return {
    hit: Boolean(entry && entry.expiresAt > Date.now()),
    expires_at: entry ? new Date(entry.expiresAt).toISOString() : null,
  };
}

async function fetchAll<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

const RIDER_REGISTRY_SELECT = [
  "id",
  "rider_code",
  "kv",
  "home_district",
  "cot",
  "full_name",
  "pickup_district",
  "pickup_ward",
  "point_name",
  "delivery_district",
  "delivery_ward",
  "avatar_url",
  "zone_id",
  "status",
  "current_shift",
  "created_at",
  "updated_at",
  "phone:raw_data->>phone",
  "phone_number:raw_data->>phone_number",
  "mobile:raw_data->>mobile",
].join(",");

type RiderRegistryRow = Omit<RiderRegistryItem, "phone" | "raw_data"> & {
  phone: unknown;
  phone_number: unknown;
  mobile: unknown;
};

function toRiderRegistryItem(row: RiderRegistryRow): RiderRegistryItem {
  return {
    id: row.id,
    rider_code: row.rider_code,
    kv: row.kv,
    home_district: row.home_district,
    cot: row.cot,
    full_name: row.full_name,
    pickup_district: row.pickup_district,
    pickup_ward: row.pickup_ward,
    point_name: row.point_name,
    delivery_district: row.delivery_district,
    delivery_ward: row.delivery_ward,
    avatar_url: row.avatar_url,
    zone_id: row.zone_id,
    status: row.status,
    current_shift: row.current_shift,
    created_at: row.created_at,
    updated_at: row.updated_at,
    phone: firstText(row.phone, row.phone_number, row.mobile),
    raw_data: null,
  };
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}
