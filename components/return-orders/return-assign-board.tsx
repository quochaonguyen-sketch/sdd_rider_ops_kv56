"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { Check, CheckCircle2, ChevronDown, CircleAlert, LoaderCircle, Sparkles, UserRoundPlus, X } from "lucide-react";
import type { ReturnAssignData } from "@/lib/return-orders/return-orders";
import { cn } from "@/utils/cn";

type ReturnAssignBoardProps = {
  data: ReturnAssignData;
};

type PerOrderState = "idle" | "saving" | "success" | "error";

function kvLabel(value: string) {
  const number = value.match(/\d+/)?.[0];
  return number ? `KV${number}` : value.trim() || "Chưa rõ KV";
}

function cotLabel(value: string) {
  const normalized = value.trim().toUpperCase();
  if (/^COT?1$|^1$/.test(normalized)) return "COT1";
  if (/^COT?2$|^2$/.test(normalized)) return "COT2";
  return "Chưa rõ COT";
}

function normalizeZone(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-_]/g, " ").trim().toLowerCase();
}

function riderMatchesZone(riderZone: string, orderZone: string) {
  if (!riderZone || !orderZone) return false;
  const a = normalizeZone(riderZone);
  const b = normalizeZone(orderZone);
  return a === b || b.includes(a) || a.includes(b);
}

