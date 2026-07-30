import Link from "next/link";
import { ProtectedPage } from "@/components/layout/protected-page";
import { ReturnOrderFilters } from "@/components/return-orders/return-order-filters";
import { ReturnRiderAssignment } from "@/components/return-orders/return-rider-assignment";
import { ReturningRiderBoard } from "@/components/return-orders/returning-rider-board";
import {
  getReturnDriverCots,
  getReturnOrders,
  parseReturnOrderFilters,
  RETURN_ORDER_DISTRICTS,
} from "@/lib/return-orders/return-orders";

function fmt(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function aging(value: string | null) {
  if (!value) return { label: "Chưa rõ", tone: "unknown" };
  const days = Math.max(0, (Date.now() - new Date(value).getTime()) / 86_400_000);
  const label = days < 1 ? "<1 ngày" : `${days.toFixed(1)} ngày`;
  return { label, tone: days <= 1 ? "fresh" : days <= 5 ? "warning" : "danger" };
}

function kvLabel(value: string) {
  const number = value.match(/\d+/)?.[0];
  return number ? `KV${number}` : value.trim() || "Chưa rõ KV";
}

function assignedRiderCount(value: string) {
  return value.split(/\s*[,;]\s*/).filter(Boolean).length;
}

function RiderAssignment({ value }: { value: string }) {
  const riders = value.split(/\s*[,;]\s*/).filter(Boolean);
  return (
    <span className="return-rider-assignment-list">
      {riders.map((rider, index) => {
        const match = rider.match(/^(.*)\s·\s(KV\d+)$/i);
        return (
          <span className="return-rider-assignment-item" key={`${rider}:${index}`}>
            <span>{match?.[1] ?? rider}</span>
            {match ? <strong className="return-rider-kv-suffix">{match[2].toUpperCase()}</strong> : null}
          </span>
        );
      })}
    </span>
  );
}

function ReturnRiders({ status, driverId, driverName, riderKv, cot1, cot2 }: { status: number; driverId: string; driverName: string; riderKv: string; cot1: string; cot2: string }) {
  if (status === 72 && driverId) {
    const activeCots = getReturnDriverCots(driverId, driverName, cot1, cot2);
    return (
      <div className="return-riders is-returning">
        <div className="return-rider-person">
          <strong>{driverName || "Chưa có tên rider"} · {kvLabel(riderKv)}</strong>
          <small>Rider ID · {driverId}</small>
        </div>
        <span><strong>COT</strong>{activeCots.length ? activeCots.join(" · ") : "Chưa xác định"}</span>
      </div>
    );
  }
  if (!cot1 && !cot2) return <span className="return-unassigned">Chưa phân rider</span>;
  const total = assignedRiderCount(cot1) + assignedRiderCount(cot2);
  return (
    <details className="return-cot-roster">
      <summary>Kế hoạch rider · {total} ứng viên</summary>
      <div className="return-riders">
        {cot1 ? <span><strong>COT1</strong><span><RiderAssignment value={cot1} /></span></span> : null}
        {cot2 ? <span><strong>COT2</strong><span><RiderAssignment value={cot2} /></span></span> : null}
      </div>
    </details>
  );
}

export default async function ReturnOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <ProtectedPage>
      <ReturnOrdersContent searchParams={searchParams} />
    </ProtectedPage>
  );
}

