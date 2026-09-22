import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveOffScheduleSpreadsheetId } from "@/lib/google/off-schedule";
import { readPickupReplacementsFromGoogleSheet } from "@/lib/google/pickup-replacements";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function isCot1(value: string | null) {
  return /\bcot\s*1\b/i.test(value ?? "") || value?.trim() === "1";
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
}

function formatDateVi(date: string) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(`${date}T00:00:00`));
  } catch {
    return date;
  }
}

function attendanceStatusLabel(status: string | null | undefined) {
  if (status === "OFF_APPROVED") return "OFF phép";
  if (status === "OFF_UNEXPECTED") return "OFF đột xuất";
  if ((status ?? "").toUpperCase().includes("OFF")) return "OFF tuần";
  return "Chưa điểm danh";
}

function isOffStatus(status: string | null | undefined) {
  return (status ?? "").toUpperCase().includes("OFF");
}

function absentStatusRank(status: string | null | undefined) {
  if (!isOffStatus(status)) return 0;
  if (status === "OFF_APPROVED") return 1;
  if (status === "OFF_UNEXPECTED") return 2;
  return 3;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const workDate = new URL(request.url).searchParams.get("date") ?? "";
  if (!datePattern.test(workDate)) {
    return NextResponse.json({ success: false, error: "Ngày không hợp lệ" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [riderResult, assignmentResult, attendanceResult, absenceNoteResult, realtime10amResult, realtimeResult, pickupReplacementResult] = await Promise.all([
    admin
      .from("riders")
      .select("id,rider_code,full_name,kv,cot,pickup_district,pickup_ward,delivery_district,delivery_ward,status")
      .eq("status", "active")
      .order("rider_code"),
    admin.from("morning_delivery_assignments").select("rider_id,checked_in_at").eq("work_date", workDate),
    admin.from("attendance_logs").select("rider_id,rider_code,status,note").eq("work_date", workDate),
    admin
      .from("morning_delivery_absence_notes")
      .select("rider_id,reason,is_excused")
      .eq("work_date", workDate),
    admin.from("realtime_delivery_riders_10am").select("driver_id,total_assigned").eq("work_date", workDate),
    admin.from("realtime_delivery_riders").select("driver_id,total_assigned,work_date,snapshot_at").eq("work_date", workDate).order("snapshot_at", { ascending: false }).limit(1000),
    admin.from("pickup_replacements").select("rider_code,replacement_rider_code,status").eq("work_date", workDate).eq("status", "ASSIGNED"),
  ]);

  const error = riderResult.error ?? assignmentResult.error ?? attendanceResult.error ?? absenceNoteResult.error ?? realtime10amResult.error ?? realtimeResult.error ?? pickupReplacementResult.error;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 400 });

  const assignedRiderIds = new Set((assignmentResult.data ?? []).filter((item) => item.checked_in_at).map((item) => item.rider_id));
  const attendanceByRider = new Map<string, { status: string; note: string | null }>();
  for (const log of attendanceResult.data ?? []) {
    if (log.rider_id) attendanceByRider.set(log.rider_id, log);
    attendanceByRider.set(log.rider_code, log);
  }
  const absenceByRider = new Map((absenceNoteResult.data ?? []).map((item) => [item.rider_id, item]));
  const realtime10amByRider = new Map((realtime10amResult.data ?? []).map((item) => [normalize(item.driver_id), item.total_assigned]));
  const realtimeByRider = new Map<string, number>();
  for (const row of realtimeResult.data ?? []) {
    const key = normalize(row.driver_id);
    const cur = realtimeByRider.get(key) ?? 0;
    if (row.total_assigned > cur) realtimeByRider.set(key, row.total_assigned);
  }
  const riderNameByCode = new Map((riderResult.data ?? []).map((r) => [normalize(r.rider_code), r.full_name ?? ""]));
  const riderCodeByNormalizedName = new Map(
    (riderResult.data ?? [])
      .filter((r) => normalize(r.full_name))
      .map((r) => [normalize(r.full_name), r.rider_code]),
  );
  const pickReplacementMap = new Map<string, { offRiderCode: string; offRiderName: string }>();
  for (const row of (pickupReplacementResult.data ?? []) as Array<{ rider_code: string; replacement_rider_code: string | null }>) {
    if (!row.replacement_rider_code) continue;
    pickReplacementMap.set(normalize(row.replacement_rider_code), {
      offRiderCode: row.rider_code,
      offRiderName: riderNameByCode.get(normalize(row.rider_code)) ?? "",
    });
  }
  // Merge Google Sheet — giống web để Đỗ Khánh Linh (157696) không lệch giữa web và Excel
  try {
    const spreadsheetId = resolveOffScheduleSpreadsheetId();
    if (spreadsheetId) {
      const sheetRows = await readPickupReplacementsFromGoogleSheet(spreadsheetId, workDate, workDate, AbortSignal.timeout(8000));
      for (const item of sheetRows) {
        const replacementCode =
          item.replacement_rider_code ??
          (item.replacement_rider_name ? riderCodeByNormalizedName.get(normalize(item.replacement_rider_name)) ?? null : null);
        if (!replacementCode) continue;
        pickReplacementMap.set(normalize(replacementCode), {
          offRiderCode: item.rider_code,
          offRiderName: riderNameByCode.get(normalize(item.rider_code)) ?? "",
        });
      }
    }
  } catch {
    // Sheet lỗi → vẫn dùng DB
  }
  const pickReplacementSet = new Set(pickReplacementMap.keys());

  const absentRiders = (riderResult.data ?? []).filter(
    (rider) =>
      isCot1(rider.cot) &&
      !rider.pickup_district?.trim() &&
      !rider.pickup_ward?.trim() &&
      !assignedRiderIds.has(rider.id),
  );

  function fullAbsentRank(rider: (typeof absentRiders)[number]) {
    const att = attendanceByRider.get(rider.id) ?? attendanceByRider.get(rider.rider_code);
    if (pickReplacementSet.has(normalize(rider.rider_code))) return 50;
    if (isOffStatus(att?.status)) return 10 + absentStatusRank(att?.status);
    const cnt = Math.max(realtime10amByRider.get(normalize(rider.rider_code)) ?? 0, realtimeByRider.get(normalize(rider.rider_code)) ?? 0);
    if (cnt > 0) return 1;
    return 2;
  }
  const sorted = [...absentRiders].sort((a, b) => {
    const districtA = normalize(a.delivery_district) || "zzz";
    const districtB = normalize(b.delivery_district) || "zzz";
    const districtCmp = districtA.localeCompare(districtB, "vi", { numeric: true });
    if (districtCmp !== 0) return districtCmp;
    const wardA = normalize(a.delivery_ward) || "zzz";
    const wardB = normalize(b.delivery_ward) || "zzz";
    const wardCmp = wardA.localeCompare(wardB, "vi", { numeric: true });
    if (wardCmp !== 0) return wardCmp;
    const rankA = fullAbsentRank(a);
    const rankB = fullAbsentRank(b);
    if (rankA !== rankB) return rankA - rankB;
    const kvA = normalize(a.kv) || "zzz";
    const kvB = normalize(b.kv) || "zzz";
    const kvCmp = kvA.localeCompare(kvB, "vi");
    if (kvCmp !== 0) return kvCmp;
    return a.rider_code.localeCompare(b.rider_code, "vi", { numeric: true });
  });

  const dateLabel = formatDateVi(workDate);
  const exportTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  const title = `MORNING DISPATCH — RIDER CHƯA ĐIỂM DANH`;
  const subtitle = `Ngày ${dateLabel}  •  ${sorted.length} rider chưa điểm danh  •  Xuất lúc ${exportTime}`;

  // Stats per status for report header
  const statusCounts = new Map<string, number>();
  for (const r of sorted) {
    const att = attendanceByRider.get(r.id) ?? attendanceByRider.get(r.rider_code);
    const isOff = isOffStatus(att?.status);
    const pick = pickReplacementSet.has(normalize(r.rider_code));
    const cnt = Math.max(realtime10amByRider.get(normalize(r.rider_code)) ?? 0, realtimeByRider.get(normalize(r.rider_code)) ?? 0);
    let s = "Chưa có mặt";
    if (pick) s = "Đi pick thay";
    else if (isOff) s = attendanceStatusLabel(att?.status);
    else if (cnt > 0) s = "Chưa điểm danh";
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
  }
  const statsLine = [
    `Tổng: ${sorted.length}`,
    `Chưa điểm danh: ${statusCounts.get("Chưa điểm danh") ?? 0}`,
    `Chưa có mặt: ${statusCounts.get("Chưa có mặt") ?? 0}`,
    `Đi pick thay: ${statusCounts.get("Đi pick thay") ?? 0}`,
    `OFF: ${(statusCounts.get("OFF phép") ?? 0) + (statusCounts.get("OFF tuần") ?? 0) + (statusCounts.get("OFF đột xuất") ?? 0)}`,
  ].join("  •  ");

  const HEADER = ["STT", "Mã Rider", "Họ tên", "KV", "Khu vực giao", "COT", "Trạng thái", "Lý do không lên lấy hàng", "Có phép"] as const;
  const COL_COUNT = HEADER.length;

  const rows = sorted.map((rider, index) => {
    const attendance = attendanceByRider.get(rider.id) ?? attendanceByRider.get(rider.rider_code);
    const absence = absenceByRider.get(rider.id);
    const kv = rider.kv?.trim() || "—";
    const district = rider.delivery_district?.trim() || "Chưa gán";
    const ward = rider.delivery_ward?.trim() || "";
    const khuVuc = ward ? `${district} · ${ward}` : district;
    const isOff = isOffStatus(attendance?.status);
    const pickInfo = pickReplacementMap.get(normalize(rider.rider_code));
    const pickReplacement = !!pickInfo;
    const realtimeCount = Math.max(realtime10amByRider.get(normalize(rider.rider_code)) ?? 0, realtimeByRider.get(normalize(rider.rider_code)) ?? 0);
    let status: string;
    if (pickReplacement) status = "Đi pick thay";
    else if (isOff) status = attendanceStatusLabel(attendance?.status);
    else if (realtimeCount > 0) status = "Chưa điểm danh";
    else status = "Chưa có mặt";
    // Lý do: nếu Đi pick thay thì ghi rõ thay cho ai, nếu không thì lấy lý do vắng
    let lyDo = absence?.reason ?? "";
    if (pickReplacement && pickInfo) {
      lyDo = `Đi pick thay cho ${pickInfo.offRiderCode}${pickInfo.offRiderName ? " - " + pickInfo.offRiderName : ""}${lyDo ? " • " + lyDo : ""}`;
    }
    return [
      index + 1,
      rider.rider_code,
      rider.full_name ?? "",
      kv,
      khuVuc,
      rider.cot ?? "",
      status,
      lyDo,
      absence?.is_excused ? "Có" : "Không",
    ];
  });

  // Build sheet: Title, Subtitle, Stats, gap, Header, Data, Summary, Footer note
  const sheetData: (string | number | null)[][] = [];
  sheetData.push([title]); // R1
  sheetData.push([subtitle]); // R2
  sheetData.push([statsLine]); // R3 stats
  sheetData.push([]); // R4 gap
  sheetData.push([...HEADER]); // R5 header
  for (const r of rows) sheetData.push(r); // R6+
  const summaryRowIndex = sheetData.length;
  sheetData.push(["", "", `Tổng cộng: ${sorted.length} rider`, "", "", "", "", "", ""]); // summary
  sheetData.push([`Báo cáo tự động từ SDD Rider Ops — Ngày ${dateLabel} — Vui lòng không chỉnh sửa thủ công. Liên hệ điều phối nếu có sai sót.`]); // footer note

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(sheetData);

  sheet["!cols"] = [
    { wch: 6 }, // STT
    { wch: 14 }, // Mã
    { wch: 26 }, // Tên
    { wch: 9 }, // KV
    { wch: 30 }, // Khu vực
    { wch: 10 }, // COT
    { wch: 16 }, // Trạng thái
    { wch: 40 }, // Lý do
    { wch: 10 }, // Có phép
  ];

  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COL_COUNT - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COL_COUNT - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: COL_COUNT - 1 } },
    { s: { r: summaryRowIndex + 1, c: 0 }, e: { r: summaryRowIndex + 1, c: COL_COUNT - 1 } },
  ];

  // In mức độ báo cáo: freeze header, autofilter, in ngang A4
  sheet["!freeze"] = { xSplit: 0, ySplit: 5, topLeftCell: "A6", state: "frozen" } as unknown as typeof sheet["!freeze"];
  sheet["!autofilter"] = { ref: `A5:I${5 + rows.length}` } as unknown as typeof sheet["!autofilter"];
  (sheet as unknown as Record<string, unknown>)["!margins"] = { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.3, footer: 0.3 };
  // Print setup: landscape A4, fit to width
  (sheet as unknown as Record<string, unknown>)["!pageSetup"] = {
    orientation: "landscape",
    paperSize: 9, // A4
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
  };
  sheet["!printHeader"] = undefined;

  // Row heights - dynamic for wrapped text
  const rowHeights: { hpt: number }[] = [];
  rowHeights.push({ hpt: 26 }); // title
  rowHeights.push({ hpt: 15 }); // subtitle
  rowHeights.push({ hpt: 14 }); // stats
  rowHeights.push({ hpt: 6 }); // gap
  rowHeights.push({ hpt: 22 }); // header
  for (const r of rows) {
    const lyDo = String(r[7] ?? "");
    const khuVuc = String(r[4] ?? "");
    // Estimate height: base 18 + extra per 38 chars
    const needWrap = Math.max(khuVuc.length, lyDo.length);
    const h = needWrap > 50 ? 28 : needWrap > 35 ? 22 : 18;
    rowHeights.push({ hpt: h });
  }
  rowHeights.push({ hpt: 18 }); // summary
  rowHeights.push({ hpt: 13 }); // footer note
  sheet["!rows"] = rowHeights;

  const thinBorder = {
    top: { style: "thin", color: { rgb: "E2E8F0" } },
    bottom: { style: "thin", color: { rgb: "E2E8F0" } },
    left: { style: "thin", color: { rgb: "E2E8F0" } },
    right: { style: "thin", color: { rgb: "E2E8F0" } },
  };
  const thinBorderBottomStrong = {
    top: { style: "thin", color: { rgb: "E2E8F0" } },
    bottom: { style: "medium", color: { rgb: "CBD5E1" } },
    left: { style: "thin", color: { rgb: "E2E8F0" } },
    right: { style: "thin", color: { rgb: "E2E8F0" } },
  };

  // Title R1 - dashboard graphite header style, white on dark
  const titleCell = sheet["A1"];
  if (titleCell) {
    titleCell.s = {
      font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "0F172A" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: thinBorderBottomStrong,
    };
  }
  const subtitleCell = sheet["A2"];
  if (subtitleCell) {
    subtitleCell.s = {
      font: { name: "Calibri", sz: 9, italic: true, color: { rgb: "475569" } },
      fill: { fgColor: { rgb: "F8FAFC" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: thinBorder,
    };
  }
  const statsCell = sheet["A3"];
  if (statsCell) {
    statsCell.s = {
      font: { name: "Calibri", sz: 9, bold: true, color: { rgb: "334155" } },
      fill: { fgColor: { rgb: "F1F5F9" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: thinBorder,
    };
  }

  // Header R5 (index 4)
  const headerRow = 4;
  const headerFill = "0F172A";
  for (let c = 0; c < COL_COUNT; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    const cell = sheet[addr];
    if (cell) {
      cell.s = {
        font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: headerFill } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: thinBorderBottomStrong,
      };
    }
  }

  function statusFill(status: string) {
    if (status === "OFF phép") return "DBEAFE";
    if (status === "OFF đột xuất") return "FEE2E2";
    if (status === "OFF tuần") return "FEF3C7";
    if (status === "Chưa điểm danh") return "FFEDD5";
    if (status === "Chưa có mặt") return "F8FAFC"; // very light slate, dịu mắt nhất
    if (status === "Đi pick thay") return "E0F2FE";
    return "F1F5F9";
  }
  function statusFont(status: string) {
    if (status === "OFF phép") return "1E40AF";
    if (status === "OFF đột xuất") return "991B1B";
    if (status === "OFF tuần") return "92400E";
    if (status === "Chưa điểm danh") return "9A3412";
    if (status === "Chưa có mặt") return "64748B";
    if (status === "Đi pick thay") return "0369A1";
    return "475569";
  }

  // Data rows start at r=5
  for (let r = 0; r < rows.length; r++) {
    const rowIdx = 5 + r;
    const isAlt = r % 2 === 1;
    const rowFill = isAlt ? "F8FAFC" : "FFFFFF";
    const status = String(rows[r][6] ?? "");
    const coPhep = String(rows[r][8] ?? "");
    for (let c = 0; c < COL_COUNT; c++) {
      const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
      const cell = sheet[addr];
      if (!cell) continue;
      const isSTT = c === 0;
      const isCenter = c === 0 || c === 3 || c === 5 || c === 6 || c === 8;
      const isStatusCol = c === 6;
      const isCoPhepCol = c === 8;
      let fill = isStatusCol ? statusFill(status) : rowFill;
      let fontColor = isStatusCol ? statusFont(status) : "0F172A";
      let bold = c === 1 || isStatusCol;
      // Có phép column: Có = xanh lá nhạt, Không = xám nhạt
      if (isCoPhepCol) {
        fill = coPhep === "Có" ? "DCFCE7" : "F1F5F9";
        fontColor = coPhep === "Có" ? "15803D" : "64748B";
        bold = true;
      }
      const base: Record<string, unknown> = {
        font: { name: "Calibri", sz: 10, color: { rgb: fontColor }, bold },
        fill: { fgColor: { rgb: fill } },
        alignment: {
          horizontal: isCenter ? "center" : c === 2 || c === 4 || c === 7 ? "left" : "center",
          vertical: "center",
          wrapText: c === 4 || c === 7,
        },
        border: thinBorder,
      };
      if (isSTT) {
        base.font = { name: "Calibri", sz: 9, color: { rgb: "64748B" }, bold: false };
        (base as { alignment: unknown }).alignment = { horizontal: "center", vertical: "center", wrapText: false };
      }
      if (c === 2) base.font = { name: "Calibri", sz: 10, color: { rgb: "0F172A" }, bold: true };
      cell.s = base as unknown as NonNullable<typeof cell.s>;
      if (isSTT) cell.z = "0";
    }
  }

  // Summary row
  const sumAddr = XLSX.utils.encode_cell({ r: summaryRowIndex, c: 2 });
  const sumCell = sheet[sumAddr];
  if (sumCell) {
    sumCell.s = {
      font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "0F172A" } },
      fill: { fgColor: { rgb: "F1F5F9" } },
      alignment: { horizontal: "left", vertical: "center", wrapText: false },
      border: thinBorder,
    } as unknown as NonNullable<typeof sumCell.s>;
  }
  for (let c = 0; c < COL_COUNT; c++) {
    const addr = XLSX.utils.encode_cell({ r: summaryRowIndex, c });
    const cell = sheet[addr];
    if (cell && c !== 2) {
      cell.s = { fill: { fgColor: { rgb: "F1F5F9" } }, border: thinBorder } as unknown as NonNullable<typeof cell.s>;
    }
  }
  // Footer note
  const footerIdx = summaryRowIndex + 1;
  const footerCell = sheet[XLSX.utils.encode_cell({ r: footerIdx, c: 0 })];
  if (footerCell) {
    footerCell.s = {
      font: { name: "Calibri", sz: 8, italic: true, color: { rgb: "94A3B8" } },
      fill: { fgColor: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: { top: { style: "thin", color: { rgb: "E2E8F0" } } } as unknown as typeof thinBorder,
    } as unknown as NonNullable<typeof footerCell.s>;
  }

  XLSX.utils.book_append_sheet(workbook, sheet, "Chua diem danh");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellStyles: true });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="rider-chua-diem-danh-${workDate}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
