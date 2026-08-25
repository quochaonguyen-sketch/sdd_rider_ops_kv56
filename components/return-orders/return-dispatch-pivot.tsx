/* Hallmark · component: return-pivot-board · genre: modern-minimal · theme: Cobalt adapted
 * pre-emit critique: P5 H5 E5 S5 R5 V4 · contrast: pass (40-41) · tokens: pass (48)
 * states: default · hover · focus · active · disabled · loading · error
 */
"use client";

import React, { memo, useCallback, useMemo, useState } from "react";
import { ChevronDown, CircleAlert, FileSpreadsheet, LayoutDashboard, LoaderCircle, MapPin, Search, UsersRound, X } from "lucide-react";
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

function aging(value: string | null) {
  if (!value) return { label: "—", tone: "unknown" as const };
  const days = Math.max(0, (Date.now() - new Date(value).getTime()) / 86_400_000);
  const label = days < 1 ? "<1 ngày" : `${days.toFixed(1)} ngày`;
  const tone = days <= 1 ? "fresh" : days <= 5 ? "warning" : "danger";
  return { label, tone };
}

async function exportPivot(data: ReturnPivotData, rows: ReturnPivotData["rows"]) {
  const XLSX = await import("xlsx");
  const header = ["Rider", "ID", "KV", "Quận", "Phường", "Zone Pick", "Tổng"];
  const body = rows.map((rider) => [
    rider.riderName,
    rider.riderCode,
    rider.kv || "Chưa rõ",
    rider.district || "—",
    rider.ward || "—",
    rider.pickupZones.length ? rider.pickupZones.join(", ") : "—",
    rider.orders.total,
  ]);
  const summaryRow = [
    "Tổng (đã gán · chưa trả)",
    "",
    "",
    "",
    "",
    "",
    rows.reduce((sum, rider) => sum + rider.orders.total, 0),
  ];

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body, summaryRow]);
  sheet["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 22 }, { wch: 8 }];
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [unassigning, setUnassigning] = useState<string | null>(null);

  const baseRows = useMemo(
    () => data.rows.filter((rider) => rider.orders.cot1 + rider.orders.cot2 > 0),
    [data.rows],
  );

  const [kvFilter, setKvFilter] = useState("all");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [wardFilter, setWardFilter] = useState("all");
  const [query, setQuery] = useState("");

  const kvOptions = useMemo(() => Array.from(new Set(baseRows.map((r) => r.kv).filter(Boolean))).sort(), [baseRows]);
  const districtOptions = useMemo(
    () => Array.from(new Set(baseRows.flatMap((r) => r.orderDistricts).filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")),
    [baseRows],
  );
  const wardOptions = useMemo(
    () =>
      Array.from(
        new Set(
          baseRows
            .filter((r) => districtFilter === "all" || r.orderDistricts.includes(districtFilter))
            .flatMap((r) => r.orderWards)
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "vi")),
    [baseRows, districtFilter],
  );

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return baseRows.filter((r) => {
      if (kvFilter !== "all" && r.kv !== kvFilter) return false;
      if (districtFilter !== "all" && !r.orderDistricts.includes(districtFilter)) return false;
      if (wardFilter !== "all" && !r.orderWards.includes(wardFilter)) return false;
      if (q && ![r.riderName, r.riderCode, r.district, r.ward, r.kv, ...r.pickupZones, ...r.orderDistricts, ...r.orderWards].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [baseRows, kvFilter, districtFilter, wardFilter, query]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportPivot(data, filteredRows);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Không thể xuất file Excel");
    } finally {
      setExporting(false);
    }
  }, [data, filteredRows]);

  const handleUnassign = useCallback(async (rider: ReturnPivotData["rows"][number]) => {
    const ids = [...rider.orders.cot1Ids, ...rider.orders.cot2Ids];
    if (!ids.length) return;
    if (!window.confirm(`Gỡ gán ${ids.length} đơn của ${rider.riderName} (${rider.riderCode})? Đơn sẽ về lại "Chưa phân".`)) return;
    setUnassigning(rider.riderCode);
    try {
      for (const shipmentId of ids) {
        const res = await fetch("/api/return-orders/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shipment_id: shipmentId, rider_code: null }),
        });
        const j = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
        if (!res.ok || !j?.success) throw new Error(j?.error || "Không thể gỡ gán");
      }
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Không thể gỡ gán");
    } finally {
      setUnassigning(null);
    }
  }, []);

  const assigned = filteredRows.reduce((sum, rider) => sum + rider.orders.total, 0);
  const cot1 = filteredRows.reduce((sum, rider) => sum + rider.orders.cot1, 0);
  const cot2 = filteredRows.reduce((sum, rider) => sum + rider.orders.cot2, 0);
  const maxTotal = Math.max(1, ...filteredRows.map((r) => r.orders.total));

  return (
    <section className="return-pivot-board" aria-labelledby="return-pivot-title">
      <div className="return-pivot-hero">
        <div className="return-pivot-hero-main">
          <p className="return-pivot-kicker">RETURN DISPATCH · ĐÃ GÁN · CHƯA TRẢ</p>
          <h2 id="return-pivot-title">Phân công hàng trả theo rider</h2>
          <p className="return-pivot-desc">Chỉ rider có đơn COT đang chờ xử lý — đã ẩn Chưa phân. Dùng lọc để thu hẹp theo KV/quận/phường.</p>
          <div className="return-pivot-hero-meta">
            <span><UsersRound size={12} aria-hidden="true" /> {filteredRows.length} rider</span>
            <span><FileSpreadsheet size={12} aria-hidden="true" /> {assigned} đơn</span>
            <span>· COT1 {cot1} · COT2 {cot2}</span>
          </div>
        </div>
        <div className="return-pivot-hero-stats">
          <div className="is-primary">
            <small>Đơn đã gán</small>
            <strong>{assigned.toLocaleString("vi-VN")}</strong>
            <span className="return-pivot-hero-bar" aria-hidden="true"><i style={{ width: `${assigned ? (cot1 / assigned) * 100 : 0}%` }} /><i className="is-cot2" style={{ width: `${assigned ? (cot2 / assigned) * 100 : 0}%` }} /></span>
            <small>COT1 {cot1} · COT2 {cot2}</small>
          </div>
          <div>
            <small>Rider đã gán</small>
            <strong>{filteredRows.length.toLocaleString("vi-VN")}</strong>
            <small>{filteredRows.filter((r) => r.cot === "COT1").length} COT1 · {filteredRows.filter((r) => r.cot === "COT2").length} COT2</small>
          </div>
        </div>
        <button
          type="button"
          className={cn("return-pivot-export is-hero is-creative is-luxury", exporting && "is-loading", exportError && "is-error")}
          disabled={exporting || filteredRows.length === 0}
          onClick={() => void handleExport()}
          aria-label="Xuất Excel"
        >
          <span className="return-pivot-export-icon" aria-hidden="true">
            {exporting ? <LoaderCircle size={16} className="animate-spin" /> : <FileSpreadsheet size={14} />}
          </span>
          <span className="return-pivot-export-text">
            <strong>{exporting ? "Đang xuất…" : "Xuất Excel"}</strong>
          </span>
        </button>
      </div>

      <section className="return-pivot-filter" aria-label="Tìm và lọc">
        <div className="return-pivot-filter-head">
          <div>
            <p className="return-pivot-filter-kicker">03 / FIND & SORT</p>
            <h3>Tìm & lọc rider</h3>
          </div>
          <p className="return-pivot-filter-desc">Thu hẹp theo KV, quận, phường — zone pick được tìm trong search.</p>
        </div>
        <div className="return-pivot-filter-bar">
          <label className="return-pivot-search">
            <Search size={16} aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm rider, mã, quận, phường, zone…" aria-label="Tìm rider" />
            {query ? (
              <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setQuery("")}>
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div className="return-pivot-filter-selects">
            <select value={kvFilter} onChange={(event) => setKvFilter(event.target.value)} aria-label="Lọc KV">
              <option value="all">Tất cả KV</option>
              {kvOptions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <select
              value={districtFilter}
              onChange={(event) => {
                setDistrictFilter(event.target.value);
                setWardFilter("all");
              }}
              aria-label="Lọc quận"
            >
              <option value="all">Tất cả quận</option>
              {districtOptions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <select value={wardFilter} onChange={(event) => setWardFilter(event.target.value)} aria-label="Lọc phường">
              <option value="all">Tất cả phường</option>
              {wardOptions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {exportError ? (
        <p className="return-pivot-error" role="alert"><CircleAlert size={14} aria-hidden="true" />{exportError}</p>
      ) : null}

      <div className="return-table-wrap">
        <table className="return-table return-pivot-table is-filtered">
          <thead>
            <tr>
              <th scope="col" style={{ width: "2.2rem" }} aria-label="Mở mã đơn"></th>
              <th scope="col">Rider & Khu vực</th>
              <th scope="col" style={{ width: "5.5rem" }}>KV</th>
              <th scope="col">Zone Pick</th>
              <th scope="col" style={{ width: "6.5rem" }}>Aging</th>
              <th scope="col" className="is-num" style={{ width: "7rem" }}>Tổng</th>
              <th scope="col" style={{ width: "7.5rem" }}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((rider) => {
              const isOpen = expanded.has(rider.riderCode);
              const allIds = [...rider.orders.cot1Ids, ...rider.orders.cot2Ids];
              const initials = rider.riderName.split(" ").filter(Boolean).slice(-2).map((w) => w[0]).join("").toUpperCase() || "•";
              const pct = (rider.orders.total / maxTotal) * 100;
              return (
                <React.Fragment key={rider.riderCode}>
                  <tr className={cn(isOpen && "is-expanded")}>
                    <td>
                      <button
                        type="button"
                        aria-label={isOpen ? "Thu gọn mã đơn" : "Mở mã đơn"}
                        aria-expanded={isOpen}
                        onClick={() =>
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(rider.riderCode)) next.delete(rider.riderCode);
                            else next.add(rider.riderCode);
                            return next;
                          })
                        }
                        className={cn("return-pivot-expand", isOpen && "is-open")}
                      >
                        <ChevronDown size={14} className={cn("transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
                      </button>
                    </td>
                    <td data-label="Rider">
                      <div className="return-pivot-rider">
                        <span className="return-pivot-avatar" aria-hidden="true">{initials}</span>
                        <div>
                          <strong>{rider.riderName || "Chưa có tên"}</strong>
                          <span className="return-pivot-sub">
                            <span className="return-code">{rider.riderCode}</span> · {rider.district || "—"}
                            {rider.ward ? ` · ${rider.ward}` : ""} · {rider.cot || "Chưa rõ COT"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td data-label="KV"><span className={cn("return-pivot-kv", rider.kv === "KV5" ? "is-kv5" : rider.kv === "KV6" ? "is-kv6" : "is-none")}>{kvLabel(rider.kv)}</span></td>
                    <td data-label="Zone Pick">
                      <div className="return-pivot-zones">
                        {rider.pickupZones.length ? (
                          <>
                            {rider.pickupZones.slice(0, 3).map((z) => (
                              <span key={z} className="return-pivot-zone-chip">{z}</span>
                            ))}
                            {rider.pickupZones.length > 3 ? <span className="return-pivot-zone-more">+{rider.pickupZones.length - 3}</span> : null}
                          </>
                        ) : (
                          <span className="return-pivot-zone-empty">—</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Aging">
                      {(() => {
                        const a = aging(rider.oldestAt);
                        return <span className={cn("return-pivot-aging", `is-${a.tone}`)}>{a.label}</span>;
                      })()}
                    </td>
                    <td data-label="Tổng" className="is-num">
                      <div className="return-pivot-total">
                        <strong>{rider.orders.total.toLocaleString("vi-VN")}</strong>
                        <span className="return-pivot-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
                      </div>
                    </td>
                    <td data-label="Hành động">
                      <div className="return-pivot-actions">
                        <button
                          type="button"
                          className={cn("return-pivot-action", isOpen && "is-active")}
                          aria-pressed={isOpen}
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(rider.riderCode)) next.delete(rider.riderCode);
                              else next.add(rider.riderCode);
                              return next;
                            })
                          }
                        >
                          {isOpen ? "Thu gọn" : "Xem đơn"}
                        </button>
                        <button
                          type="button"
                          className="return-pivot-action is-danger"
                          disabled={unassigning === rider.riderCode}
                          onClick={() => void handleUnassign(rider)}
                        >
                          {unassigning === rider.riderCode ? "Đang gỡ…" : "Gỡ gán"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr className="return-pivot-details">
                      <td colSpan={7}>
                        <div className="return-pivot-orders">
                          <span className="return-pivot-orders-label">Mã đơn ({allIds.length}):</span>
                          <div className="return-pivot-orders-list">
                            {rider.orders.cot1Ids.map((id) => (
                              <span key={`c1-${id}`} className="return-pivot-order-chip is-cot1">{id}</span>
                            ))}
                            {rider.orders.cot2Ids.map((id) => (
                              <span key={`c2-${id}`} className="return-pivot-order-chip is-cot2">{id}</span>
                            ))}
                            {allIds.length === 0 ? <span className="return-pivot-order-empty">Không có mã đơn chi tiết cho rider này trong snapshot hiện tại.</span> : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
            {!filteredRows.length ? (
              <tr>
                <td colSpan={7} className="return-empty">
                  <strong>Không có rider đã gán đang chờ trả.</strong>
                  <span>Thử đổi bộ lọc quận/phường/khu vực hoặc tìm tên khác.</span>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
});