export const ReturnAssignBoard = memo(function ReturnAssignBoard({ data }: ReturnAssignBoardProps) {
  const [selectedRiderId, setSelectedRiderId] = useState<string>("");
  const [selectedShipments, setSelectedShipments] = useState<Set<string>>(new Set());
  const [state, setState] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [perOrder, setPerOrder] = useState<Record<string, { state: PerOrderState; message: string }>>({});

  const selectedRider = useMemo(
    () => data.riders.find((rider) => rider.id === selectedRiderId) ?? null,
    [data.riders, selectedRiderId],
  );

  const unassignedShipments = useMemo(
    () => new Set(data.orders.filter((order) => !order.assignedRider).map((order) => order.shipmentId)),
    [data.orders],
  );
  const filteredOrders = useMemo(() => data.orders, [data.orders]);

  const recommendedByOrder = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const order of data.orders) {
      const recommended = new Set<string>();
      for (const rider of data.riders) {
        if (riderMatchesZone(rider.zone, order.zone)) recommended.add(rider.id);
      }
      map.set(order.shipmentId, recommended);
    }
    return map;
  }, [data.orders, data.riders]);

  const sortedRidersForOrder = useCallback(
    (order: { shipmentId: string; zone: string }) => {
      const recommendedIds = recommendedByOrder.get(order.shipmentId) ?? new Set<string>();
      return [...data.riders].sort((a, b) => {
        const aRec = recommendedIds.has(a.id) ? 0 : 1;
        const bRec = recommendedIds.has(b.id) ? 0 : 1;
        if (aRec !== bRec) return aRec - bRec;
        return a.riderName.localeCompare(b.riderName, "vi");
      });
    },
    [data.riders, recommendedByOrder],
  );

  const selectAllAssigned = useCallback(() => {
    setSelectedShipments((current) => {
      const next = new Set(current);
      for (const id of unassignedShipments) next.add(id);
      return next;
    });
  }, [unassignedShipments]);

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
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/return-orders/assign-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipment_ids: [...selectedShipments],
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
      setState("success");
      setMessage(`Đã gán ${result.assigned_count ?? selectedShipments.size} đơn cho ${selectedRider.riderName}`);
      setSelectedShipments(new Set());
      window.location.reload();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Không thể gán rider");
    }
  }, [selectedRider, selectedShipments]);

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
      setPerOrder((current) => ({ ...current, [shipmentId]: { state: "success", message: `Đã gán ${riderName}` } }));
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setPerOrder((current) => ({
        ...current,
        [shipmentId]: { state: "error", message: error instanceof Error ? error.message : "Không thể gán rider" },
      }));
    }
  }, [data.riders]);

  const selectedOrderRows = data.orders.filter((order) => selectedShipments.has(order.shipmentId));

  return (
    <div className="return-assign-board" data-state={state}>
      <div className="return-assign-controls">
        <label className="return-assign-rider-select">
          <span>Rider nhận trả (KV5 + KV6)</span>
          <select value={selectedRiderId} onChange={(event) => { setSelectedRiderId(event.target.value); setState("idle"); setMessage(""); }}>
            <option value="">Chọn rider...</option>
            {data.riders.map((rider) => (
              <option key={rider.id} value={rider.id}>
                {rider.riderName} · {rider.riderCode} · {ktoolbarLabel(rider)}
              </option>
            ))}
          </select>
        </label>

        <div className="return-assign-actions">
          <span className="return-assign-picked">{selectedShipments.size.toLocaleString("vi-VN")} đơn được chọn</span>
          <button
            type="button"
            className="return-assign-select-all"
            onClick={selectAllAssigned}
            disabled={unassignedShipments.size === 0}
          >
            Chọn hết đơn chưa gán ({unassignedShipments.size.toLocaleString("vi-VN")})
          </button>
          <button
            type="button"
            className="return-assign-submit"
            disabled={!selectedRider || selectedShipments.size === 0 || state === "saving"}
            onClick={() => void handleAssign()}
            data-state={state}
          >
            {state === "saving" ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <UserRoundPlus size={15} aria-hidden="true" />}
            <span>{state === "saving" ? "Đang gán..." : `Gán cho ${selectedRider?.riderName ?? "rider"}`}</span>
          </button>
        </div>
      </div>

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
            {filteredOrders.map((order) => {
              const checked = selectedShipments.has(order.shipmentId);
              const isAssigned = Boolean(order.assignedRider);
              const recommendedIds = recommendedByOrder.get(order.shipmentId) ?? new Set<string>();
              const recommended = recommendedIds.size > 0;
              const sorted = sortedRidersForOrder(order);
              const orderState = perOrder[order.shipmentId];
              return (
                <tr key={order.shipmentId} className={cn(checked && "is-selected", isAssigned && "is-assigned")}>
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
                    <span className="return-dispatch-area">{order.zone || "Chưa có zone"}</span>
                    {recommended ? <small className="return-assign-recommended-badge"><Sparkles size={10} aria-hidden="true" />Có {recommendedIds.size} rider gợi ý</small> : null}
                  </td>
                  <td data-label="Rider hiện tại">
                    {order.assignedRider ? (
                      <span className="return-assign-assigned-rider">
                        <span>{order.assignedRider.riderName}</span>
                        <strong>{kvLabel(order.assignedRider.kv)}</strong>
                      </span>
                    ) : (
                      <span className="return-dispatch-unassigned">Chưa phân</span>
                    )}
                  </td>
                  <td data-label="Gán rider">
                    {isAssigned ? (
                      <span className="return-assign-done"><CheckCircle2 size={15} aria-hidden="true" />Đã gán</span>
                    ) : (
                      <div className="return-assign-one">
                        <button
                          type="button"
                          className="return-assign-one-toggle"
                          aria-haspopup="listbox"
                          aria-expanded={openDropdown === order.shipmentId}
                          onClick={() => setOpenDropdown((current) => current === order.shipmentId ? null : order.shipmentId)}
                        >
                          {orderState?.state === "saving" ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <UserRoundPlus size={14} aria-hidden="true" />}
                          <span>{orderState?.state === "saving" ? "Đang gán..." : "Gán"}</span>
                          <ChevronDown size={13} aria-hidden="true" />
                        </button>
                        {openDropdown === order.shipmentId ? (
                          <div className="return-assign-one-list" role="listbox" aria-label={`Chọn rider cho đơn ${order.shipmentId}`}>
                            <p className="return-assign-one-zone">Zone: {order.zone || "Chưa có zone"}</p>
                            {sorted.map((rider) => {
                              const isRecommended = recommendedIds.has(rider.id);
                              return (
                                <button
                                  key={rider.id}
                                  type="button"
                                  role="option"
                                  aria-selected={false}
                                  className={cn(isRecommended && "is-recommended")}
                                  disabled={orderState?.state === "saving"}
                                  onClick={() => void handleAssignOne(order.shipmentId, rider.id, rider.riderName)}
                                >
                                  <span className="return-assign-one-name">
                                    {rider.riderName}
                                    {isRecommended ? <em><Sparkles size={10} aria-hidden="true" />Gợi ý</em> : null}
                                  </span>
                                  <small>{rider.riderCode} · {ktoolbarLabel(rider)}{rider.zone ? ` · ${rider.zone}` : ""}</small>
                                </button>
                              );
                            })}
                            {orderState?.state === "error" ? (
                              <span className="return-assign-one-error"><CircleAlert size={12} aria-hidden="true" />{orderState.message}</span>
                            ) : null}
                          </div>
                        ) : null}
                        {orderState?.state === "success" ? (
                          <span className="return-assign-one-success"><Check size={13} aria-hidden="true" />{orderState.message}</span>
                        ) : null}
                      </div>
                    )}
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
    </div>
  );
});

function ktoolbarLabel(rider: { kv: string; cot: string }) {
  return `${kvLabel(rider.kv)} · ${cotLabel(rider.cot)}`;
}
