import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  importBodySchema,
  pickupVolumeImportItemSchema,
  type PickupVolumeImportItem,
} from "@/lib/validators/import";

type PickupVolumeRow = {
  summary_id: string;
  report_date: string;
  new_ward: string | null;
  district: string | null;
  area: string | null;
  cot: string | null;
  ma_tuyen: string | null;
  total_orders: number;
};

const IMPORT_CHUNK_SIZE = 1000;

export async function POST(request: Request) {
  const headerStore = await headers();
  const secret = headerStore.get("x-import-secret");

  if (!process.env.IMPORT_SECRET || secret !== process.env.IMPORT_SECRET) {
    return NextResponse.json({ success: false, error: "Invalid import secret" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = importBodySchema(pickupVolumeImportItemSchema).safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const records: PickupVolumeImportItem[] = Array.isArray(parsed.data) ? parsed.data : parsed.data.records;
  const source = Array.isArray(parsed.data) ? "python_import" : (parsed.data.source ?? "python_import");

  if (records.length === 0) {
    return NextResponse.json({ success: false, error: "No pickup volume records to import" }, { status: 400 });
  }

  const admin = createAdminClient();
  const summaryIds = Array.from(new Set(records.map((record) => record.summary_id)));
  const existingIds = new Set<string>();
  const errors: Array<{ summary_id?: string; error: string }> = [];
  let upserted = 0;

  for (const chunk of chunkArray(summaryIds, IMPORT_CHUNK_SIZE)) {
    const { data, error } = await admin.from("pickup_volume").select("summary_id").in("summary_id", chunk);
    if (error) {
      errors.push({ error: error.message });
      continue;
    }
    data?.forEach((row) => existingIds.add(row.summary_id));
  }

  for (const chunk of chunkArray(records.map(toPickupVolumeRow), IMPORT_CHUNK_SIZE)) {
    const { data, error } = await admin
      .from("pickup_volume")
      .upsert(chunk, { onConflict: "summary_id" })
      .select("summary_id");

    if (error) {
      errors.push({ error: error.message });
      continue;
    }

    upserted += data?.length ?? chunk.length;
  }

  const inserted = records.filter((record) => !existingIds.has(record.summary_id)).length;
  const updated = records.filter((record) => existingIds.has(record.summary_id)).length;

  await admin.from("import_batches").insert({
    source,
    total_records: records.length,
    success_count: upserted,
    error_count: errors.length,
    raw_data: { endpoint: "pickup_volume", payload, errors },
  });

  await admin.from("activity_logs").insert({
    entity_type: "pickup_volume",
    action: "imported",
    message: `Imported ${upserted} pickup volume rows`,
    raw_data: { source, total: records.length, inserted, updated, errors },
  });

  return NextResponse.json({
    success: errors.length === 0,
    imported: upserted,
    inserted,
    updated,
    errors,
  });
}

function toPickupVolumeRow(record: PickupVolumeImportItem): PickupVolumeRow {
  const reportDate = record.report_date.toISOString().slice(0, 10);

  return {
    summary_id: record.summary_id,
    report_date: reportDate,
    new_ward: cleanText(record.new_ward),
    district: cleanText(record.district),
    area: cleanText(record.area),
    cot: cleanText(record.cot),
    ma_tuyen: cleanText(record.ma_tuyen),
    total_orders: record.total_orders,
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
