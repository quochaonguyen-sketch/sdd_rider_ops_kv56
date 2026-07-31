"use client";

import type { CSSProperties, MouseEvent } from "react";
import { useRef, useState } from "react";
import { ChevronRight, Clock3, MapPinned, PackageCheck, X } from "lucide-react";
import type { ReturnOrderResult } from "@/lib/return-orders/return-orders";

type ReturningRider = ReturnOrderResult["summary"]["returningRiders"][number];

type ReturningRiderBoardProps = {
  riders: ReturningRider[];
  totalOrders: number;
};

type RiderLoadStyle = CSSProperties & {
  "--return-rider-load": string;
};

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Ho_Chi_Minh",
});

const shortDateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Ho_Chi_Minh",
});

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "R";
  return words.slice(-2).map((word) => word[0]).join("").toLocaleUpperCase("vi");
}

function kvLabel(value: string) {
  const number = value.match(/\d+/)?.[0];
  return number ? `KV${number}` : value.trim() || "Chưa rõ KV";
}

function formatDateTime(value: string | null, short = false) {
  if (!value) return "Chưa có mốc quét";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có mốc quét";
  return (short ? shortDateTimeFormatter : dateTimeFormatter).format(date);
}

function areaLabel(district: string, ward: string) {
  return [district, ward].filter(Boolean).join(" · ") || "Chưa xác định địa bàn";
}

function uniqueZones(rider: ReturningRider) {
  return [...new Set(rider.planOrders.map((order) => order.zone).filter(Boolean))];
}

