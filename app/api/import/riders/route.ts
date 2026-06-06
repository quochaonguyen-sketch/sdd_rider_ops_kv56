import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma/client";
import { importBodySchema, riderImportItemSchema, type RiderImportItem } from "@/lib/validators/import";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function POST(request: Request) {
  const headerStore = await headers();
  const secret = headerStore.get("x-import-secret");

  if (!process.env.IMPORT_SECRET || secret !== process.env.IMPORT_SECRET) {
    return NextResponse.json({ success: false, error: "Invalid import secret" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = importBodySchema(riderImportItemSchema).safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const records: RiderImportItem[] = Array.isArray(parsed.data) ? parsed.data : parsed.data.records;
  const source = Array.isArray(parsed.data) ? "python_import" : (parsed.data.source ?? "python_import");
  let inserted = 0;
  let updated = 0;
  const errors: Array<{ rider_code?: string; error: string }> = [];

  for (const record of records) {
    try {
      const zone = record.zone
        ? await prisma.zone.upsert({
            where: { name: record.zone },
            create: {
              name: record.zone,
              area: record.area,
              hub: record.hub,
              rawData: toJson(record.raw_data ?? record),
            },
            update: {
              area: record.area,
              hub: record.hub,
              rawData: toJson(record.raw_data ?? record),
            },
          })
        : null;

      const existing = await prisma.rider.findUnique({
        where: { riderCode: record.rider_code },
        select: { id: true },
      });

      const rider = await prisma.rider.upsert({
        where: { riderCode: record.rider_code },
        create: {
          riderCode: record.rider_code,
          name: record.name,
          phone: record.phone,
          zoneId: zone?.id,
          status: record.status,
          currentShift: record.shift,
          rawData: toJson(record.raw_data ?? record),
        },
        update: {
          name: record.name,
          phone: record.phone,
          zoneId: zone?.id,
          status: record.status,
          currentShift: record.shift,
          rawData: toJson(record.raw_data ?? record),
        },
      });

      if (existing) {
        updated += 1;
      } else {
        inserted += 1;
      }

      await prisma.activityLog.create({
        data: {
          entityType: "rider",
          entityId: rider.id,
          action: existing ? "updated" : "inserted",
          message: `${existing ? "Updated" : "Inserted"} rider ${record.rider_code}`,
          rawData: toJson(record.raw_data ?? record),
        },
      });
    } catch (error) {
      errors.push({
        rider_code: record.rider_code,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  await prisma.importBatch.create({
    data: {
      source,
      totalRecords: records.length,
      successCount: inserted + updated,
      errorCount: errors.length,
      rawData: toJson(payload),
    },
  });

  return NextResponse.json({
    success: errors.length === 0,
    inserted,
    updated,
    errors,
  });
}
