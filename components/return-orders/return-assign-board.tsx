"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownUp, Check, ChevronDown, CircleAlert, LoaderCircle, MapPinned, Search, Sparkles, UserRoundPlus, X } from "lucide-react";
import type { ReturnAssignData } from "@/lib/return-orders/return-orders";
import { cn } from "@/utils/cn";

type ReturnAssignBoardProps = {
  data: ReturnAssignData;
};

type PerOrderState = "idle" | "saving" | "success" | "error";
type OrderSort = "district" | "oldest" | "zone";

function kvLabel(value: string) {
  const number = value.match(/\d+/)?.[0];
  return number ? `KV${number}` : value.trim() || "Chưa rõ KV";
}

function cotLabel(value: string) {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "");
  if (/^(COT)?1$/.test(normalized)) return "COT1";
  if (/^(COT)?2$/.test(normalized)) return "COT2";
  return "Chưa rõ COT";
}

function normalizeZone(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function riderMatchesZone(riderZones: string[], orderZone: string) {
  const target = normalizeZone(orderZone);
  if (!target) return false;
  return riderZones.some((zone) => normalizeZone(zone) === target);
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export const ReturnAssignBoard = memo(function ReturnAssignBoard({ data }: ReturnAssignBoardProps) {
  const router = useRouter();
  const [orders, setOrders] = useState(data.orders);
  const [selectedRiderId, setSelectedRiderId] = useState<string>("");
  const [selectedShipments, setSelectedShipments] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [wardFilter, setWardFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState<OrderSort>("district");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [perOrder, setPerOrder] = useState<Record<string, { state: PerOrderState; message: string }>>({});
  const [dropdownQuery, setDropdownQuery] = useState<Record<string, string>>({});
  const [recentlyAssigned, setRecentlyAssigned] = useState<Set<string>>(new Set());

  useEffect(() => {
    setOrders(data.orders);
  }, [data.orders]);

  const selectedRider = useMemo(
    () => data.riders.find((rider) => rider.id === selectedRiderId) ?? null,
    [data.riders, selectedRiderId],
  );

  const unassignedShipments = useMemo(
    () => new Set(orders.filter((order) => !order.assignedRider).map((order) => order.shipmentId)),
    [orders],
  );
  const districtOptions = useMemo(
    () => Array.from(new Set(orders.map((order) => order.district).filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")),
    [orders],
  );
  const wardOptions = useMemo(
    () => Array.from(new Set(orders.filter((order) => districtFilter === "all" || order.district === districtFilter).map((order) => order.ward).filter(Boolean))).sort((a, b) => a.localeCompare(b, "vi")),
    [orders, districtFilter],
  );
  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return orders
      .filter((order) => {
        const matchesQuery = !normalized || [order.shipmentId, order.district, order.ward, order.area, order.zone]
          .some((value) => value.toLocaleLowerCase("vi").includes(normalized));
        return matchesQuery
          && (districtFilter === "all" || order.district === districtFilter)
          && (wardFilter === "all" || order.ward === wardFilter);
      })
      .sort((a, b) => {
        if (sortOrder === "oldest") return (a.createdTime ?? "").localeCompare(b.createdTime ?? "");
        if (sortOrder === "zone") return a.zone.localeCompare(b.zone, "vi") || a.district.localeCompare(b.district, "vi") || a.ward.localeCompare(b.ward, "vi");
        return a.district.localeCompare(b.district, "vi") || a.ward.localeCompare(b.ward, "vi") || a.zone.localeCompare(b.zone, "vi");
      });
  }, [orders, districtFilter, query, sortOrder, wardFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = useMemo(() => filteredOrders.slice((page - 1) * pageSize, page * pageSize), [filteredOrders, page]);

  useEffect(() => {
    setPage(1);
  }, [query, districtFilter, wardFilter, sortOrder]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const recommendedByOrder = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const order of orders) {
      const recommended = new Set<string>();
      for (const rider of data.riders) {
        if (riderMatchesZone(rider.pickupZones, order.zone)) recommended.add(rider.id);
      }
      map.set(order.shipmentId, recommended);
    }
    return map;
  }, [orders, data.riders]);

  const sortedRidersForOrder = useCallback(
    (order: { shipmentId: string }) => {
      const recommendedIds = recommendedByOrder.get(order.shipmentId) ?? new Set<string>();
      return [...data.riders].sort((a, b) => {
        const aTier = recommendedIds.has(a.id) ? 0 : 1;
        const bTier = recommendedIds.has(b.id) ? 0 : 1;
        if (aTier !== bTier) return aTier - bTier;
        return a.riderName.localeCompare(b.riderName, "vi");
      });
    },
    [data.riders, recommendedByOrder],
  );

  const toggleShipment = useCallback((shipmentId: string) => {
    setState("idle");
    setMessage("");
    setSelectedShipments((current) => {
      const next = new Set(current);
      if (next.has(shipmentId)) next.delete(shipmentId);
      else next.add(shipmentId);
      return next;
    });
  }, []);

  const handleAssign = useCallback(async () => {
    if (!selectedRider || selectedShipments.size === 0) return;
    const ids = new Set(selectedShipments);
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/return-orders/assign-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment_ids: [...ids],
          rider_code: selectedRider.riderCode,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        assigned_count?: number;
        skipped_count?: number;
      } | null;
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Không thể gán rider");
      }
      setOrders((prev) =>
        prev.map((order) =>
          ids.has(order.shipmentId)
            ? { ...order, assignedRider: { id: selectedRider.id, riderCode: selectedRider.riderCode, riderName: selectedRider.riderName, kv: selectedRider.kv, cot: selectedRider.cot } }
            : order,
        ),
      );
      setRecentlyAssigned(new Set(ids));
      window.setTimeout(() => setRecentlyAssigned(new Set()), 1400);
      setState("success");
      setMessage(`Đã gán ${result.assigned_count ?? ids.size} đơn cho ${selectedRider.riderName}`);
      setSelectedShipments(new Set());
      setSelectedRiderId("");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Không thể gán rider");
    }
  }, [selectedRider, selectedShipments, router]);

  const handleAssignOne = useCallback(async (shipmentId: string, riderId: string, riderName: string) => {
    const rider = data.riders.find((item) => item.id === riderId);
    setPerOrder((current) => ({ ...current, [shipmentId]: { state: "saving", message: "" } }));
    setOpenDropdown(null);
    try {
      const response = await fetch("/api/return-orders/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipment_id: shipmentId, rider_code: rider?.riderCode ?? "" }),
      });
      const result = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Không thể gán rider");
      }
      setOrders((prev) =>
        prev.map((order) =>
          order.shipmentId === shipmentId
            ? { ...order, assignedRider: rider ? { id: rider.id, riderCode: rider.riderCode, riderName: rider.riderName, kv: rider.kv, cot: rider.cot } : { id: riderId, riderCode: "", riderName, kv: "", cot: "" } }
            : order,
        ),
      );
      setRecentlyAssigned((prev) => new Set(prev).add(shipmentId));
      window.setTimeout(() => {
        setRecentlyAssigned((prev) => {
          const next = new Set(prev);
          next.delete(shipmentId);
          return next;
        });
      }, 1400);
      setPerOrder((current) => ({ ...current, [shipmentId]: { state: "success", message: `Đã gán ${riderName}` } }));
      router.refresh();
      window.setTimeout(() => {
        setPerOrder((current) => {
          const next = { ...current };
          delete next[shipmentId];
          return next;
        });
      }, 2500);
    } catch (error) {
      setPerOrder((current) => ({
        ...current,
        [shipmentId]: { state: "error", message: error instanceof Error ? error.message : "Không thể gán rider" },
      }));
    }
  }, [data.riders, router]);

  const selectedOrderRows = orders.filter((order) => selectedShipments.has(order.shipmentId));

  const visibleUnassignedShipments = useMemo(
    () => new Set(filteredOrders.filter((order) => !order.assignedRider).map((order) => order.shipmentId)),
    [filteredOrders],
  );

  const selectAllVisible = useCallback(() => {
    setSelectedShipments((current) => {
      const next = new Set(current);
      for (const id of visibleUnassignedShipments) next.add(id);
      return next;
    });
  }, [visibleUnassignedShipments]);

  return (
    <div className="return-assign-board" data-state={state}>
      <section className="return-assign-filter-panel" aria-label="Lọc và sắp xếp đơn chờ gán">
        <div className="return-assign-filter-heading">
          <p>01 / FIND & SORT</p>
          <h2>Thu hẹp danh sách đơn</h2>
          <span>Zone trả khớp chính xác sẽ được đánh dấu trong cột Gán rider.</span>
        </div>
        <div className="return-assign-filter-grid">
          <label className="return-assign-filter-search">
            <span>Tìm đơn / zone / phường</span>
            <span className="return-assign-search-control">
              <Search size={15} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mã đơn, GV_P5_SDD..." />
            </span>
          </label>
          <label>
            <span>Quận</span>
            <select value={districtFilter} onChange={(event) => { setDistrictFilter(event.target.value); setWardFilter("all"); }}>
              <option value="all">Tất cả quận</option>
              {districtOptions.map((district) => <option key={district} value={district}>{district}</option>)}
            </select>
          </label>
          <label>
            <span>Phường</span>
            <select value={wardFilter} onChange={(event) => setWardFilter(event.target.value)}>
              <option value="all">Tất cả phường</option>
              {wardOptions.map((ward) => <option key={ward} value={ward}>{ward}</option>)}
            </select>
          </label>
          <label>
            <span>Sắp xếp</span>
            <span className="return-assign-sort-control">
              <ArrowDownUp size={14} aria-hidden="true" />
              <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as OrderSort)}>
                <option value="district">Quận · phường · zone</option>
                <option value="oldest">Đơn cũ nhất trước</option>
                <option value="zone">Zone trả A → Z</option>
              </select>
            </span>
          </label>
        </div>
        <div className="return-assign-filter-footer">
          <span>{filteredOrders.length.toLocaleString("vi-VN")} / {orders.length.toLocaleString("vi-VN")} đơn · {unassignedShipments.size.toLocaleString("vi-VN")} chưa gán</span>
          <button type="button" className="return-assign-select-all" onClick={selectAllVisible} disabled={visibleUnassignedShipments.size === 0}>
            Chọn đơn đang lọc ({visibleUnassignedShipments.size.toLocaleString("vi-VN")})
          </button>
        </div>
      </section>

      {message ? (
        <p className={cn("return-assign-message", `is-${state}`)} role={state === "error" ? "alert" : "status"}>
          {state === "error" ? <CircleAlert size={14} aria-hidden="true" /> : state === "success" ? <Check size={14} aria-hidden="true" /> : null}
          {message}
        </p>
      ) : null}

      {selectedOrderRows.length ? (
        <div className="return-assign-selection">
          <header>
            <span>Đang chọn</span>
            <strong>{selectedOrderRows.length.toLocaleString("vi-VN")} đơn</strong>
            <button type="button" onClick={() => setSelectedShipments(new Set())}>
              <X size={14} aria-hidden="true" />
              Bỏ chọn
            </button>
          </header>
          <div className="return-assign-batch">
            <label className="return-assign-rider-select">
              <span>Gán các đơn đã chọn cho</span>
              <select value={selectedRiderId} onChange={(event) => { setSelectedRiderId(event.target.value); setState("idle"); setMessage(""); }}>
                <option value="">Chọn rider...</option>
                {data.riders.map((rider) => <option key={rider.id} value={rider.id}>{rider.riderName} · {rider.riderCode} · {ktoolbarLabel(rider)}</option>)}
              </select>
            </label>
            <button type="button" className="return-assign-submit" disabled={!selectedRider || selectedShipments.size === 0 || state === "saving"} onClick={() => void handleAssign()} data-state={state}>
              {state === "saving" ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <UserRoundPlus size={15} aria-hidden="true" />}
              <span>{state === "saving" ? "Đang gán..." : `Gán cho ${selectedRider?.riderName ?? "rider"}`}</span>
            </button>
          </div>
          <ol>
            {selectedOrderRows.map((order) => (
              <li key={order.shipmentId}>
                <strong className="return-code">{order.shipmentId}</strong>
                <span>{order.ward || "Chưa xác định phường"}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="return-table-wrap">
        <table className="return-table return-assign-table">
          <thead>
            <tr>
              <th scope="col" className="is-check"><span className="sr-only">Chọn</span></th>
              <th scope="col">Mã đơn</th>
              <th scope="col">Quận / phường</th>
              <th scope="col">Khu vực</th>
              <th scope="col">Zone trả</th>
              <th scope="col">Rider hiện tại</th>
              <th scope="col">Gán rider</th>
              <th scope="col">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {paginatedOrders.map((order) => {
              const checked = selectedShipments.has(order.shipmentId);
              const isAssigned = Boolean(order.assignedRider);
              const recommendedIds = recommendedByOrder.get(order.shipmentId) ?? new Set<string>();
              const recommended = recommendedIds.size > 0;
              const sorted = sortedRidersForOrder(order);
              const orderState = perOrder[order.shipmentId];
              const isJustAssigned = recentlyAssigned.has(order.shipmentId);
              return (
                <tr key={order.shipmentId} className={cn(checked && "is-selected", isAssigned && "is-assigned", isJustAssigned && "is-just-assigned")}>
                  <td className="is-check">
                    <input
                      type="checkbox"
                      aria-label={`Chọn đơn ${order.shipmentId}`}
                      checked={checked}
                      onChange={() => toggleShipment(order.shipmentId)}
                    />
                  </td>
                  <td data-label="Mã đơn"><strong className="return-shipment">{order.shipmentId}</strong></td>
                  <td data-label="Quận / phường">
                    <strong>{order.district || "Chưa xác định quận"}</strong>
                    <span>{order.ward || "Chưa xác định phường"}</span>
                  </td>
                  <td data-label="Khu vực"><span className="return-dispatch-area">{order.area || "Chưa rõ"}</span></td>
                  <td data-label="Zone trả">
                    <div className="return-zone-cell">
                      {order.zone?.trim() ? (
                        <span className="return-zone-code">{order.zone}</span>
                      ) : (
                        <span className="return-zone-code is-empty"><MapPinned size={12} aria-hidden="true" />Chưa định tuyến</span>
                      )}
                      {recommended ? (
                        <span className="return-zone-badge is-ok"><Sparkles size={10} aria-hidden="true" />{recommendedIds.size} khớp tuyến</span>
                      ) : order.zone?.trim() ? (
                        <span className="return-zone-badge is-warn"><CircleAlert size={10} aria-hidden="true" />Không khớp</span>
                      ) : (
                        <span className="return-zone-badge is-empty"><CircleAlert size={10} aria-hidden="true" />Chưa có zone</span>
                      )}
                    </div>
                  </td>
                  <td data-label="Rider hiện tại">
                    {order.assignedRider ? (
                      <div className="return-rider-cell is-assigned">
                        <span className="return-rider-name">{order.assignedRider.riderName}</span>
                        <span className="return-rider-meta">
                          <span className="return-rider-kv">{kvLabel(order.assignedRider.kv)}</span>
                          <span className={`return-rider-cot ${cotLabel(order.assignedRider.cot) === "COT1" ? "is-cot1" : cotLabel(order.assignedRider.cot) === "COT2" ? "is-cot2" : "is-none"}`}>{cotLabel(order.assignedRider.cot)}</span>
                        </span>
                      </div>
                    ) : (
                      <span className="return-rider-cell is-empty"><UserRoundPlus size={12} aria-hidden="true" />Chưa phân</span>
                    )}
                  </td>
                  <td data-label="Gán rider">
                    <div className="return-assign-one">
                        {(() => {
                          return (
                            <>
                              <button
                                type="button"
                                className={cn("return-assign-one-toggle", isAssigned && "is-change", !recommended && !isAssigned && "is-empty")}
                                aria-haspopup="listbox"
                                aria-expanded={openDropdown === order.shipmentId}
                                onClick={() => setOpenDropdown((current) => current === order.shipmentId ? null : order.shipmentId)}
                              >
                                {orderState?.state === "saving" ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : recommended ? <Sparkles size={14} aria-hidden="true" /> : <UserRoundPlus size={14} aria-hidden="true" />}
                                <span>{orderState?.state === "saving" ? "Đang gán..." : isAssigned ? "Đổi rider" : recommended ? `Gán · ${recommendedIds.size} đúng zone` : "Chọn rider"}</span>
                                <ChevronDown size={13} aria-hidden="true" />
                              </button>
                              {openDropdown === order.shipmentId ? (() => {
                                const q = dropdownQuery[order.shipmentId] ?? "";
                                const nq = normalizeText(q);
                                const filtered = nq
                                  ? sorted.filter((r) => normalizeText(`${r.riderName} ${r.riderCode} ${r.kv} ${r.cot} ${r.pickupZones.join(" ")}`).includes(nq))
                                  : sorted;
                                const visible = filtered.slice(0, 20);
                                const recVisible = visible.filter((r) => recommendedIds.has(r.id));
                                const restVisible = visible.filter((r) => !recommendedIds.has(r.id));
                                return (
                                  <div className="return-assign-one-list" role="listbox" aria-label={`Chọn rider cho đơn ${order.shipmentId}`}>
                                    <p className="return-assign-one-zone">
                                      {!order.zone?.trim() ? (
                                        <><CircleAlert size={12} aria-hidden="true" />Chưa có zone — chọn rider thủ công</>
                                      ) : recommended ? (
                                        <>Zone trả: {order.zone} · {recommendedIds.size} rider đúng zone</>
                                      ) : (
                                        <>Zone trả: {order.zone} · chưa có rider cùng zone</>
                                      )}
                                    </p>
                                    <label className="return-assign-one-search">
                                      <Search size={14} aria-hidden="true" />
                                      <input
                                        value={q}
                                        onChange={(event) => setDropdownQuery((prev) => ({ ...prev, [order.shipmentId]: event.target.value }))}
                                        placeholder="Tìm rider (tên, mã, COT, KV, zone)…"
                                        aria-label={`Tìm rider cho đơn ${order.shipmentId}`}
                                      />
                                      {q ? (
                                        <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setDropdownQuery((prev) => ({ ...prev, [order.shipmentId]: "" }))}>
                                          <X size={12} aria-hidden="true" />
                                        </button>
                                      ) : null}
                                    </label>
                                    {nq ? null : recommended ? <p className="return-assign-one-group-label"><Sparkles size={11} aria-hidden="true" /> Gợi ý theo tuyến</p> : null}
                                    {recVisible.map((rider) => (
                                      <button
                                        key={`rec-${rider.id}`}
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        className="is-recommended"
                                        disabled={orderState?.state === "saving"}
                                        onClick={() => void handleAssignOne(order.shipmentId, rider.id, rider.riderName)}
                                      >
                                        <span className="return-assign-one-name">
                                          {rider.riderName}
                                          <em><Sparkles size={10} aria-hidden="true" />Khớp tuyến</em>
                                        </span>
                                        <small>{rider.riderCode} · {ktoolbarLabel(rider)}{rider.pickupZones.length ? ` · Pick: ${rider.pickupZones.join(", ")}` : ""}</small>
                                      </button>
                                    ))}
                                    {nq ? null : !recommended ? <p className="return-assign-one-group-label">Tất cả rider · chọn thủ công</p> : restVisible.length ? <p className="return-assign-one-group-label">Tất cả rider</p> : null}
                                    {restVisible.map((rider) => (
                                      <button
                                        key={rider.id}
                                        type="button"
                                        role="option"
                                        aria-selected={false}
                                        disabled={orderState?.state === "saving"}
                                        onClick={() => void handleAssignOne(order.shipmentId, rider.id, rider.riderName)}
                                      >
                                        <span className="return-assign-one-name">{rider.riderName}</span>
                                        <small>{rider.riderCode} · {ktoolbarLabel(rider)}{rider.pickupZones.length ? ` · Pick: ${rider.pickupZones.join(", ")}` : ""}</small>
                                      </button>
                                    ))}
                                    {filtered.length === 0 ? <span className="return-assign-one-empty">Không tìm thấy rider phù hợp</span> : null}
                                    {filtered.length > 20 ? <small className="return-assign-one-more">Hiển thị 20 / {filtered.length} — gõ để lọc tiếp</small> : null}
                                    {orderState?.state === "error" ? (
                                      <span className="return-assign-one-error"><CircleAlert size={12} aria-hidden="true" />{orderState.message}</span>
                                    ) : null}
                                  </div>
                                );
                              })() : null}
                            </>
                          );
                        })()}
                        {orderState?.state === "success" ? (
                          <span className="return-assign-one-success"><Check size={13} aria-hidden="true" />{orderState.message}</span>
                        ) : null}
                    </div>
                  </td>
                  <td data-label="Trạng thái">
                    <span className={cn("return-dispatch-status", order.status === 72 ? "is-returning" : "is-backlog")}>
                      {order.status === 72 ? "Đang trả" : "Tồn"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {!filteredOrders.length ? (
              <tr>
                <td colSpan={8} className="return-empty">
                  <strong>Không có đơn tồn trong phạm vi.</strong>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="return-assign-pagination">
        <span>{filteredOrders.length.toLocaleString("vi-VN")} đơn · Trang {page}/{pageCount}</span>
        <div>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Trước</button>
          <span>Trang {page}/{pageCount}</span>
          <button type="button" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Sau</button>
        </div>
      </div>
    </div>
  );
});

function ktoolbarLabel(rider: { kv: string; cot: string }) {
  return `${kvLabel(rider.kv)} · ${cotLabel(rider.cot)}`;
}