export function ReturningRiderBoard({ riders, totalOrders }: ReturningRiderBoardProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selectedRider, setSelectedRider] = useState<ReturningRider | null>(null);
  if (!riders.length) return null;
  const maxLoad = Math.max(...riders.map((rider) => rider.total), 1);

  const openRider = (rider: ReturningRider) => {
    setSelectedRider(rider);
    window.requestAnimationFrame(() => dialogRef.current?.showModal());
  };

  const closeDialog = () => dialogRef.current?.close();
  const closeFromBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) closeDialog();
  };

  return (
    <section className="returning-rider-board" aria-labelledby="returning-rider-title">
      <header>
        <div>
          <h2 id="returning-rider-title">Rider đang trả hàng</h2>
          <p>Bấm vào rider để xem đơn đã quét trả từ lúc nào và kế hoạch trả theo zone/COT.</p>
        </div>
        <dl>
          <div>
            <dt>Đơn đang trả</dt>
            <dd>{totalOrders.toLocaleString("vi-VN")}</dd>
          </div>
          <div>
            <dt>Rider đã nhận</dt>
            <dd>{riders.length.toLocaleString("vi-VN")}</dd>
          </div>
        </dl>
      </header>

      <ol className="returning-rider-board-list">
        {riders.map((rider, index) => {
          const load = Math.max(4, Math.round((rider.total / maxLoad) * 100));
          return (
            <li key={rider.id} className={index === 0 ? "is-lead" : undefined}>
              <button type="button" onClick={() => openRider(rider)}>
                <span className="returning-rider-rank" aria-label={`Hạng ${index + 1}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="returning-rider-avatar" aria-hidden="true">
                  {initials(rider.name)}
                </span>
                <span className="returning-rider-identity">
                  <strong>
                    {rider.name || "Chưa có tên rider"}
                    <span className="returning-rider-kv-inline"> · {kvLabel(rider.kv)}</span>
                  </strong>
                  <span>{rider.id}</span>
                </span>
                <span className="returning-rider-assignment">
                  <span>
                    <strong>COT</strong>
                    {rider.cots.length ? rider.cots.join(" · ") : "Chưa xác định"}
                  </span>
                  <span>
                    <strong>QUÉT TỪ</strong>
                    {formatDateTime(rider.scannedFrom, true)}
                  </span>
                </span>
                <span className="returning-rider-plan-count">
                  <strong>{rider.planOrders.length.toLocaleString("vi-VN")}</strong>
                  <span>đơn kế hoạch</span>
                </span>
                <span className="returning-rider-load" aria-label={`${rider.total} đơn đang trả`}>
                  <strong>{rider.total.toLocaleString("vi-VN")}</strong>
                  <span>đã quét</span>
                </span>
                <span
                  className="returning-rider-meter"
                  style={{ "--return-rider-load": `${load}%` } as RiderLoadStyle}
                  aria-hidden="true"
                >
                  <span />
                </span>
                <ChevronRight className="returning-rider-open-icon" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ol>

      <dialog
        ref={dialogRef}
        className="returning-rider-dialog"
        onClick={closeFromBackdrop}
        onClose={() => setSelectedRider(null)}
      >
        {selectedRider ? (
          <article className="returning-rider-dialog-panel">
            <header>
              <div className="returning-rider-dialog-identity">
                <span className="returning-rider-avatar" aria-hidden="true">
                  {initials(selectedRider.name)}
                </span>
                <div>
                  <p>CHI TIẾT TRẢ HÀNG</p>
                  <h3>{selectedRider.name || "Chưa có tên rider"}</h3>
                  <span>{selectedRider.id} · {kvLabel(selectedRider.kv)}</span>
                </div>
              </div>
              <button type="button" onClick={closeDialog} aria-label="Đóng chi tiết rider">
                <X aria-hidden="true" />
              </button>
            </header>

            <dl className="returning-rider-dialog-stats">
              <div>
                <dt><PackageCheck aria-hidden="true" />Đã quét trả</dt>
                <dd>{selectedRider.scannedOrders.length.toLocaleString("vi-VN")} đơn</dd>
              </div>
              <div>
                <dt><Clock3 aria-hidden="true" />Quét từ</dt>
                <dd>{formatDateTime(selectedRider.scannedFrom)}</dd>
              </div>
              <div>
                <dt><MapPinned aria-hidden="true" />Kế hoạch</dt>
                <dd>{selectedRider.planOrders.length.toLocaleString("vi-VN")} đơn · {uniqueZones(selectedRider).length} zone</dd>
              </div>
            </dl>

            <div className="returning-rider-dialog-columns">
              <section aria-labelledby="rider-scanned-orders-title">
                <header>
                  <div>
                    <p>THỰC TẾ</p>
                    <h4 id="rider-scanned-orders-title">Đơn đã quét trả</h4>
                  </div>
                  <strong>{selectedRider.scannedOrders.length.toLocaleString("vi-VN")}</strong>
                </header>
                <ol className="returning-rider-order-list">
                  {selectedRider.scannedOrders.map((order) => (
                    <li key={order.shipmentId}>
                      <div>
                        <strong>{order.shipmentId}</strong>
                        <span>{order.shopeeOrderSn || "Không có mã Shopee"}</span>
                      </div>
                      <div>
                        <strong>{order.zone || "Chưa có zone"}</strong>
                        <span>{areaLabel(order.district, order.ward)}</span>
                      </div>
                      <time dateTime={order.scannedAt ?? undefined}>
                        {formatDateTime(order.scannedAt)}
                      </time>
                    </li>
                  ))}
                </ol>
              </section>

              <section aria-labelledby="rider-plan-orders-title">
                <header>
                  <div>
                    <p>KẾ HOẠCH THEO ZONE/COT</p>
                    <h4 id="rider-plan-orders-title">Đơn còn chờ trả</h4>
                  </div>
                  <strong>{selectedRider.planOrders.length.toLocaleString("vi-VN")}</strong>
                </header>
                {selectedRider.planOrders.length ? (
                  <ol className="returning-rider-order-list is-plan">
                    {selectedRider.planOrders.map((order) => (
                      <li key={order.shipmentId}>
                        <div>
                          <strong>{order.shipmentId}</strong>
                          <span>{order.shopeeOrderSn || "Không có mã Shopee"}</span>
                        </div>
                        <div>
                          <strong>{order.zone || "Chưa có zone"}</strong>
                          <span>{areaLabel(order.district, order.ward)}</span>
                        </div>
                        <span className={`returning-rider-plan-badge is-${order.assignment}`}>
                          {order.assignment === "manual" ? "Đã gán" : order.cot || "Ứng viên"}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="returning-rider-dialog-empty">
                    <strong>Chưa có đơn trong kế hoạch hiện tại.</strong>
                    <span>Rider không nằm trong danh sách ứng viên của các đơn tồn theo snapshot mới nhất.</span>
                  </div>
                )}
              </section>
            </div>

            <footer>
              <span>Mốc “quét từ” lấy từ thời gian SPX ghi nhận đơn tại trạm (<code>current_station_received_time</code>).</span>
              <button type="button" onClick={closeDialog}>Đóng</button>
            </footer>
          </article>
        ) : null}
      </dialog>
    </section>
  );
}
