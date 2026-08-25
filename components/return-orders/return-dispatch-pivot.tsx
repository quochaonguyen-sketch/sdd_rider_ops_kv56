"use client";

import { memo, useCallback, useState } from "react";
import { CircleAlert, FileSpreadsheet, UsersRound } from "lucide-react";
import type { ReturnPivotData } from "@/lib/return-orders/return-orders";
import { cn } from "@/utils/cn";

type ReturnPivotBoardProps = {
  data: ReturnPivotData;
};

function kvLabel(value: string) {
  const number = value.match(/\d+/)?.[0];
  return number ? `KV${number}` : value.trim() || "Chưa rõ KV";
}

function cotBadgeClass(cot: string) {
  if (cot === "COT1") return "is-cot1";
  if (cot === "COT2") return "is-cot2";
  return "is-none";
}

async function exportPivot(data: ReturnPivotData) {
  const XLSX = await import("xlsx");
  const header = ["Rider", "ID", "KV", "COT", "COT1", "COT2", "Chưa phân", "Tổng"];
  const body = data.rows.map((rider) => [
    rider.riderName,
    rider.riderCode,
    rider.kv || "Chưa rõ",
    rider.cot || "Chưa rõ",
    rider.orders.cot1,
    rider.orders.cot2,
    rider.orders.unassigned,
    rider.orders.total,
  ]);
  const summaryRow = [
    "Tổng (rider đã gán)",
    "",
    "",
    "",
    data.rows.reduce((sum, rider) => sum + rider.orders.cot1, 0),
    data.rows.reduce((sum, rider) => sum + rider.orders.cot2, 0),
    data.rows.reduce((sum, rider) => sum + rider.orders.unassigned, 0),
    data.rows.reduce((sum, rider) => sum + rider.orders.total, 0),
  ];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body, summaryRow]);
  sheet["!cols"] = [{ wch: 30 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "Phan cong COT");

  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `phan-cong-cot-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const ReturnPivotBoard = memo(function ReturnPivotBoard({ data }: ReturnPivotBoardProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportPivot(data);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Không thể xuất file Excel");
    } finally {
      setExporting(false);
    }
  }, [data]);

  const assigned = data.rows.reduce((sum, rider) => sum + rider.orders.total, 0);
  const cot1 = data.rows.reduce((sum, rider) => sum + rider.orders.cot1, 0);
  const cot2 = data.rows.reduce((sum, rider) => sum + rider.orders.cot2, 0);
  const unassigned = data.unassigned + data.rows.reduce((sum, rider) => sum + rider.orders.unassigned, 0);

  return (
    <section className="return-pivot-board" aria-labelledby="return-pivot-title">
      <header>
        <div className="return-pivot-heading">
          <p>RETURN DISPATCH · PHÂN CÔNG</p>
          <h2 id="return-pivot-title">Phân công hàng trả theo rider & COT</h2>
          <span>Tổng hợp số đơn gán cho từng rider theo ca. COT của đơn lấy từ rider được gán; đơn chưa có rider nằm ở cột Chưa phân.</span>
        </div>
      </header>

      <dl className="return-pivot-stats">
        <div><dt>Đơn đã gán rider</dt><dd>{assigned.toLocaleString("vi-VN")}</dd><small>COT1 {cot1.toLocaleString("vi-VN")} · COT2 {cot2.toLocaleString("vi-VN")}</small></div>
        <div><dt>Đơn chưa phân</dt><dd>{unassigned.toLocaleString("vi-VN")}</dd><small>Chưa có rider nhận</small></div>
        <div><dt>Rider nhận trả</dt><dd>{data.rows.length.toLocaleString("vi-VN")}</dd><small>{data.rows.filter((rider) => rider.cot === "COT1").length} COT1 · {data.rows.filter((rider) => rider.cot === "COT2").length} COT2</small></div>
      </dl>

      <div className="return-pivot-toolbar">
        <span className="return-pivot-count">
          <UsersRound size={15} aria-hidden="true" />
          {data.rows.length.toLocaleString("vi-VN")} rider · {data.totalOrders.toLocaleString("vi-VN")} đơn đã gán
        </span>
        <button
          type="button"
          className={cn("return-pivot-export", exporting && "is-loading", exportError && "is-error")}
          disabled={exporting || data.rows.length === 0}
          onClick={() => void handleExport()}
          data-state={exporting ? "loading" : exportError ? "error" : "idle"}
        >
          <FileSpreadsheet size={15} aria-hidden="true" />
          <span>{exporting ? "Đang xuất..." : "Xuất Excel"}</span>
        </button>
      </div>

      {exportError ? (
        <p className="return-pivot-error" role="alert"><CircleAlert size={14} aria-hidden="true" />{exportError}</p>
      ) : null}

      <div className="return-table-wrap">
        <table className="return-table return-pivot-table">
          <thead>
            <tr>
              <th scope="col">Rider</th>
              <th scope="col">ID</th>
              <th scope="col">KV</th>
              <th scope="col">COT</th>
              <th scope="col" className="is-num">COT1</th>
              <th scope="col" className="is-num">COT2</th>
              <th scope="col" className="is-num">Chưa phân</th>
              <th scope="col" className="is-num">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((rider) => (
              <tr key={rider.riderCode}>
                <td data-label="Rider"><strong>{rider.riderName || "Chưa có tên"}</strong></td>
                <td data-label="ID"><span className="return-code">{rider.riderCode}</span></td>
                <td data-label="KV">{kvLabel(rider.kv)}</td>
                <td data-label="COT">
                  <span className={cn("return-pivot-cot", cotBadgeClass(rider.cot))}>{rider.cot || "Chưa rõ"}</span>
                </td>
                <td data-label="COT1" className="is-num">{rider.orders.cot1.toLocaleString("vi-VN")}</td>
                <td data-label="COT2" className="is-num">{rider.orders.cot2.toLocaleString("vi-VN")}</td>
                <td data-label="Chưa phân" className="is-num">{rider.orders.unassigned.toLocaleString("vi-VN")}</td>
                <td data-label="Tổng" className="is-num is-total">{rider.orders.total.toLocaleString("vi-VN")}</td>
              </tr>
            ))}
            {!data.rows.length ? (
              <tr>
                <td colSpan={8} className="return-empty">
                  <strong>Chưa có đơn nào được gán rider.</strong>
                  <span>Gán rider cho đơn trả để xem phân công theo COT.</span>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
});
