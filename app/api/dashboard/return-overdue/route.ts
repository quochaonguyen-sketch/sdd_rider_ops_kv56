import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const OVERDUE_HOURS = 48;
const PAGE_SIZE = 1000;
const IN_FILTER_CHUNK_SIZE = 200;

type ReturnSnapshotRow = {
  shipment_id: string;
  return_driver_id: string;
  return_driver_name: string;
  return_zone: string;
  seller_district: string;
  seller_new_ward: string;
  seller_ward: string;
  delivering_time: string;
};

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, (index + 1) * size));
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: latest, error: latestError } = await admin
    .from("return_order_snapshots")
    .select("snapshot_id,snapshot_at")
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return NextResponse.json({ success: false, error: latestError.message }, { status: 400 });
  if (!latest) {
    return NextResponse.json({
      success: true,
      overdue: { thresholdHours: OVERDUE_HOURS, totalOrders: 0, missingStartedAt: 0, snapshotAt: null, riders: [] },
    });
  }

  const cutoff = new Date(Date.now() - OVERDUE_HOURS * 60 * 60 * 1000).toISOString();
  const rows: ReturnSnapshotRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await admin
      .from("return_order_snapshots")
      .select("shipment_id,return_driver_id,return_driver_name,return_zone,seller_district,seller_new_ward,seller_ward,delivering_time")
      .eq("snapshot_id", latest.snapshot_id)
      .in("seller_area", ["Khu vực 5", "Khu vực 6"])
      .eq("order_status", 72)
      .lt("delivering_time", cutoff)
      .order("delivering_time", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (result.error) return NextResponse.json({ success: false, error: result.error.message }, { status: 400 });
    const page = (result.data ?? []) as ReturnSnapshotRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const missingResult = await admin
    .from("return_order_snapshots")
    .select("*", { count: "exact", head: true })
    .eq("snapshot_id", latest.snapshot_id)
    .in("seller_area", ["Khu vực 5", "Khu vực 6"])
    .eq("order_status", 72)
    .neq("return_driver_id", "")
    .is("delivering_time", null);
  if (missingResult.error) return NextResponse.json({ success: false, error: missingResult.error.message }, { status: 400 });

  const shipmentIds = rows.map((row) => row.shipment_id);
  const [handoverParts, assignmentParts] = await Promise.all([
    Promise.all(chunks(shipmentIds, IN_FILTER_CHUNK_SIZE).map((shipmentChunk) =>
      admin.from("return_order_handovers").select("shipment_id").in("shipment_id", shipmentChunk))),
    Promise.all(chunks(shipmentIds, IN_FILTER_CHUNK_SIZE).map((shipmentChunk) =>
      admin.from("return_order_assignments").select("shipment_id,rider_code,rider_name,cot").in("shipment_id", shipmentChunk))),
  ]);
  const relatedError = [...handoverParts, ...assignmentParts].find((part) => part.error)?.error;
  if (relatedError) return NextResponse.json({ success: false, error: relatedError.message }, { status: 400 });

  const handedOver = new Set(handoverParts.flatMap((part) => part.data ?? []).map((row) => row.shipment_id));
  const assignments = new Map(assignmentParts.flatMap((part) => part.data ?? []).map((row) => [row.shipment_id, row]));
  const activeRows = rows.filter((row) => !handedOver.has(row.shipment_id));
  const riderCodes = [...new Set(activeRows.map((row) =>
    String(assignments.get(row.shipment_id)?.rider_code || row.return_driver_id || "").trim()).filter(Boolean))];
  const profilesResult = riderCodes.length
    ? await admin.from("riders").select("rider_code,full_name,kv,cot").in("rider_code", riderCodes)
    : { data: [], error: null };
  if (profilesResult.error) return NextResponse.json({ success: false, error: profilesResult.error.message }, { status: 400 });
  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.rider_code, profile]));

  const now = Date.now();
  const riderMap = new Map<string, {
    riderCode: string;
    riderName: string;
    kv: string;
    cot: string;
    totalOrders: number;
    oldestHours: number;
    oldestAt: string;
    orders: Array<{ shipmentId: string; startedAt: string; ageHours: number; zone: string; district: string; ward: string }>;
  }>();
  for (const row of activeRows) {
    const assignment = assignments.get(row.shipment_id);
    const riderCode = String(assignment?.rider_code || row.return_driver_id || "").trim();
    if (!riderCode) continue;
    const profile = profiles.get(riderCode);
    const ageHours = Math.max(0, Math.floor((now - new Date(row.delivering_time).getTime()) / 3_600_000));
    const current = riderMap.get(riderCode);
    const order = {
      shipmentId: row.shipment_id,
      startedAt: row.delivering_time,
      ageHours,
      zone: row.return_zone,
      district: row.seller_district,
      ward: row.seller_new_ward || row.seller_ward,
    };
    riderMap.set(riderCode, {
      riderCode,
      riderName: String(profile?.full_name || assignment?.rider_name || row.return_driver_name || riderCode).trim(),
      kv: String(profile?.kv || "").trim(),
      cot: String(assignment?.cot || profile?.cot || "").trim(),
      totalOrders: (current?.totalOrders ?? 0) + 1,
      oldestHours: Math.max(current?.oldestHours ?? 0, ageHours),
      oldestAt: current && current.oldestAt < row.delivering_time ? current.oldestAt : row.delivering_time,
      orders: [...(current?.orders ?? []), order]
        .sort((a, b) => b.ageHours - a.ageHours || a.shipmentId.localeCompare(b.shipmentId))
        .slice(0, 10),
    });
  }

  const riders = [...riderMap.values()]
    .sort((a, b) => b.oldestHours - a.oldestHours || b.totalOrders - a.totalOrders || a.riderName.localeCompare(b.riderName, "vi"));

  return NextResponse.json({
    success: true,
    overdue: {
      thresholdHours: OVERDUE_HOURS,
      totalOrders: riders.reduce((total, rider) => total + rider.totalOrders, 0),
      missingStartedAt: missingResult.count ?? 0,
      snapshotAt: latest.snapshot_at,
      riders,
    },
  });
}
