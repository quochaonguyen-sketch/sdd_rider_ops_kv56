import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildConvexHull, centroidOf, normalizePickupLabel, type PickupGovapZonePayload, type PickupZonePoint, type PickupZoneRoute } from "@/lib/pickup-zones/govap";

export const runtime = "nodejs";

type PickupAssignmentRow = {
  route_name: string | null;
  shop_name: string | null;
  shop_address: string | null;
  pickup_point_id: string | null;
  ward: string | null;
  district: string | null;
};

type GeocodeRecord = {
  lat: number;
  lng: number;
  display_name: string;
  updated_at: string;
};

const CACHE_PATH = path.join(process.cwd(), ".next", "cache", "pickup-govap-geocodes-v2.json");
const MAX_SAMPLES_PER_ROUTE = 3;
const THROTTLE_MS = 1100;
const geocodeCache = new Map<string, GeocodeRecord>();

export async function GET(request: Request) {
  const client = await createClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pickup_assignments")
    .select("route_name,shop_name,shop_address,pickup_point_id,ward,district")
    .ilike("route_name", "GV_%")
    .order("route_name");
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  const rows = (data ?? []) as PickupAssignmentRow[];
  const routeRows = new Map<string, PickupAssignmentRow[]>();
  for (const row of rows) {
    const route = row.route_name?.trim();
    if (!route) continue;
    const list = routeRows.get(route) ?? [];
    list.push(row);
    routeRows.set(route, list);
  }

  await loadGeocodeCache();

  const selectedSamples = new Map<string, PickupAssignmentRow[]>();
  for (const [route, routeList] of routeRows.entries()) {
    selectedSamples.set(route, chooseRepresentativeRows(routeList));
  }

  const sampleAddresses = dedupeSamples(
    Array.from(selectedSamples.values()).flatMap((sampleRows) =>
      sampleRows.map((row) => ({
        key: addressKey(row),
        address: addressValue(row),
      })),
    ),
  );

  const geocodeFailures: Array<{ key: string; error: string }> = [];
  for (const sample of sampleAddresses) {
    const key = sample.key;
    if (geocodeCache.has(key)) continue;
    try {
      const geocoded = await geocodeAddress(sample.address);
      geocodeCache.set(key, geocoded);
      await persistGeocodeCache();
      await delay(THROTTLE_MS);
    } catch (error) {
      geocodeFailures.push({ key, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const routes: PickupZoneRoute[] = Array.from(routeRows.entries()).map(([route, routeList]) => {
    const samples = selectedSamples.get(route) ?? [];
    const points = samples
      .map((row) => {
        const key = addressKey(row);
        const geocoded = geocodeCache.get(key);
        if (!geocoded) return null;
        return {
          label: row.shop_name?.trim() || row.pickup_point_id?.trim() || "Shop",
          address: addressValue(row),
          lat: geocoded.lat,
          lng: geocoded.lng,
          count: 1,
        };
      })
      .filter((point): point is { label: string; address: string; lat: number; lng: number; count: number } => Boolean(point));

    const hull = buildConvexHull(points.map((point) => [point.lng, point.lat] as [number, number]));
    const centroid = centroidOf(points.map((point) => [point.lng, point.lat] as [number, number]));
    return {
    route,
    total: routeList.length,
    pointCount: points.length,
    points,
    polygon: hull,
    centroid,
    };
  }).sort((a, b) => b.total - a.total || a.route.localeCompare(b.route, "vi", { numeric: true }));

  const points: PickupZonePoint[] = Array.from(geocodeCache.entries()).map(([key, value]) => ({
    label: key,
    address: value.display_name,
    lat: value.lat,
    lng: value.lng,
    count: 1,
  }));

  const payload: PickupGovapZonePayload = {
    success: true,
    work_date: new Date().toISOString().slice(0, 10),
    total_rows: rows.length,
    unique_addresses: sampleAddresses.length,
    routes,
    points,
  };

  return NextResponse.json({
    ...payload,
    warnings: geocodeFailures.length ? geocodeFailures : undefined,
  });
}

function chooseRepresentativeRows(rows: PickupAssignmentRow[]) {
  const byWard = new Map<string, PickupAssignmentRow[]>();
  for (const row of rows) {
    const ward = normalizePickupLabel(row.district || row.ward || "");
    const bucket = byWard.get(ward) ?? [];
    bucket.push(row);
    byWard.set(ward, bucket);
  }

  const sample: PickupAssignmentRow[] = [];
  for (const bucket of byWard.values()) {
    const ordered = bucket
      .slice()
      .sort((a, b) => addressKey(a).localeCompare(addressKey(b), "vi"));
    const first = ordered[0];
    if (first) sample.push(first);
    if (sample.length >= MAX_SAMPLES_PER_ROUTE) break;
  }

  if (sample.length < MAX_SAMPLES_PER_ROUTE) {
    const remaining = rows
      .slice()
      .sort((a, b) => addressKey(a).localeCompare(addressKey(b), "vi"));
    for (const row of remaining) {
      if (sample.some((item) => addressKey(item) === addressKey(row))) continue;
      sample.push(row);
      if (sample.length >= MAX_SAMPLES_PER_ROUTE) break;
    }
  }

  return sample.slice(0, MAX_SAMPLES_PER_ROUTE);
}

function addressKey(row: PickupAssignmentRow) {
  return normalizePickupLabel(addressValue(row));
}

function addressValue(row: PickupAssignmentRow) {
  return row.shop_address?.trim() || row.shop_name?.trim() || row.pickup_point_id?.trim() || "";
}

function dedupeSamples(samples: Array<{ key: string; address: string }>) {
  const seen = new Set<string>();
  const deduped: Array<{ key: string; address: string }> = [];
  for (const sample of samples) {
    if (!sample.key || seen.has(sample.key)) continue;
    seen.add(sample.key);
    deduped.push(sample);
  }
  return deduped;
}

async function loadGeocodeCache() {
  if (geocodeCache.size > 0) return;
  try {
    const text = await readFile(CACHE_PATH, "utf8");
    const parsed = JSON.parse(text) as Record<string, GeocodeRecord>;
    for (const [key, value] of Object.entries(parsed)) geocodeCache.set(key, value);
  } catch {
    // cache absent on first run
  }
}

async function persistGeocodeCache() {
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const payload = Object.fromEntries(geocodeCache.entries());
  await writeFile(CACHE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function geocodeAddress(addressKeyValue: string): Promise<GeocodeRecord> {
  const baseUrl = process.env.NOMINATIM_BASE_URL?.trim() || "https://nominatim.openstreetmap.org";
  const queries = [
    `${addressKeyValue}, Gò Vấp, Hồ Chí Minh, Việt Nam`,
    `${addressKeyValue}, Hồ Chí Minh, Việt Nam`,
    addressKeyValue,
  ];

  for (const query of queries) {
    const searchUrl = new URL("/search", baseUrl);
    searchUrl.search = new URLSearchParams({
      q: query,
      format: "jsonv2",
      addressdetails: "1",
      countrycodes: "vn",
      limit: "1",
    }).toString();
    const candidate = await fetchFirstGeocode(searchUrl);
    if (!candidate) continue;

    const lat = Number(candidate.lat);
    const lng = Number(candidate.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    return {
      lat,
      lng,
      display_name: candidate.display_name?.trim() || query,
      updated_at: new Date().toISOString(),
    };
  }

  throw new Error(`Không tìm được tọa độ cho ${addressKeyValue}`);
}

async function fetchFirstGeocode(url: URL) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "vi,en;q=0.8",
      "User-Agent": "RiderOpsKV56/1.0 (pickup zone test)",
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Geocode failed: ${response.status}`);
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    const candidates = JSON.parse(text) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    return candidates[0] ?? null;
  } catch {
    return null;
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
