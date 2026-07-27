import Link from "next/link";
import { ProtectedPage } from "@/components/layout/protected-page";
import { ReturnOrderFilters } from "@/components/return-orders/return-order-filters";
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

function statusTone(status: number) {
  if (status === 67) return "fm";
  if (status === 10) return "lm";
  if (status === 72) return "returning";
  return "other";
}

function ReturnRiders({ status, driverId, driverName, cot1, cot2 }: { status: number; driverId: string; driverName: string; cot1: string; cot2: string }) {
  if (status === 72 && driverId) {
    const activeCots = getReturnDriverCots(driverId, driverName, cot1, cot2);
    return (
      <div className="return-riders is-returning">
        <span><strong>ĐANG TRẢ</strong>{driverId} · {driverName || "Chưa có tên"}</span>
        <span><strong>COT</strong>{activeCots.length ? activeCots.join(" · ") : "Chưa xác định"}</span>
      </div>
    );
  }
  if (!cot1 && !cot2) return <span className="return-unassigned">Chưa phân rider</span>;
  return (
    <div className="return-riders">
      {cot1 ? <span><strong>COT1</strong>{cot1}</span> : null}
      {cot2 ? <span><strong>COT2</strong>{cot2}</span> : null}
    </div>
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

      <dl className="return-stats" aria-label="Tổng quan trạng thái hàng trả">
        <div>
          <dt>Đơn trạng thái 67 + 10 + 72</dt>
          <dd>{result.summary.total.toLocaleString("vi-VN")}</dd>
        </div>
        <div className="is-fm">
          <dt><span aria-hidden="true" />FMHub received · 67</dt>
          <dd>{result.summary.fmHub.toLocaleString("vi-VN")}</dd>
        </div>
        <div className="is-lm">
          <dt><span aria-hidden="true" />LMHub received · 10</dt>
          <dd>{result.summary.lmHub.toLocaleString("vi-VN")}</dd>
        </div>
        <div className="is-returning">
          <dt><span aria-hidden="true" />FMHub returning · 72</dt>
          <dd>{result.summary.returning.toLocaleString("vi-VN")}</dd>
        </div>
        <div className="is-mapped">
          <dt><span aria-hidden="true" />Đơn đã map KV5/KV6</dt>
          <dd>{result.summary.mapped.toLocaleString("vi-VN")}</dd>
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
        key={`${filters.q}:${filters.status}:${filters.district}:${filters.pageSize}`}
        initialQuery={filters.q}
        initialStatus={filters.status}
        initialDistrict={filters.district}
        districtOptions={RETURN_ORDER_DISTRICTS}
        pageSize={filters.pageSize}
      />

      <div className="return-ledger">
        <header>
          <div>
            <h2>Sổ đơn trả</h2>
            <p>{result.total.toLocaleString("vi-VN")} kết quả phù hợp</p>
          </div>
          <span>Trang {result.page}/{pages}</span>
        </header>
        <div className="return-table-wrap">
          <table className="return-table">
            <thead>
              <tr>
                <th scope="col">Đơn hàng</th>
                <th scope="col">Trạng thái</th>
                <th scope="col">Người bán</th>
                <th scope="col">Điểm nhận</th>
                <th scope="col">Kế hoạch trả</th>
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
                    </td>
                    <td data-label="Trạng thái">
                      <span className={`return-status is-${statusTone(row.order_status)}`}>
                        <strong>{row.order_status}</strong>
                        {row.status_label || "Chưa có nhãn"}
                      </span>
                      <span className={`return-aging is-${orderAging.tone}`}>{orderAging.label}</span>
                    </td>
                    <td data-label="Người bán">
                      <strong>{row.seller_new_ward || row.seller_ward || "Chưa xác định phường"}</strong>
                      <span>{row.seller_district || "Chưa xác định quận"} · {row.seller_area || "Chưa map khu vực"}</span>
                      {row.seller_new_ward && row.seller_ward && row.seller_new_ward !== row.seller_ward ? <small>Phường cũ · {row.seller_ward}</small> : null}
                      <small>Address ID · {row.lowest_seller_address_id || "—"}</small>
                    </td>
                    <td data-label="Điểm nhận">
                      <span className="return-code">{row.pickup_point_id || "Chưa có pickup point"}</span>
                      <span>{row.pickup_station_name || row.current_station_name || "Chưa có trạm nhận"}</span>
                    </td>
                    <td data-label="Kế hoạch trả">
                      <span className={row.return_zone ? "return-zone" : "return-unassigned"}>{row.return_zone || "Chưa phân tuyến"}</span>
                      <span className="return-plan-area">
                        <strong>KHU VỰC</strong>
                        {row.seller_area || "Chưa map khu vực"}
                      </span>
                      <ReturnRiders status={row.order_status} driverId={row.return_driver_id} driverName={row.return_driver_name} cot1={row.return_riders_cot1} cot2={row.return_riders_cot2} />
                    </td>
                  </tr>
                );
              })}
              {!result.rows.length ? (
                <tr>
                  <td colSpan={5} className="return-empty">
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
