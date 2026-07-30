import type { AttendanceLog, Rider } from "@/types";
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
const notesCache = new Map<string, CacheEntry<CachedPersonalNote[]>>();
const attendanceCache = new Map<string, CacheEntry<AttendanceSchedulePayload>>();

const RIDERS_CACHE_KEY = "all";
const RIDERS_TTL_MS = 60_000;
const NOTES_TTL_MS = 45_000;
const ATTENDANCE_TTL_MS = 30_000;

export function invalidateRidersCache() {
  ridersCache.clear();
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
