import type { CSSProperties } from "react";

type ReturningRider = {
  id: string;
  name: string;
  total: number;
  cots: string[];
  areas: string[];
};

type ReturningRiderBoardProps = {
  riders: ReturningRider[];
  totalOrders: number;
};

type RiderLoadStyle = CSSProperties & {
  "--return-rider-load": string;
};

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "R";
  return words.slice(-2).map((word) => word[0]).join("").toLocaleUpperCase("vi");
}

export function ReturningRiderBoard({ riders, totalOrders }: ReturningRiderBoardProps) {
  if (!riders.length) return null;
  const maxLoad = Math.max(...riders.map((rider) => rider.total), 1);

  return (
    <section className="returning-rider-board" aria-labelledby="returning-rider-title">
      <header>
        <div>
          <h2 id="returning-rider-title">Rider đang trả hàng</h2>
          <p>Phân bổ đơn đang xử lý theo rider · FMHub returning 72</p>
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
              <span className="returning-rider-rank" aria-label={`Hạng ${index + 1}`}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="returning-rider-avatar" aria-hidden="true">
                {initials(rider.name)}
              </span>
              <div className="returning-rider-identity">
                <strong>{rider.name || "Chưa có tên rider"}</strong>
                <span>{rider.id}</span>
              </div>
              <div className="returning-rider-assignment">
                <span>
                  <strong>COT</strong>
                  {rider.cots.length ? rider.cots.join(" · ") : "Chưa xác định"}
                </span>
                <span>
                  <strong>KHU VỰC</strong>
                  {rider.areas.length ? rider.areas.join(" · ") : "Chưa map"}
                </span>
              </div>
              <div className="returning-rider-load" aria-label={`${rider.total} đơn đang trả`}>
                <strong>{rider.total.toLocaleString("vi-VN")}</strong>
                <span>đơn</span>
              </div>
              <span
                className="returning-rider-meter"
                style={{ "--return-rider-load": `${load}%` } as RiderLoadStyle}
                aria-hidden="true"
              >
                <span />
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
