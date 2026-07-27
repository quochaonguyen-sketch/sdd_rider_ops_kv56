"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ReturnOrderFiltersProps = {
  initialQuery: string;
  initialStatus: string;
  initialDistrict: string;
  districtOptions: readonly string[];
  pageSize: number;
};

export function ReturnOrderFilters({
  initialQuery,
  initialStatus,
  initialDistrict,
  districtOptions,
  pageSize,
}: ReturnOrderFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [district, setDistrict] = useState(initialDistrict);

  const navigate = (nextQuery: string, nextStatus: string, nextDistrict: string) => {
    const params = new URLSearchParams();
    const cleanQuery = nextQuery.trim();
    if (cleanQuery) params.set("q", cleanQuery);
    if (nextStatus) params.set("status", nextStatus);
    if (nextDistrict) params.set("district", nextDistrict);
    params.set("page", "1");
    params.set("pageSize", String(pageSize));

    startTransition(() => {
      router.replace(`/return-orders?${params.toString()}`, { scroll: false });
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(query, status, district);
  };

  const handleReset = () => {
    setQuery("");
    setStatus("");
    setDistrict("");
    navigate("", "", "");
  };

  return (
    <form className="return-filters" aria-label="Bộ lọc hàng trả" onSubmit={handleSubmit}>
      <label>
        <span>Từ khóa</span>
        <input
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Mã vận đơn, Shopee, phường, khu vực"
        />
      </label>
      <label>
        <span>Trạng thái đơn</span>
        <select name="status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Tất cả trạng thái</option>
          <option value="67">67 · FMHub received</option>
          <option value="10">10 · LMHub received</option>
          <option value="72">72 · FMHub returning</option>
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
      <div className="return-filter-actions">
        <button type="submit" disabled={isPending} aria-busy={isPending}>
          {isPending ? "Đang tra cứu…" : "Tra cứu đơn"}
        </button>
        {(initialQuery || initialStatus || initialDistrict) ? (
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
