import { hcmDistricts } from "@/lib/locations/hcm";

export const dynamic = "force-static";

export async function GET() {
  return Response.json({ districts: hcmDistricts });
}
