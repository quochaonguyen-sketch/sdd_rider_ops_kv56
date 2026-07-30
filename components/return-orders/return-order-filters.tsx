"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ReturnSort = "aging_desc" | "district_ward";

type ReturnOrderFiltersProps = {
  initialQuery: string;
  initialStatus: string;
  initialDistrict: string;
  initialSort: ReturnSort;
  districtOptions: readonly string[];
  pageSize: number;
};

export function ReturnOrderFilters({
  initialQuery,
  initialStatus,
  initialDistrict,
  initialSort,
  districtOptions,
  pageSize,
}: ReturnOrderFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [district, setDistrict] = useState(initialDistrict);
  const [sort, setSort] = useState<ReturnSort>(initialSort);

  const navigate = (nextQuery: string, nextStatus: string, nextDistrict: string, nextSort: ReturnSort) => {
    const params = new URLSearchParams();
    const cleanQuery = nextQuery.trim();
    if (cleanQuery) params.set("q", cleanQuery);
    if (nextStatus) params.set("status", nextStatus);
    if (nextDistrict) params.set("district", nextDistrict);
    if (nextSort !== "district_ward") params.set("sort", nextSort);
    params.set("page", "1");
    params.set("pageSize", String(pageSize));

    startTransition(() => {
      router.replace(`/return-orders?${params.toString()}`, { scroll: false });
    });
  };

  useEffect(() => {
    const unchanged =
      query.trim() === initialQuery &&
      status === initialStatus &&
      district === initialDistrict &&
      sort === initialSort;
    if (unchanged) return;
    const timer = window.setTimeout(() => {
      navigate(query, status, district, sort);
    }, 220);
    return () => window.clearTimeout(timer);
    // `navigate` only closes over stable router/startTransition values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district, initialDistrict, initialQuery, initialSort, initialStatus, query, sort, status]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(query, status, district, sort);
  };

  const handleReset = () => {
    setQuery("");
    setStatus("");
    setDistrict("");
    setSort("district_ward");
    navigate("", "", "", "district_ward");
  };

  return (
    <form className="return-filters" aria-label="Bộ lọc hàng trả" onSubmit={handleSubmit}>
      <label>
        <span>Tra cứu rider hoặc đơn</span>
        <input
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tên rider, Rider ID, mã vận đơn, quận, phường"
        />
      </label>
      <label>
        <span>Trạng thái</span>
        <select name="status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Tất cả</option>
          <option value="backlog">Tồn</option>
          <option value="returning">Đang trả</option>
        </select>
      </label>
      <label>
        <span>Quận người bán</span>
        <select
          name="district"
          value={district}
          onChange={(event) => setDistrict(event.target.value)}
        >
          <option value="">Tất cả quận</option>
          {districtOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Sắp xếp</span>
        <select
          name="sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as ReturnSort)}
        >
          <option value="aging_desc">Aging cao → thấp</option>
          <option value="district_ward">Quận → Phường</option>
        </select>
      </label>
      <div className="return-filter-actions">
        {isPending ? <span className="return-filter-pending" role="status">Đang cập nhật…</span> : null}
        {(query || status || district || sort !== "district_ward") ? (
          <button
            type="button"
            className="return-filter-reset"
            onClick={handleReset}
            disabled={isPending}
          >
            Xóa lọc
          </button>
        ) : null}
      </div>
    </form>
  );
}
