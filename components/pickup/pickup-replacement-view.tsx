"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileSpreadsheet,
  LoaderCircle,
  RefreshCcw,
  Search,
  Sparkles,
  UserRoundX,
} from "lucide-react";
import type { AttendanceLog, Rider } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { recommendReplacementRiders, type RecommendedRider } from "@/lib/pickup/recommendations";
import { cn } from "@/utils/cn";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import styles from "./pickup-replacement-view.module.css";

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
  sheet_sync?: {
    success: boolean;
    error?: string;
    imported?: number;
    skipped?: number;
    verified?: boolean;
  };
  recommendation?: {
    history?: Record<string, number>;
    ward_volume?: Record<string, number>;
  };
  error?: string;
};
type RiderApiResponse = {
  success: boolean;
  riders?: Rider[];
  error?: string;
};

export function PickupReplacementView() {
  const [activeRiders, setActiveRiders] = useState<Rider[]>([]);
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
  useReportInitialDataLoading("pickup-replacement", loading);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetStatus, setSheetStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [recommendation, setRecommendation] = useState<ApiResponse["recommendation"] | null>(null);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => shiftDate(rangeStart, index)),
    [rangeStart],
  );
  const rangeEnd = days[6]!;
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const client = createClient();
    const [riderResponse, attendanceResult, response] = await Promise.all([
      fetch("/api/riders", { cache: "no-store" }),
      client
        .from("attendance_logs")
        .select("*")
        .gte("work_date", rangeStart)
        .lte("work_date", rangeEnd),
      fetch(`/api/pickup-replacements?start=${rangeStart}&end=${rangeEnd}`, {
        cache: "no-store",
      }),
    ]);
    const riderResult = (await riderResponse.json().catch(() => null)) as RiderApiResponse | null;
    const result = (await response
      .json()
      .catch(() => null)) as ApiResponse | null;
    if (!riderResponse.ok || !riderResult?.success) {
      setError(riderResult?.error ?? "Không thể tải danh sách rider active");
    } else {
      setActiveRiders(
        (riderResult.riders ?? [])
          .filter((rider) => rider.status === "active")
          .sort(
            (a, b) =>
              (a.cot ?? "").localeCompare(b.cot ?? "", "vi", { numeric: true }) ||
              (a.full_name ?? a.rider_code).localeCompare(b.full_name ?? b.rider_code, "vi"),
          ),
      );
    }
    if (attendanceResult.error) setError(attendanceResult.error.message);
    else setAttendance((attendanceResult.data ?? []) as AttendanceLog[]);
    if (!response.ok || !result?.success)
      setError(result?.error ?? "Không thể tải lịch thế pick");
    else {
      setRecommendation(result.recommendation ?? null);
      setReplacements(result.replacements ?? []);
      setCanEdit(Boolean(result.can_edit));
      setSheetStatus(result.sheet_sync?.success
        ? {
            success: true,
            message: `Đã đọc ${result.sheet_sync.imported ?? 0} lịch pick thay từ Google Sheet auto_assign_pick${result.sheet_sync.skipped ? ` · bỏ qua ${result.sheet_sync.skipped} rider không còn active` : ""}.`,
          }
        : {
            success: false,
            message: `Supabase đã tải, nhưng Google Sheet chưa đồng bộ: ${result.sheet_sync?.error ?? "không rõ lỗi"}`,
          });
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
  const replacementCandidatesByDate = useMemo(
    () => new Map(days.map((day) => [
      day,
      activeRiders.filter((candidate) => !isPickupOff(
        attendanceMap.get(`${normalize(candidate.rider_code)}:${day}`),
      )),
    ])),
    [activeRiders, attendanceMap, days],
  );
  const historyMap = useMemo(
    () => new Map(Object.entries(recommendation?.history ?? {})),
    [recommendation],
  );
  const wardVolumeMap = useMemo(
    () => new Map(Object.entries(recommendation?.ward_volume ?? {})),
    [recommendation],
  );
  const pickupRiders = useMemo(
    () => activeRiders.filter(hasPickupRoute),
    [activeRiders],
  );
  const cots = useMemo(
    () => unique(pickupRiders.map((rider) => rider.cot)),
    [pickupRiders],
  );
  const districts = useMemo(
    () => unique(pickupRiders.map((rider) => rider.pickup_district)),
    [pickupRiders],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pickupRiders
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
  }, [attendanceMap, cot, district, offFilterDate, offOnly, pickupRiders, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 30));
  const safePage = Math.min(page, pageCount);
  const visibleRiders = filtered.slice((safePage - 1) * 30, safePage * 30);
  const recommendedByKey = useMemo(
    () => {
      const map = new Map<string, RecommendedRider[]>();
      for (const rider of visibleRiders) {
        for (const day of days) {
          const candidates = (replacementCandidatesByDate.get(day) ?? []).filter(
            (candidate) => candidate.id !== rider.id,
          );
          const recommended = recommendReplacementRiders({
            rider,
            candidates,
            history: historyMap,
            wardVolume: wardVolumeMap,
          });
          if (recommended.length > 0) {
            map.set(`${rider.rider_code}:${day}`, recommended);
          }
        }
      }
      return map;
    },
    [days, historyMap, replacementCandidatesByDate, visibleRiders, wardVolumeMap],
  );
  async function update(rider: Rider, date: string, value: string) {
    const replacement = activeRiders.find((item) => item.id === value);
    const missing = value === "__missing__";
    if (!missing && !replacement) return false;
    const key = `${rider.rider_code}:${date}`;
    setSavingKey(key);
    setError(null);
    try {
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
      const result = (await response.json().catch(() => null)) as ApiResponse | null;
      if (!response.ok || !result?.replacement) {
        setError(result?.error ?? "Không thể cập nhật rider thay. Hãy thử lại.");
        return false;
      }
      setReplacements((current) => [
        ...current.filter((item) => !(item.rider_code === rider.rider_code && item.work_date === date)),
        result.replacement!,
      ]);
      setSheetStatus(result.sheet_sync?.success
        ? { success: true, message: "Đã đồng bộ và kiểm tra ID pick thay trên Google Sheet auto_assign_pick." }
        : { success: false, message: `Web đã lưu nhưng Google Sheet chưa đồng bộ: ${result.sheet_sync?.error ?? "không rõ lỗi"}` });
      return true;
    } catch {
      setError("Kết nối cập nhật rider thay bị gián đoạn. Hãy thử lại.");
      return false;
    } finally {
      setSavingKey(null);
    }
  }
  async function syncGoogleSheet() {
    setSyncingSheet(true);
    try {
      await load();
    } finally {
      setSyncingSheet(false);
    }
  }
  const assignedCount = replacements.filter((item) => item.status === "ASSIGNED").length;
  const missingCount = replacements.filter((item) => item.status === "MISSING").length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headingBlock}>
          <div className={styles.orientation}>
            <span className={styles.orientationMark} aria-hidden="true" />
            Điều phối rider pick theo tuần
          </div>
          <h1 className={styles.title}>Lịch thế pick</h1>
          <p className={styles.lede}>
            Chọn rider thay ngay trên ma trận ngày. Thay đổi được lưu vào Supabase và đối chiếu với Google Sheet.
          </p>
        </div>
        <dl className={styles.weekSummary} aria-label="Tóm tắt lịch thế pick">
          <div>
            <dt>Đã bố trí</dt>
            <dd>{assignedCount}</dd>
          </div>
          <div>
            <dt>Chưa có người</dt>
            <dd>{missingCount}</dd>
          </div>
          <div>
            <dt>Rider đang lọc</dt>
            <dd>{filtered.length}</dd>
          </div>
        </dl>
      </header>

      <section className={styles.weekRail} aria-label="Điều hướng tuần">
        <div className={styles.weekPicker}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Xem tuần trước"
            onClick={() => {
              const next = shiftDate(rangeStart, -7);
              setRangeStart(next);
              setOffFilterDate(next);
              setPage(1);
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <div className={styles.weekLabel}>
            <CalendarDays size={17} aria-hidden="true" />
            <span className={styles.weekLabelFull}>{formatDate(rangeStart)} – {formatDate(rangeEnd)}</span>
            <span className={styles.weekLabelCompact}>{formatShortDate(rangeStart)} – {formatShortDate(rangeEnd)}</span>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Xem tuần sau"
            onClick={() => {
              const next = shiftDate(rangeStart, 7);
              setRangeStart(next);
              setOffFilterDate(next);
              setPage(1);
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className={styles.weekActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={rangeStart === today()}
            onClick={() => {
              const currentDate = today();
              setRangeStart(currentDate);
              setOffFilterDate(currentDate);
              setPage(1);
            }}
          >
            Hôm nay
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={loading || syncingSheet}
            aria-busy={syncingSheet}
            onClick={() => void syncGoogleSheet()}
          >
            {syncingSheet ? <RefreshCcw size={16} className={styles.spinner} /> : <FileSpreadsheet size={16} />}
            {syncingSheet ? "Đang đồng bộ…" : "Đồng bộ Sheet"}
          </button>
        </div>
      </section>

      {error ? (
        <p className={styles.errorBanner} role="alert"><CircleAlert size={17} />{error}</p>
      ) : null}
      {sheetStatus ? (
        <p className={cn(styles.statusBanner, sheetStatus.success ? styles.statusSuccess : styles.statusWarning)} role="status">
          {sheetStatus.success ? <Check size={17} /> : <CircleAlert size={17} />}
          {sheetStatus.message}
        </p>
      ) : null}

      <section className={styles.filters} aria-label="Bộ lọc rider">
        <label className={cn(styles.field, styles.searchField)}>
          <span>Tìm rider hoặc điểm pick</span>
          <div className={styles.inputShell}>
            <Search size={17} aria-hidden="true" />
            <input
            type="search"
            placeholder="Tìm ID, tên, quận, phường, point"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            />
          </div>
        </label>
        <FilterSelect label="COT" value={cot} onChange={(value) => { setCot(value); setPage(1); }}>
          <option value="all">Tất cả COT</option>
          {cots.map((item) => <option key={item}>{item}</option>)}
        </FilterSelect>
        <FilterSelect label="Ngày cần thế" value={offFilterDate} onChange={(value) => { setOffFilterDate(value); setPage(1); }}>
          {days.map((day, index) => <option key={day} value={day}>{day === today() ? "Hôm nay" : rangeStart === today() && index === 1 ? "Ngày mai" : rangeStart === today() && index === 2 ? "Ngày mốt" : formatWeekdayDate(day)}</option>)}
        </FilterSelect>
        <FilterSelect label="Quận pick" value={district} onChange={(value) => { setDistrict(value); setPage(1); }}>
          <option value="all">Tất cả quận</option>
          {districts.map((item) => <option key={item}>{item}</option>)}
        </FilterSelect>
        <label className={styles.toggleField}>
          <span>Phạm vi hiển thị</span>
          <button type="button" aria-pressed={offOnly} onClick={() => { setOffOnly((value) => !value); setPage(1); }} className={cn(styles.toggle, offOnly && styles.toggleActive)}>
            <span className={styles.toggleDot} aria-hidden="true" />
            {offOnly ? `Chỉ rider OFF ${formatShortDate(offFilterDate)}` : "Tất cả rider có tuyến"}
          </button>
        </label>
      </section>

      <section className={styles.matrix} aria-label="Ma trận thế pick theo tuần">
        <div className={styles.matrixIntro}>
          <div>
            <h2>Rider × ngày</h2>
            <p>Ô có nền vàng là rider OFF. Mở dropdown để chọn người thay.</p>
          </div>
          <div className={styles.legend} aria-label="Chú thích trạng thái">
            <span><i className={styles.legendOff} />Cần bố trí</span>
            <span><i className={styles.legendAssigned} />Đã bố trí</span>
            <span><i className={styles.legendMissing} />Chưa có người</span>
          </div>
        </div>
        <div className={styles.tableViewport}>
          <table className={styles.table}>
            <colgroup>
              <col className="w-[72px]" />
              <col className="w-[88px]" />
              <col className="w-[180px]" />
              <col className="w-[120px]" />
              <col className="w-[100px]" />
              <col className="w-[180px]" />
              {days.map((day) => (
                <col key={day} className="w-[190px]" />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className={cn(styles.stickyCot, styles.identityHead)}>COT</th>
                <th className={cn(styles.stickyId, styles.identityHead)}>ID</th>
                <th className={cn(styles.stickyName, styles.identityHead)}>Tên rider</th>
                <th>Quận</th>
                <th>Phường</th>
                <th>Point name</th>
                {days.map((day) => (
                  <th key={day} className={cn(styles.dayHead, day === today() && styles.todayHead)}>
                    <span>{formatWeekday(day)}</span>
                    <strong>{formatShortDate(day)}</strong>
                    {day === today() ? <em>Hôm nay</em> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRiders.map((rider, index) => (
                <tr key={rider.id} className={index % 2 ? styles.altRow : undefined}>
                  <td className={cn(styles.stickyCot, styles.identityCell)}>
                    {rider.cot ?? "—"}
                  </td>
                  <td className={cn(styles.stickyId, styles.identityCell, styles.mono)}>
                    {rider.rider_code}
                  </td>
                  <td className={cn(styles.stickyName, styles.identityCell, styles.riderName)} title={rider.full_name ?? ""}>
                    {rider.full_name ?? "—"}
                  </td>
                  <td title={rider.pickup_district ?? ""}>
                    <span className={styles.truncate}>{rider.pickup_district ?? "—"}</span>
                  </td>
                  <td title={rider.pickup_ward ?? ""}>
                    <span className={styles.truncate}>{rider.pickup_ward ?? "—"}</span>
                  </td>
                  <td className={styles.mono} title={rider.point_name ?? ""}>
                    <span className={styles.truncate}>{rider.point_name ?? "—"}</span>
                  </td>
                  {days.map((day) => {
                    const key = `${rider.rider_code}:${day}`;
                    const item = map.get(key);
                    const offLog = attendanceMap.get(`${normalize(rider.rider_code)}:${day}`);
                    const off = isPickupOff(offLog);
                    const replacementCandidates = (replacementCandidatesByDate.get(day) ?? []).filter(
                      (candidate) => candidate.id !== rider.id,
                    );
                    return (
                      <td
                        key={day}
                        className={cn(
                          styles.assignmentCell,
                          !off ? styles.workingCell : item?.status === "ASSIGNED" ? styles.assignedCell : item?.status === "MISSING" ? styles.missingCell : styles.offCell,
                        )}
                      >
                        {!off ? (
                          <span className={styles.workingLabel}>Đi làm</span>
                        ) : (
                          <div className={styles.assignmentControl}>
                            <p className={styles.offLabel} title={pickupOffLabel(offLog)}>
                              {pickupOffLabel(offLog)}
                            </p>
                            <ReplacementRiderInput
                              key={`${item?.status ?? "empty"}-${item?.replacement_rider_id ?? "none"}`}
                              id={`replacement-${rider.id}-${day}`}
                              candidates={replacementCandidates}
                              recommended={recommendedByKey.get(key) ?? []}
                              disabled={!canEdit}
                              loading={savingKey === key}
                              status={item?.status}
                              selectedRiderId={item?.replacement_rider_id ?? null}
                              onSelect={(value) => update(rider, day, value)}
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
                  <td colSpan={13} className={styles.emptyState}>
                    <UserRoundX size={22} />
                    <strong>Không có rider phù hợp</strong>
                    <span>Đổi ngày OFF hoặc nới bộ lọc để xem thêm rider.</span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className={styles.pagination}>
          <span>
            {filtered.length} rider · Trang {safePage}/{pageCount}
          </span>
          <div>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={safePage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              Trước
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={safePage >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              Sau
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <div className={styles.selectShell}>
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {children}
        </select>
        <ChevronDown size={16} aria-hidden="true" />
      </div>
    </label>
  );
}

function ReplacementRiderInput({
  id,
  candidates,
  recommended,
  disabled,
  loading,
  status,
  selectedRiderId,
  onSelect,
}: {
  id: string;
  candidates: Rider[];
  recommended: RecommendedRider[];
  disabled: boolean;
  loading: boolean;
  status: Replacement["status"] | undefined;
  selectedRiderId: string | null;
  onSelect: (value: string) => Promise<boolean>;
}) {
  const selected = candidates.find((rider) => rider.id === selectedRiderId);
  const selectedLabel = status === "MISSING"
    ? "Chưa có pick thay"
    : selected ? replacementRiderLabel(selected) : "";
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number } | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = normalize(query === selectedLabel ? "" : query);
  const recommendedIds = useMemo(
    () => new Set(recommended.map((item) => item.rider.id)),
    [recommended],
  );
  const showRecommend = recommended.length > 0 && !normalizedQuery;
  const filteredCandidates = useMemo(() => candidates
    .filter((rider) => showRecommend ? !recommendedIds.has(rider.id) : true)
    .filter((rider) => !normalizedQuery || normalize(`${replacementRiderLabel(rider)} ${rider.pickup_district ?? ""} ${rider.pickup_ward ?? ""} ${rider.point_name ?? ""}`).includes(normalizedQuery))
    .slice(0, 12), [candidates, normalizedQuery, recommendedIds, showRecommend]);
  const options = useMemo(
    () => [
      ...(showRecommend ? recommended.map((item) => item.rider.id) : []),
      "__missing__",
      ...filteredCandidates.map((rider) => rider.id),
    ],
    [filteredCandidates, recommended, showRecommend],
  );

  const updatePosition = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(360, Math.max(280, window.innerWidth - 24));
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - width - 12);
    const spaceBelow = window.innerHeight - rect.bottom;
    setPosition(spaceBelow >= 310 || rect.top < spaceBelow
      ? { left, top: rect.bottom + 6, width }
      : { left, bottom: window.innerHeight - rect.top + 6, width });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !(target instanceof Element && target.closest(`[data-pick-listbox="${id}"]`))) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [id, open, updatePosition]);

  async function choose(value: string) {
    if (loading) return;
    const rider = candidates.find((candidate) => candidate.id === value);
    const nextLabel = value === "__missing__" ? "Chưa có pick thay" : rider ? replacementRiderLabel(rider) : "";
    setQuery(nextLabel);
    setOpen(false);
    const saved = await onSelect(value);
    if (!saved) setQuery(selectedLabel);
  }

  return (
    <div
      ref={anchorRef}
      className={styles.combobox}
      data-state={loading ? "loading" : status === "ASSIGNED" ? "success" : status === "MISSING" ? "missing" : "default"}
    >
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        aria-busy={loading}
        value={query}
        disabled={disabled}
        readOnly={loading}
        placeholder="Tìm ID hoặc tên"
        className={styles.comboboxInput}
        onFocus={() => { if (!disabled && !loading) { setOpen(true); updatePosition(); } }}
        onClick={() => { if (!disabled && !loading) setOpen(true); }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((value) => Math.min(options.length - 1, value + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((value) => Math.max(0, value - 1));
          } else if (event.key === "Enter" && open && options[activeIndex]) {
            event.preventDefault();
            void choose(options[activeIndex]);
          } else if (event.key === "Escape") {
            setOpen(false);
            setQuery(selectedLabel);
          }
        }}
      />
      <span className={styles.comboboxState} aria-hidden="true">
        {loading ? <LoaderCircle size={15} className={styles.spinner} /> : status === "ASSIGNED" ? <Check size={15} /> : status === "MISSING" ? <CircleAlert size={15} /> : <ChevronDown size={15} />}
      </span>
      {open && position ? createPortal(
        <div
          id={`${id}-listbox`}
          role="listbox"
          data-pick-listbox={id}
          className={styles.dropdown}
          style={position}
        >
          <div className={styles.dropdownHeader}>
            <span>Chọn rider thay</span>
            <span>{showRecommend ? `${recommended.length} recommend · ` : ""}{filteredCandidates.length}/{candidates.length}</span>
          </div>
          {showRecommend ? (
            <div className={styles.recommendSection}>
              <p className={styles.recommendTitle}>
                <Sparkles size={14} aria-hidden="true" />
                Recommend
                <span>ưu tiên xếp trước</span>
              </p>
              {recommended.map((item, index) => (
                <button
                  id={`${id}-option-${index}`}
                  key={item.rider.id}
                  type="button"
                  role="option"
                  aria-selected={item.rider.id === selectedRiderId}
                  className={cn(styles.option, styles.recommendOption, activeIndex === index && styles.activeOption)}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void choose(item.rider.id)}
                >
                  <span className={styles.priorityBadge}>{item.priority}</span>
                  <span className={styles.riderCode}>{item.rider.rider_code}</span>
                  <span className={styles.optionBody}><strong>{item.rider.full_name?.trim() || "Chưa có tên"}</strong><small>{recommendReasonLabel(item)}</small></span>
                  {item.rider.id === selectedRiderId ? <Check size={16} /> : null}
                </button>
              ))}
            </div>
          ) : null}
          <button
            id={`${id}-option-${showRecommend ? recommended.length : 0}`}
            type="button"
            role="option"
            aria-selected={status === "MISSING"}
            className={cn(styles.option, styles.missingOption, activeIndex === (showRecommend ? recommended.length : 0) && styles.activeOption)}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(showRecommend ? recommended.length : 0)}
            onClick={() => void choose("__missing__")}
          >
            <CircleAlert size={16} />
            <span><strong>Chưa có pick thay</strong><small>Đánh dấu để tiếp tục xử lý</small></span>
          </button>
          <div className={styles.optionList}>
            {filteredCandidates.map((rider, index) => (
              <button
                id={`${id}-option-${(showRecommend ? recommended.length : 0) + index + 1}`}
                key={rider.id}
                type="button"
                role="option"
                aria-selected={rider.id === selectedRiderId}
                className={cn(styles.option, activeIndex === (showRecommend ? recommended.length : 0) + index + 1 && styles.activeOption)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex((showRecommend ? recommended.length : 0) + index + 1)}
                onClick={() => void choose(rider.id)}
              >
                <span className={styles.riderCode}>{rider.rider_code}</span>
                <span className={styles.optionBody}><strong>{rider.full_name?.trim() || "Chưa có tên"}</strong><small>{[rider.pickup_district, rider.pickup_ward].filter(Boolean).join(" · ") || "Chưa có tuyến pick"}</small></span>
                {rider.id === selectedRiderId ? <Check size={16} /> : null}
              </button>
            ))}
            {filteredCandidates.length === 0 ? <p className={styles.noOptions}>Không tìm thấy rider phù hợp.</p> : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function replacementRiderLabel(rider: Rider) {
  return `${rider.rider_code} · ${rider.full_name?.trim() || "Chưa có tên"}`;
}

function recommendReasonLabel(item: RecommendedRider) {
  if (item.reason === "history") {
    return item.historyCount > 1
      ? `Đã từng thay ${item.historyCount} lần · ${[item.rider.pickup_district, item.rider.pickup_ward].filter(Boolean).join(" · ") || "Chưa có tuyến"}`
      : `Đã từng thay · ${[item.rider.pickup_district, item.rider.pickup_ward].filter(Boolean).join(" · ") || "Chưa có tuyến"}`;
  }
  if (item.reason === "ward") {
    return `Cùng phường ${item.rider.pickup_ward ?? ""}`;
  }
  return `Phường gần · ${item.rider.pickup_ward ?? ""}`;
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
function formatWeekday(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { weekday: "short" })
    .format(new Date(`${value}T00:00:00`))
    .replace("Th ", "T");
}