async function ReturnOrdersContent({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const filters = parseReturnOrderFilters(raw);
  let result;
  try {
    result = await getReturnOrders(filters);
  } catch (error) {
    return (
      <section className="return-orders-page">
        <div className="return-error" role="alert">
          <strong>Không tải được dữ liệu hàng trả.</strong>
          <span>{error instanceof Error ? error.message : "Lỗi không xác định"}</span>
        </div>
      </section>
    );
  }
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const linkFor = (page: number) => {
    const query = new URLSearchParams();
    if (filters.q) query.set("q", filters.q);
    if (filters.status) query.set("status", filters.status);
    if (filters.district) query.set("district", filters.district);
    if (filters.sort !== "district_ward") query.set("sort", filters.sort);
    query.set("page", String(page));
    query.set("pageSize", String(filters.pageSize));
    return `/return-orders?${query}`;
  };

  return (
    <section className="return-orders-page">
      <header className="return-title">
        <div className="return-title-copy">
          <p>RETURN OPERATIONS</p>
          <h1>Tra cứu hàng trả</h1>
          <span>Tìm đơn, xác định địa bàn và kiểm tra rider trả hàng trên cùng một sổ vận hành.</span>
        </div>
        <div className="return-sync">
          <span>Dữ liệu snapshot</span>
          <strong>{fmt(result.snapshotAt)}</strong>
          <small>Phường và khu vực suy từ địa chỉ người bán.</small>
        </div>
      </header>

      <dl className="return-stats is-two-state" aria-label="Tổng quan hàng tồn và đang trả">
        <div className="is-backlog">
          <dt><span aria-hidden="true" />Tồn</dt>
          <dd>{(result.summary.fmHub + result.summary.lmHub).toLocaleString("vi-VN")}</dd>
          <small>Đơn đang chờ rider trả</small>
        </div>
        <div className="is-returning">
          <dt><span aria-hidden="true" />Đang trả</dt>
          <dd>{result.summary.returning.toLocaleString("vi-VN")}</dd>
          <small>Đã có rider nhận trả</small>
        </div>
      </dl>

      <ReturningRiderBoard
        riders={result.summary.returningRiders}
        totalOrders={result.summary.returning}
      />

      {Object.keys(result.summary.districts).length ? (
        <div className="return-district-block">
          <h2>Phân bố theo quận</h2>
          <div className="return-district-summary">
            {Object.entries(result.summary.districts).map(([district, total]) => (
              <div key={district} className={filters.district === district ? "is-selected" : undefined}>
                <details>
                  <summary>
                    <span>{district}</span>
                    <strong>{total.toLocaleString("vi-VN")} đơn</strong>
                    <small>{result.summary.wardsByDistrict[district]?.length ?? 0} phường</small>
                  </summary>
                  <ol>
                    {(result.summary.wardsByDistrict[district] ?? []).map((item, index) => (
                      <li key={item.ward}>
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <strong>{item.ward}</strong>
                        <span>{item.total.toLocaleString("vi-VN")} đơn</span>
                      </li>
                    ))}
                  </ol>
                </details>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <ReturnOrderFilters
        key={`${filters.q}:${filters.status}:${filters.district}:${filters.sort}:${filters.pageSize}`}
        initialQuery={filters.q}
        initialStatus={filters.status}
        initialDistrict={filters.district}
        initialSort={filters.sort}
        districtOptions={RETURN_ORDER_DISTRICTS}
        pageSize={filters.pageSize}
      />

      <div className="return-ledger">
        <header>
          <div>
            <h2>Sổ đơn trả</h2>
            <p>{result.total.toLocaleString("vi-VN")} kết quả phù hợp</p>
          </div>
          <span>{filters.sort === "aging_desc" ? "Aging cao → thấp" : "Quận → Phường"} · Trang {result.page}/{pages}</span>
        </header>
        <div className="return-table-wrap">
          <table className="return-table">
            <thead>
              <tr>
                <th scope="col">Đơn hàng</th>
                <th scope="col">Aging</th>
                <th scope="col">Quận / phường ↑</th>
                <th scope="col">Rider trả</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const orderAging = aging(row.create_time);
                return (
                  <tr key={row.shipment_id}>
                    <td data-label="Đơn hàng">
                      <strong className="return-shipment">{row.shipment_id}</strong>
                      <span>Shopee · {row.shopee_order_sn || "—"}</span>
                      <span className={`return-order-state ${row.order_status === 72 ? "is-returning" : "is-backlog"}`}>
                        {row.order_status === 72 ? "Đang trả" : "Tồn"}
                      </span>
                    </td>
                    <td data-label="Aging">
                      <span className={`return-aging is-${orderAging.tone}`}>{orderAging.label}</span>
                      <small>{fmt(row.create_time)}</small>
                    </td>
                    <td data-label="Quận / phường">
                      <strong>{row.seller_district || "Chưa xác định quận"}</strong>
                      <span>{row.seller_new_ward || row.seller_ward || "Chưa xác định phường"}</span>
                      {row.seller_new_ward && row.seller_ward && row.seller_new_ward !== row.seller_ward ? <small>Phường cũ · {row.seller_ward}</small> : null}
                    </td>
                    <td data-label="Rider trả">
                      <span className="return-zone-note">
                        <small>Zone trả</small>
                        <strong>{row.return_zone || "Chưa có zone"}</strong>
                      </span>
                      <ReturnRiders
                        status={row.order_status}
                        driverId={row.return_driver_id}
                        driverName={row.return_driver_profile_name || row.return_driver_name}
                        riderKv={row.return_driver_kv}
                        cot1={row.return_riders_cot1}
                        cot2={row.return_riders_cot2}
                      />
                      <ReturnRiderAssignment
                        key={`${row.shipment_id}:${row.manual_assignment}:${row.return_driver_id}`}
                        shipmentId={row.shipment_id}
                        currentRiderCode={row.return_driver_id}
                        currentRiderName={row.return_driver_profile_name || row.return_driver_name}
                        manualAssignment={row.manual_assignment}
                        returnZone={row.return_zone}
                        sellerArea={row.seller_area}
                      />
                    </td>
                  </tr>
                );
              })}
              {!result.rows.length ? (
                <tr>
                  <td colSpan={4} className="return-empty">
                    <strong>Không tìm thấy đơn phù hợp.</strong>
                    <span>Đổi từ khóa hoặc xóa bộ lọc để xem lại toàn bộ danh sách.</span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <nav className="return-pagination" aria-label="Phân trang đơn trả">
        <span>{result.total.toLocaleString("vi-VN")} kết quả · Trang {result.page}/{pages}</span>
        <div>
          {result.page > 1 ? <Link href={linkFor(result.page - 1)}>Trang trước</Link> : null}
          {result.page < pages ? <Link href={linkFor(result.page + 1)}>Trang sau</Link> : null}
        </div>
      </nav>
    </section>
  );
}
