import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deliveryVolumeImportItemSchema,
  importBodySchema,
  type DeliveryVolumeImportItem,
} from "@/lib/validators/import";

type DeliveryVolumeRow = {
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
  const parsed = importBodySchema(deliveryVolumeImportItemSchema).safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const records: DeliveryVolumeImportItem[] = Array.isArray(parsed.data) ? parsed.data : parsed.data.records;
  const source = Array.isArray(parsed.data) ? "python_import" : (parsed.data.source ?? "python_import");

  if (records.length === 0) {
    return NextResponse.json({ success: false, error: "No delivery volume records to import" }, { status: 400 });
  }

  const admin = createAdminClient();
  const shipmentIds = Array.from(new Set(records.map((record) => record.shipment_id)));
  const existingIds = new Set<string>();
  const errors: Array<{ shipment_id?: string; error: string }> = [];
  let upserted = 0;

  for (const chunk of chunkArray(shipmentIds, IMPORT_CHUNK_SIZE)) {
    const { data, error } = await admin.from("delivery_volume").select("shipment_id").in("shipment_id", chunk);
    if (error) {
      errors.push({ error: error.message });
      continue;
    }
    data?.forEach((row) => existingIds.add(row.shipment_id));
  }

  const rows = records.map(toDeliveryVolumeRow);

  for (const chunk of chunkArray(rows, IMPORT_CHUNK_SIZE)) {
    const { data, error } = await admin
      .from("delivery_volume")
      .upsert(chunk, { onConflict: "shipment_id" })
      .select("shipment_id");

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
    raw_data: {
      endpoint: "delivery_volume",
      payload,
      errors,
    },
  });

  await admin.from("activity_logs").insert({
    entity_type: "delivery_volume",
    action: "imported",
    message: `Imported ${upserted} delivery volume records`,
    raw_data: {
      source,
      total: records.length,
      inserted: records.filter((record) => !existingIds.has(record.shipment_id)).length,
      updated: records.filter((record) => existingIds.has(record.shipment_id)).length,
      errors,
    },
  });

  return NextResponse.json({
    success: errors.length === 0,
    imported: upserted,
    inserted: records.filter((record) => !existingIds.has(record.shipment_id)).length,
    updated: records.filter((record) => existingIds.has(record.shipment_id)).length,
    errors,
  });
}

function toDeliveryVolumeRow(record: DeliveryVolumeImportItem): DeliveryVolumeRow {
  return {
    shipment_id: record.shipment_id,
    create_time: record.create_time.toISOString(),
    received_time: record.received_time.toISOString(),
    zone_id_raw: cleanText(record.zone_id_raw),
    zone_id_matched: cleanText(record.zone_id_matched),
    old_ward: cleanText(record.old_ward),
    ward: cleanText(record.ward),
    district: cleanText(record.district),
    area: cleanText(record.area),
    order_type: cleanText(record.order_type),
    cot_group: cleanText(record.cot_group),
    raw_data: record.raw_data ?? serializeRecord(record),
  };
}

function cleanText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function serializeRecord(record: DeliveryVolumeImportItem) {
  return {
    ...record,
    create_time: record.create_time.toISOString(),
    received_time: record.received_time.toISOString(),
  };
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
