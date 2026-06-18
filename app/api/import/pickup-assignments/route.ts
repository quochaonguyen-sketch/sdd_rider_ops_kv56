import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  importBodySchema,
  pickupAssignmentImportItemSchema,
  type PickupAssignmentImportItem,
} from "@/lib/validators/import";

type PickupAssignmentRow = {
  assignment_key: string;
  assigned_at: string | null;
  cot: string | null;
  route_name: string | null;
  mapped_pickup_point_group: string | null;
  pickup_point_id: string | null;
  pup_code: string | null;
  shop_name: string | null;
  shop_address: string | null;
  ward: string | null;
  district: string | null;
  pickup_status: number | null;
  pickup_retry_assign_type: number;
  raw_data: Record<string, unknown>;
};

const IMPORT_CHUNK_SIZE = 1000;

export async function POST(request: Request) {
  const headerStore = await headers();
  const secret = headerStore.get("x-import-secret");

  if (!process.env.IMPORT_SECRET || secret !== process.env.IMPORT_SECRET) {
    return NextResponse.json({ success: false, error: "Invalid import secret" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = importBodySchema(pickupAssignmentImportItemSchema).safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const records: PickupAssignmentImportItem[] = Array.isArray(parsed.data)
    ? parsed.data
    : parsed.data.records;
  const source = Array.isArray(parsed.data) ? "python_import" : (parsed.data.source ?? "python_import");

  if (records.length === 0) {
    return NextResponse.json({ success: false, error: "No pickup assignment records to import" }, { status: 400 });
  }

  const admin = createAdminClient();
  const errors: Array<{ assignment_key?: string; error: string }> = [];
  let upserted = 0;

  for (const chunk of chunkArray(records.map(toPickupAssignmentRow), IMPORT_CHUNK_SIZE)) {
    const { data, error } = await admin
      .from("pickup_assignments")
      .upsert(chunk, { onConflict: "assignment_key" })
      .select("assignment_key");

    if (error) {
      errors.push({ error: error.message });
      continue;
    }

    upserted += data?.length ?? chunk.length;
  }

  await admin.from("import_batches").insert({
    source,
    total_records: records.length,
    success_count: upserted,
    error_count: errors.length,
    raw_data: { endpoint: "pickup_assignments", payload, errors },
  });

  await admin.from("activity_logs").insert({
    entity_type: "pickup_assignment",
    action: "imported",
    message: `Imported ${upserted} pickup assignment rows`,
    raw_data: { source, total: records.length, errors },
  });

  return NextResponse.json({
    success: errors.length === 0,
    imported: upserted,
    errors,
  });
}

function toPickupAssignmentRow(record: PickupAssignmentImportItem): PickupAssignmentRow {
  const pickupPointId = cleanText(record.pickup_point_id) ?? cleanText(record.pup_code);
  const routeName = cleanText(record.route_name);
  const cot = cleanText(record.cot);
  const assignmentKey =
    cleanText(record.assignment_key) ??
    [cot, routeName, pickupPointId].map((value) => value ?? "").join("|");

  return {
    assignment_key: assignmentKey,
    assigned_at: record.assigned_at ? record.assigned_at.toISOString() : null,
    cot,
    route_name: routeName,
    mapped_pickup_point_group: cleanText(record.mapped_pickup_point_group),
    pickup_point_id: pickupPointId,
    pup_code: cleanText(record.pup_code) ?? pickupPointId,
    shop_name: cleanText(record.shop_name),
    shop_address: cleanText(record.shop_address),
    ward: cleanText(record.ward),
    district: cleanText(record.district),
    pickup_status: record.pickup_status ?? null,
    pickup_retry_assign_type: record.pickup_retry_assign_type ?? 0,
    raw_data: record.raw_data ?? {
      ...record,
    },
  };
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
