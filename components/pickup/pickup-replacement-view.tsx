"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCcw, Search } from "lucide-react";
import type { AttendanceLog, Rider } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/utils/cn";

type Replacement = {
  id: string;
  rider_id: string;
  rider_code: string;
  work_date: string;
  replacement_rider_id: string | null;
  replacement_rider_code: string | null;
  status: "ASSIGNED" | "MISSING";
  note: string | null;
};
type ApiResponse = {
  success: boolean;
  can_edit?: boolean;
  replacements?: Replacement[];
  replacement?: Replacement;
  error?: string;
};

export function PickupReplacementView() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [replacements, setReplacements] = useState<Replacement[]>([]);
  const [rangeStart, setRangeStart] = useState(today());
  const [query, setQuery] = useState("");
  const [cot, setCot] = useState("all");
  const [district, setDistrict] = useState("all");
  const [offOnly, setOffOnly] = useState(true);
  const [offFilterDate, setOffFilterDate] = useState(today());
  const [page, setPage] = useState(1);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => shiftDate(rangeStart, index)),
    [rangeStart],
  );
  const rangeEnd = days[6]!;
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const client = createClient();
    const [riderResult, attendanceResult, response] = await Promise.all([
      client
        .from("riders")
        .select("*")
        .eq("status", "active")
        .order("cot")
        .order("full_name"),
      client
        .from("attendance_logs")
        .select("*")
        .gte("work_date", rangeStart)
        .lte("work_date", rangeEnd),
      fetch(`/api/pickup-replacements?start=${rangeStart}&end=${rangeEnd}`, {
        cache: "no-store",
      }),
    ]);
    const result = (await response
      .json()
      .catch(() => null)) as ApiResponse | null;
    if (riderResult.error) setError(riderResult.error.message);
    else
      setRiders(((riderResult.data ?? []) as Rider[]).filter(hasPickupRoute));
    if (attendanceResult.error) setError(attendanceResult.error.message);
    else setAttendance((attendanceResult.data ?? []) as AttendanceLog[]);
    if (!response.ok || !result?.success)
      setError(result?.error ?? "Không thể tải lịch thế pick");
    else {
      setReplacements(result.replacements ?? []);
      setCanEdit(Boolean(result.can_edit));
    }
    setLoading(false);
  }, [rangeEnd, rangeStart]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const map = useMemo(
    () =>
      new Map(
        replacements.map((item) => [
          `${item.rider_code}:${item.work_date}`,
          item,
        ]),
      ),
    [replacements],
  );
  const attendanceMap = useMemo(
    () =>
      new Map(
        attendance.map((item) => [
          `${normalize(item.rider_code)}:${item.work_date}`,
          item,
        ]),
      ),
    [attendance],
  );
  const cots = useMemo(
    () => unique(riders.map((rider) => rider.cot)),
    [riders],
  );
  const districts = useMemo(
    () => unique(riders.map((rider) => rider.pickup_district)),
    [riders],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return riders
      .filter((rider) =>
        (!q ||
          `${rider.rider_code} ${rider.full_name} ${rider.pickup_district} ${rider.pickup_ward} ${rider.point_name}`
            .toLowerCase()
            .includes(q)) &&
        (cot === "all" || rider.cot === cot) &&
        (district === "all" || rider.pickup_district === district) &&
        (!offOnly || isPickupOff(
          attendanceMap.get(`${normalize(rider.rider_code)}:${offFilterDate}`),
        )))
      .sort((a, b) =>
        (a.cot ?? "").localeCompare(b.cot ?? "", "vi", { numeric: true })
        || (a.pickup_district ?? "").localeCompare(b.pickup_district ?? "", "vi", { numeric: true })
        || (a.pickup_ward ?? "").localeCompare(b.pickup_ward ?? "", "vi", { numeric: true })
        || (a.point_name ?? "").localeCompare(b.point_name ?? "", "vi", { numeric: true })
        || a.rider_code.localeCompare(b.rider_code, "vi", { numeric: true }),
      );
  }, [attendanceMap, cot, district, offFilterDate, offOnly, query, riders]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 30));
  const safePage = Math.min(page, pageCount);
  const visibleRiders = filtered.slice((safePage - 1) * 30, safePage * 30);
  async function update(rider: Rider, date: string, value: string) {
    const replacement = riders.find((item) => item.id === value);
    const missing = value === "__missing__";
    if (!missing && !replacement) return;
    const key = `${rider.rider_code}:${date}`;
    setSavingKey(key);
    const response = await fetch("/api/pickup-replacements", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rider_id: rider.id,
        rider_code: rider.rider_code,
        work_date: date,
        replacement_rider_id: replacement?.id ?? null,
        replacement_rider_code: replacement?.rider_code ?? null,
        status: missing ? "MISSING" : "ASSIGNED",
        note: missing ? "Chưa có pick thay" : null,
      }),
    });
    const result = (await response
      .json()
      .catch(() => null)) as ApiResponse | null;
    setSavingKey(null);
    if (!response.ok || !result?.replacement)
      return setError(result?.error ?? "Không thể cập nhật");
    setReplacements((current) => [
      ...current.filter(
        (item) =>
          !(item.rider_code === rider.rider_code && item.work_date === date),
      ),
      result.replacement!,
    ]);
  }
  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
            Pickup workforce
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">
            Lịch thế pick
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Phân rider thay theo từng ngày, khu vực và điểm pick.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="size-10 p-0"
            onClick={() => {
              const next = shiftDate(rangeStart, -7);
              setRangeStart(next);
              setOffFilterDate(next);
              setPage(1);
            }}
          >
            <ChevronLeft size={16} />
          </Button>
          <div className="min-w-44 rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-sm font-semibold">
            {formatDate(rangeStart)} – {formatDate(rangeEnd)}
          </div>
          <Button
            type="button"
            variant="secondary"
            className="size-10 p-0"
            onClick={() => {
              const next = shiftDate(rangeStart, 7);
              setRangeStart(next);
              setOffFilterDate(next);
              setPage(1);
            }}
          >
            <ChevronRight size={16} />
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={rangeStart === today()}
            onClick={() => {
              const currentDate = today();
              setRangeStart(currentDate);
              setOffFilterDate(currentDate);
              setPage(1);
            }}
          >
            Hôm nay
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="size-10 p-0"
            onClick={() => void load()}
          >
            <RefreshCcw
              size={16}
              className={loading ? "animate-spin" : undefined}
            />
          </Button>
        </div>
      </header>
      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}
      <section className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2 xl:grid-cols-[1fr_150px_180px_210px_190px]">
        <label className="relative">
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            className="pl-9"
            placeholder="Tìm ID, tên, quận, phường, point"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <Select
          value={cot}
          onChange={(event) => {
            setCot(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">Tất cả COT</option>
          {cots.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </Select>
        <Select
          aria-label="Ngày lọc rider OFF"
          value={offFilterDate}
          onChange={(event) => {
            setOffFilterDate(event.target.value);
            setPage(1);
          }}
        >
          {days.map((day, index) => (
            <option key={day} value={day}>
              {day === today()
                ? "Hôm nay"
                : rangeStart === today() && index === 1
                  ? "Ngày mai"
                  : rangeStart === today() && index === 2
                    ? "Ngày mốt"
                    : formatWeekdayDate(day)}
            </option>
          ))}
        </Select>
        <button
          type="button"
          aria-pressed={offOnly}
          onClick={() => {
            setOffOnly((value) => !value);
            setPage(1);
          }}
          className={cn(
            "flex h-10 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition",
            offOnly
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-slate-200 bg-white text-slate-600",
          )}
        >
          {offOnly ? `OFF ngày ${formatShortDate(offFilterDate)}` : "Tất cả rider có tuyến"}
        </button>
        <Select
          value={district}
          onChange={(event) => {
            setDistrict(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">Tất cả quận pick</option>
          {districts.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </Select>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="max-h-[calc(100vh-330px)] min-h-[480px] overflow-auto">
          <table className="w-[1940px] min-w-full table-fixed border-separate border-spacing-0 text-left text-sm">
            <colgroup>
              <col className="w-[72px]" />
              <col className="w-[88px]" />
              <col className="w-[180px]" />
              <col className="w-[120px]" />
              <col className="w-[100px]" />
              <col className="w-[180px]" />
              <col className="w-[80px]" />
              {days.map((day) => (
                <col key={day} className="w-[160px]" />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-30">
              <tr className="h-14 bg-blue-100 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <th className="sticky left-0 z-40 border-b border-r border-blue-200 bg-blue-100 px-3 py-3 whitespace-nowrap">
                  COT
                </th>
                <th className="sticky left-[72px] z-40 border-b border-r border-blue-200 bg-blue-100 px-3 py-3 whitespace-nowrap">
                  ID
                </th>
                <th className="sticky left-[160px] z-40 border-b border-r border-blue-200 bg-blue-100 px-3 py-3 whitespace-nowrap shadow-[4px_0_8px_-6px_rgba(15,23,42,0.45)]">
                  Driver Name
                </th>
                <th className="border-b border-r border-blue-200 px-3 py-3 whitespace-nowrap">
                  District
                </th>
                <th className="border-b border-r border-blue-200 px-3 py-3 whitespace-nowrap">
                  Ward
                </th>
                <th className="border-b border-r border-blue-200 px-3 py-3 whitespace-nowrap">
                  Point name
                </th>
                <th className="border-b border-r border-blue-200 px-3 py-3 text-center whitespace-nowrap">
                  Auto assign
                </th>
                {days.map((day) => (
                  <th
                    key={day}
                    className={cn(
                      "border-b border-r border-blue-200 px-3 py-3 text-center whitespace-nowrap",
                      day === today() && "bg-emerald-100 text-emerald-800",
                    )}
                  >
                    {formatDate(day)}{day === today() ? " · Hôm nay" : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRiders.map((rider, index) => (
                <tr
                  key={rider.id}
                  className={cn("h-14", index % 2 ? "bg-slate-50" : "bg-white")}
                >
                  <td className="sticky left-0 z-20 border-b border-r border-slate-200 bg-inherit px-3 py-2 font-semibold whitespace-nowrap">
                    {rider.cot ?? "—"}
                  </td>
                  <td className="sticky left-[72px] z-20 border-b border-r border-slate-200 bg-inherit px-3 py-2 font-mono tabular-nums whitespace-nowrap">
                    {rider.rider_code}
                  </td>
                  <td className="sticky left-[160px] z-20 border-b border-r border-slate-200 bg-inherit px-3 py-2 font-semibold shadow-[4px_0_8px_-6px_rgba(15,23,42,0.4)]">
                    <p className="truncate" title={rider.full_name ?? ""}>
                      {rider.full_name ?? "—"}
                    </p>
                  </td>
                  <td className="border-b border-r border-slate-200 px-3 py-2">
                    <p className="truncate" title={rider.pickup_district ?? ""}>
                      {rider.pickup_district ?? "—"}
                    </p>
                  </td>
                  <td className="border-b border-r border-slate-200 px-3 py-2">
                    <p className="truncate" title={rider.pickup_ward ?? ""}>
                      {rider.pickup_ward ?? "—"}
                    </p>
                  </td>
                  <td className="border-b border-r border-slate-200 px-3 py-2">
                    <p
                      className="truncate font-mono text-xs"
                      title={rider.point_name ?? ""}
                    >
                      {rider.point_name ?? "—"}
                    </p>
                  </td>
                  <td className="border-b border-r border-slate-200 px-3 py-2 text-center text-xs font-bold">
                    {autoAssign(rider) ? "TRUE" : "FALSE"}
                  </td>
                  {days.map((day) => {
                    const key = `${rider.rider_code}:${day}`;
                    const item = map.get(key);
                    const offLog = attendanceMap.get(`${normalize(rider.rider_code)}:${day}`);
                    const off = isPickupOff(offLog);
                    const replacementCandidates = riders.filter(
                      (candidate) =>
                        candidate.id !== rider.id &&
                        !isPickupOff(
                          attendanceMap.get(`${normalize(candidate.rider_code)}:${day}`),
                        ),
                    );
                    return (
                      <td
                        key={day}
                        className={cn(
                          "border-b border-r border-slate-200 p-2",
                          !off
                            ? "bg-slate-50"
                            : item?.status === "ASSIGNED"
                            ? "bg-blue-100"
                            : item?.status === "MISSING"
                              ? "bg-red-100"
                              : "bg-white",
                        )}
                      >
                        {!off ? (
                          <div className="flex h-12 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-400">
                            Đi làm
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <p className="truncate px-1 text-[10px] font-bold uppercase text-amber-700" title={pickupOffLabel(offLog)}>
                              {pickupOffLabel(offLog)}
                            </p>
                            <ReplacementRiderInput
                              key={`${item?.status ?? "empty"}-${item?.replacement_rider_id ?? "none"}`}
                              id={`replacement-${rider.id}-${day}`}
                              candidates={replacementCandidates}
                              disabled={!canEdit || savingKey === key}
                              status={item?.status}
                              selectedRiderId={item?.replacement_rider_id ?? null}
                              onSelect={(value) => void update(rider, day, value)}
                            />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={14}
                    className="h-64 text-center text-sm text-slate-500"
                  >
                    Không có rider phù hợp.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <span className="text-sm text-slate-500">
            {filtered.length} rider · Trang {safePage}/{pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={safePage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Trước
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={safePage >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              Sau
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ReplacementRiderInput({
  id,
  candidates,
  disabled,
  status,
  selectedRiderId,
  onSelect,
}: {
  id: string;
  candidates: Rider[];
  disabled: boolean;
  status: Replacement["status"] | undefined;
  selectedRiderId: string | null;
  onSelect: (value: string) => void;
}) {
  const selected = candidates.find((rider) => rider.id === selectedRiderId);
  const selectedLabel = status === "MISSING"
    ? "Chưa có pick thay"
    : selected ? replacementRiderLabel(selected) : "";
  const [value, setValue] = useState(selectedLabel);

  function resolve(input: string) {
    const normalized = normalize(input);
    if (!normalized) return;
    if (normalized === normalize("Chưa có pick thay")) {
      onSelect("__missing__");
      return;
    }
    const match = candidates.find((rider) =>
      normalize(rider.rider_code) === normalized
      || normalize(replacementRiderLabel(rider)) === normalized,
    );
    if (match) onSelect(match.id);
  }

  return (
    <>
      <input
        type="text"
        list={`${id}-options`}
        value={value}
        disabled={disabled}
        placeholder="Tìm ID / tên"
        className={cn(
          "h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:opacity-60",
          status === "ASSIGNED" && "border-blue-200 bg-blue-50 font-bold text-blue-800",
          status === "MISSING" && "border-red-200 bg-red-50 font-semibold text-red-700",
        )}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          resolve(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            resolve(value);
          }
        }}
        onBlur={() => {
          if (value && value !== selectedLabel) resolve(value);
        }}
      />
      <datalist id={`${id}-options`}>
        <option value="Chưa có pick thay" />
        {candidates.map((rider) => (
          <option key={rider.id} value={replacementRiderLabel(rider)} />
        ))}
      </datalist>
    </>
  );
}

function replacementRiderLabel(rider: Rider) {
  return `${rider.rider_code} · ${rider.full_name?.trim() || "Chưa có tên"}`;
}

function unique(values: Array<string | null>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  ).sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
}
function hasPickupRoute(rider: Rider) {
  return Boolean(rider.point_name?.trim() && rider.pickup_district?.trim());
}
function isPickupOff(log: AttendanceLog | undefined) {
  if (!log) return false;
  const status = log.status?.trim().toUpperCase() ?? "";
  return status.startsWith("OFF_") || status === "NO_PICKUP";
}
function pickupOffLabel(log: AttendanceLog | undefined) {
  const status = log?.status?.trim().toUpperCase() ?? "";
  if (status === "OFF_WEEKLY") return "OFF tuần";
  if (status === "OFF_APPROVED") return "OFF phép";
  if (status === "OFF_UNEXPECTED") return "OFF đột xuất";
  if (status === "NO_PICKUP") return "Không đi pick";
  return "OFF";
}
function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim();
}
function autoAssign(rider: Rider) {
  const value = rider.raw_data?.auto_assign;
  return value === undefined
    ? true
    : value === true || value === "TRUE" || value === 1;
}
function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}
function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}
function formatWeekdayDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}
