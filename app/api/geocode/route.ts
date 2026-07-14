import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const querySchema = z.string().trim().min(3).max(200);
const HCM_VIEWBOX = "106.35,11.20,107.05,10.35";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const MIN_UPSTREAM_INTERVAL_MS = 1_050;

type NominatimResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: Record<string, string | undefined>;
};

type GeocodeResult = {
  lat: number;
  lng: number;
  display_name: string;
  ward: string | null;
  district: string | null;
};

const resultCache = new Map<string, { expiresAt: number; result: GeocodeResult | null }>();
let lastUpstreamRequestAt = 0;
let upstreamQueue: Promise<void> = Promise.resolve();

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Chưa đăng nhập" }, { status: 401 });

  const parsed = querySchema.safeParse(new URL(request.url).searchParams.get("q"));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Địa chỉ phải có từ 3 đến 200 ký tự" }, { status: 400 });
  }

  const cacheKey = parsed.data.toLocaleLowerCase("vi");
  const cached = resultCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
      ? NextResponse.json({ success: true, result: cached.result, cached: true })
      : NextResponse.json({ success: false, error: "Không tìm thấy địa chỉ trong TP.HCM" }, { status: 404 });
  }

  await reserveUpstreamSlot();

  const baseUrl = process.env.NOMINATIM_BASE_URL?.trim() || "https://nominatim.openstreetmap.org";
  const searchUrl = new URL("/search", baseUrl);
  searchUrl.search = new URLSearchParams({
    q: withHcmContext(parsed.data),
    format: "jsonv2",
    addressdetails: "1",
    countrycodes: "vn",
    viewbox: HCM_VIEWBOX,
    bounded: "1",
    limit: "1",
  }).toString();

  try {
    const response = await fetch(searchUrl, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "vi,en;q=0.8",
        "User-Agent": "RiderOpsKV56/1.0 (https://sdd-rider-ops-kv56.vercel.app)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Nominatim returned ${response.status}`);
    const candidates = await response.json() as NominatimResult[];
    const candidate = candidates[0];
    const lat = Number(candidate?.lat);
    const lng = Number(candidate?.lon);
    const result = candidate && Number.isFinite(lat) && Number.isFinite(lng)
      ? {
          lat,
          lng,
          display_name: candidate.display_name?.trim() || parsed.data,
          ward: firstAddressPart(candidate.address, ["quarter", "suburb", "neighbourhood", "village", "town"]),
          district: firstAddressPart(candidate.address, ["city_district", "county", "city"]),
        }
      : null;

    remember(cacheKey, result);
    if (!result) return NextResponse.json({ success: false, error: "Không tìm thấy địa chỉ trong TP.HCM" }, { status: 404 });
    return NextResponse.json({ success: true, result, cached: false });
  } catch {
    return NextResponse.json({ success: false, error: "Dịch vụ tìm địa chỉ đang bận, vui lòng thử lại" }, { status: 502 });
  }
}

function withHcmContext(query: string) {
  return /ho chi minh|hồ chí minh|tphcm|tp\.?\s*hcm|sai gon|sài gòn/i.test(query)
    ? query
    : `${query}, Thành phố Hồ Chí Minh, Việt Nam`;
}

function firstAddressPart(address: NominatimResult["address"], keys: string[]) {
  for (const key of keys) {
    const value = address?.[key]?.trim();
    if (value) return value;
  }
  return null;
}

function remember(key: string, result: GeocodeResult | null) {
  if (resultCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = resultCache.keys().next().value;
    if (oldestKey) resultCache.delete(oldestKey);
  }
  resultCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, result });
}

async function reserveUpstreamSlot() {
  const previousRequest = upstreamQueue;
  let releaseSlot = () => {};
  upstreamQueue = new Promise<void>((resolve) => { releaseSlot = resolve; });
  await previousRequest;
  const waitMs = Math.max(0, MIN_UPSTREAM_INTERVAL_MS - (Date.now() - lastUpstreamRequestAt));
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastUpstreamRequestAt = Date.now();
  releaseSlot();
}
