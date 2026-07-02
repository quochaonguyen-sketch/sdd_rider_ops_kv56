"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subMonths,
} from "date-fns";
import { vi } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Palmtree,
  Pencil,
  RefreshCcw,
  Search,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import type { AttendanceLog, Rider } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type ScheduleStatus =
  | ""
  | "ON"
  | "OFF_WEEKLY"
  | "OFF_APPROVED"
  | "OFF_UNEXPECTED"
  | "WORKING_REST_DAY"
  | "NO_PICKUP";

type ScheduleResponse = {
  success: boolean;
  can_edit?: boolean;
  riders?: Rider[];
  logs?: AttendanceLog[];
  error?: string;
};

type ScheduleUpdate = {
  rider_id: string;
  work_date: string;
  status: ScheduleStatus;
  shift?: string | null;
  note?: string | null;
};

type CellEditor = {
  rider: Rider;
  date: string;
  status: ScheduleStatus;
  shift: string;
  note: string;
};

type ImportIssue = {
  row: number;
  rider_code?: string;
  date?: string;
  error: string;
};

type AttendanceCategory = "present" | "absent" | "late" | "leave";
type AttendanceSortKey = "name" | "date" | "shift" | "status";

const statusOptions: Array<{ value: ScheduleStatus; label: string }> = [
  { value: "ON", label: "ON" },
  { value: "OFF_WEEKLY", label: "OFF tuần" },
  { value: "OFF_APPROVED", label: "OFF phép" },
  { value: "OFF_UNEXPECTED", label: "OFF đột xuất" },
  { value: "WORKING_REST_DAY", label: "OFF nhưng không OFF" },
  { value: "NO_PICKUP", label: "Không đi pick" },
];

const riderPageSizes = [25, 50, 100];
const importIssuePageSize = 50;

export function AttendanceView({ initialMonth = format(new Date(), "yyyy-MM") }: { initialMonth?: string }) {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [month, setMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState(
    initialMonth === format(new Date(), "yyyy-MM") ? format(new Date(), "yyyy-MM-dd") : `${initialMonth}-01`,
  );
  const [query, setQuery] = useState("");
  const [kv, setKv] = useState("all");
  const [cot, setCot] = useState("all");
  const [deliveryDistrict, setDeliveryDistrict] = useState("all");
  const [rosterStatus, setRosterStatus] = useState("active");
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceCategory | "all">("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [attendanceSort, setAttendanceSort] = useState<{ key: AttendanceSortKey; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
  const [bulkStatus, setBulkStatus] = useState<ScheduleStatus>("ON");
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
  const [issuesImportedPartially, setIssuesImportedPartially] = useState(false);
  const [riderPage, setRiderPage] = useState(1);
  const [riderPageSize, setRiderPageSize] = useState(25);
  const [issuePage, setIssuePage] = useState(1);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<CellEditor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const realtimeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const deferredQuery = useDeferredValue(query);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/attendance/schedule?month=${month}`, { cache: "no-store" });
    const result = (await response.json().catch(() => null)) as ScheduleResponse | null;

    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể tải lịch rider");
    } else {
      setRiders(result.riders ?? []);
      setLogs(result.logs ?? []);
      setCanEdit(Boolean(result.can_edit));
    }
    setLoading(false);
  }, [month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    busyRef.current = importing || savingCells.size > 0;
  }, [importing, savingCells]);

  const requestRealtimeRefresh = useCallback(() => {
    if (busyRef.current) return;
    if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
    realtimeTimerRef.current = setTimeout(() => {
      void load();
    }, 900);
  }, [load]);

  useEffect(() => {
    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
    };
  }, []);

  useSupabaseRealtime({ table: "attendance_logs", onChange: requestRealtimeRefresh });
  useSupabaseRealtime({ table: "riders", onChange: requestRealtimeRefresh });

  const monthDate = useMemo(() => parseISO(`${month}-01`), [month]);
  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) }),
    [monthDate],
  );

  const kvOptions = useMemo(() => uniqueOptions(riders.map((rider) => rider.kv)), [riders]);
  const deliveryDistrictOptions = useMemo(
    () => uniqueOptions(riders.map((rider) => rider.delivery_district)),
    [riders],
  );
  const shiftOptions = useMemo(() => uniqueOptions(logs.map((log) => log.shift)), [logs]);

  const filteredRiders = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase("vi");
    return riders.filter((rider) => {
      const matchesQuery =
        !normalized ||
        [rider.rider_code, rider.full_name, rider.delivery_district, rider.delivery_ward].some((value) =>
          value?.toLocaleLowerCase("vi").includes(normalized),
        );
      return (
        matchesQuery &&
        (kv === "all" || rider.kv === kv) &&
        (cot === "all" || rider.cot === cot) &&
        (deliveryDistrict === "all" || rider.delivery_district === deliveryDistrict) &&
        (rosterStatus === "all" || rider.status === rosterStatus)
      );
    });
  }, [cot, deferredQuery, deliveryDistrict, kv, riders, rosterStatus]);

  const logMap = useMemo(() => {
    const riderIdByCode = new Map(riders.map((rider) => [rider.rider_code, rider.id]));
    const map = new Map<string, AttendanceLog>();
    for (const log of logs) {
      const riderId = log.rider_id ?? riderIdByCode.get(log.rider_code);
      if (!riderId) continue;
      const key = cellKey(riderId, log.work_date);
      if (!map.has(key)) map.set(key, log);
    }
    return map;
  }, [logs, riders]);

  const visibleRiders = useMemo(() => filteredRiders.filter((rider) => {
    const log = logMap.get(cellKey(rider.id, selectedDate));
    return (attendanceStatus === "all" || attendanceCategory(log) === attendanceStatus) &&
      (shiftFilter === "all" || (log?.shift ?? rider.current_shift) === shiftFilter);
  }).sort((a, b) => compareAttendanceRiders(a, b, logMap, selectedDate, attendanceSort) * (attendanceSort.direction === "asc" ? 1 : -1)), [attendanceSort, attendanceStatus, filteredRiders, logMap, selectedDate, shiftFilter]);

  const dailySummaries = useMemo(
    () =>
      new Map(
        days.map((day) => {
          const date = format(day, "yyyy-MM-dd");
          return [date, summarizeDate(date, visibleRiders, logMap)] as const;
        }),
      ),
    [days, logMap, visibleRiders],
  );
  const selectedSummary = dailySummaries.get(selectedDate) ?? {
    on: 0,
    off: 0,
    defaultOn: 0,
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
    total: visibleRiders.length,
  };
  const selectedAllSummary = useMemo(() => summarizeDate(selectedDate, filteredRiders, logMap), [filteredRiders, logMap, selectedDate]);
  const selectedDayIndex = Math.max(0, days.findIndex((day) => format(day, "yyyy-MM-dd") === selectedDate));
  const dayWindowIndex = Math.floor(selectedDayIndex / 7);
  const dayWindowCount = Math.ceil(days.length / 7);
  const visibleDays = days.slice(dayWindowIndex * 7, dayWindowIndex * 7 + 7);

  const riderPageCount = Math.max(1, Math.ceil(visibleRiders.length / riderPageSize));
  const safeRiderPage = Math.min(riderPage, riderPageCount);
  const paginatedRiders = useMemo(
    () => visibleRiders.slice((safeRiderPage - 1) * riderPageSize, safeRiderPage * riderPageSize),
    [riderPageSize, safeRiderPage, visibleRiders],
  );
  const issuePageCount = Math.max(1, Math.ceil(importIssues.length / importIssuePageSize));
  const safeIssuePage = Math.min(issuePage, issuePageCount);
  const paginatedImportIssues = useMemo(
    () => importIssues.slice((safeIssuePage - 1) * importIssuePageSize, safeIssuePage * importIssuePageSize),
    [importIssues, safeIssuePage],
  );

  async function saveUpdates(updates: ScheduleUpdate[], message?: string) {
    const keys = updates.map((item) => cellKey(item.rider_id, item.work_date));
    busyRef.current = true;
    setSavingCells((current) => new Set([...current, ...keys]));
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/attendance/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ updates }),
    });
    const result = (await response.json().catch(() => null)) as ScheduleResponse & {
      cleared?: Array<{ rider_id: string; work_date: string }>;
    };

    setSavingCells((current) => {
      const next = new Set(current);
      keys.forEach((key) => next.delete(key));
      return next;
    });
    busyRef.current = importing;

    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể cập nhật lịch");
      await load();
      return false;
    }

    const changedKeys = new Set(keys);
    const riderIdByCode = new Map(riders.map((rider) => [rider.rider_code, rider.id]));
    setLogs((current) => [
      ...current.filter((log) => {
        const riderId = log.rider_id ?? riderIdByCode.get(log.rider_code);
        return !riderId || !changedKeys.has(cellKey(riderId, log.work_date));
      }),
      ...(result.logs ?? []),
    ]);
    setSuccess(message ?? "Đã cập nhật lịch rider.");
    return true;
  }

  async function updateCell(rider: Rider, date: string, status: ScheduleStatus) {
    const current = logMap.get(cellKey(rider.id, date));
    await saveUpdates([
      {
        rider_id: rider.id,
        work_date: date,
        status: status === "ON" ? "" : status,
        shift: current?.shift,
        note: current?.note,
      },
    ]);
  }

  async function applyBulkStatus() {
    if (!canEdit || visibleRiders.length === 0) return;
    const label = statusLabel(bulkStatus);
    if (!window.confirm(`Áp dụng "${label}" cho ${visibleRiders.length} rider ngày ${selectedDate}?`)) return;

    const updates = visibleRiders.map((rider) => {
      const current = logMap.get(cellKey(rider.id, selectedDate));
      return {
        rider_id: rider.id,
        work_date: selectedDate,
        status: bulkStatus === "ON" ? "" : bulkStatus,
        shift: bulkStatus === "ON" ? null : current?.shift,
        note: bulkStatus === "ON" ? null : current?.note,
      };
    });
    await saveUpdates(updates, `Đã xếp ${label} cho ${visibleRiders.length} rider.`);
  }

  function openEditor(rider: Rider, date: string) {
    const current = logMap.get(cellKey(rider.id, date));
    setEditor({
      rider,
      date,
      status: displayStatus(current?.status),
      shift: current?.shift ?? "",
      note: current?.note ?? "",
    });
  }

  async function saveEditor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const saved = await saveUpdates([
      {
        rider_id: editor.rider.id,
        work_date: editor.date,
        status: editor.status === "ON" ? "" : editor.status,
        shift: editor.status === "ON" ? null : editor.shift,
        note: editor.status === "ON" ? null : editor.note,
      },
    ]);
    if (saved) setEditor(null);
  }

  function changeMonth(nextMonth: string) {
    setMonth(nextMonth);
    setSelectedDate(`${nextMonth}-01`);
    setImportIssues([]);
    setIssuesImportedPartially(false);
    setRiderPage(1);
    setIssuePage(1);
  }

  function changeDayWindow(nextWindow: number) {
    const safeWindow = Math.max(0, Math.min(dayWindowCount - 1, nextWindow));
    const firstDay = days[safeWindow * 7];
    if (firstDay) setSelectedDate(format(firstDay, "yyyy-MM-dd"));
  }

  async function downloadTemplate() {
    setDownloadingTemplate(true);
    setError(null);
    try {
      const response = await fetch(`/api/attendance/schedule/import?month=${month}`);
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? "Không thể tải file mẫu");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `lich-rider-${month}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tải file mẫu");
    } finally {
      setDownloadingTemplate(false);
    }
  }

  async function importExcel(file: File) {
    busyRef.current = true;
    setImporting(true);
    setError(null);
    setSuccess(null);
    setImportIssues([]);
    setIssuesImportedPartially(false);
    setIssuePage(1);

    const body = new FormData();
    body.set("file", file);
    body.set("month", month);
    const response = await fetch("/api/attendance/schedule/import", { method: "POST", body });
    const result = (await response.json().catch(() => null)) as
      | {
          success?: boolean;
          error?: string;
          errors?: ImportIssue[];
          imported?: number;
          cleared?: number;
          riders?: number;
          skipped?: number;
        }
      | null;

    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!response.ok || !result?.success) {
      setImporting(false);
      busyRef.current = savingCells.size > 0;
      setError(result?.error ?? "Không thể import lịch rider");
      setImportIssues(result?.errors ?? []);
      setIssuesImportedPartially(false);
      return;
    }

    setImportIssues(result.errors ?? []);
    setIssuesImportedPartially(Boolean(result.errors?.length));

    setSuccess(
      `Đã import ${result.imported ?? 0} ô lịch cho ${result.riders ?? 0} rider${
        result.cleared ? `, xóa ${result.cleared} ô` : ""
      }${result.skipped ? `; bỏ qua ${result.skipped} lỗi` : ""}.`,
    );
    if (realtimeTimerRef.current) {
      clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = null;
    }
    await load();
    setImporting(false);
    busyRef.current = savingCells.size > 0;
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Chấm công rider</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Theo dõi quân số, tình trạng đi làm và lịch nghỉ theo ngày.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importExcel(file);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!canEdit || downloadingTemplate}
            onClick={() => void downloadTemplate()}
          >
            <Download size={16} />
            <span className="hidden sm:inline">
              {downloadingTemplate ? "Đang tạo..." : "Tải file mẫu"}
            </span>
            <span className="sm:hidden">File mẫu</span>
          </Button>
          <Button
            type="button"
            disabled={!canEdit || importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} />
            {importing ? "Đang import..." : "Import Excel"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="size-11 p-0"
            onClick={() => changeMonth(format(subMonths(monthDate, 1), "yyyy-MM"))}
          >
            <ChevronLeft size={18} />
          </Button>
          <Input
            type="month"
            className="min-w-40 font-semibold"
            value={month}
            onChange={(event) => changeMonth(event.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            className="size-11 p-0"
            onClick={() => changeMonth(format(addMonths(monthDate, 1), "yyyy-MM"))}
          >
            <ChevronRight size={18} />
          </Button>
          <Button type="button" variant="secondary" className="size-11 p-0" onClick={() => void load()}>
            <RefreshCcw className={loading ? "animate-spin" : ""} size={17} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <AttendanceKpi className="col-span-6 xl:col-span-3" label="Có mặt" value={selectedAllSummary.present} helper={formatSelectedDate(selectedDate)} tone="green" icon={<CheckCircle2 size={18} />} active={attendanceStatus === "present"} onClick={() => { setAttendanceStatus("present"); setRiderPage(1); }} />
        <AttendanceKpi className="col-span-6 xl:col-span-2" label="Vắng đột xuất" value={selectedAllSummary.absent} helper="Cần xử lý" tone="red" icon={<X size={18} />} active={attendanceStatus === "absent"} onClick={() => { setAttendanceStatus("absent"); setRiderPage(1); }} />
        <AttendanceKpi className="col-span-6 xl:col-span-2" label="Đi trễ" value={selectedAllSummary.late} helper="Theo dữ liệu check-in" tone="amber" icon={<Clock3 size={18} />} active={attendanceStatus === "late"} onClick={() => { setAttendanceStatus("late"); setRiderPage(1); }} />
        <AttendanceKpi className="col-span-6 xl:col-span-2" label="Nghỉ phép" value={selectedAllSummary.leave} helper="Tuần hoặc có phép" tone="blue" icon={<Palmtree size={18} />} active={attendanceStatus === "leave"} onClick={() => { setAttendanceStatus("leave"); setRiderPage(1); }} />
        <AttendanceKpi className="col-span-12 xl:col-span-3" label="Tỷ lệ có mặt" value={`${selectedAllSummary.total ? Math.round(selectedAllSummary.present / selectedAllSummary.total * 100) : 0}%`} helper={`${selectedAllSummary.present}/${selectedAllSummary.total} rider`} tone="green" icon={<UsersRound size={18} />} active={attendanceStatus === "all"} onClick={() => { setAttendanceStatus("all"); setRiderPage(1); }} />
      </div>

      <Card className="grid gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-[1fr_150px_180px_160px_140px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} />
          <Input
            className="pl-10"
            placeholder="Tìm ID, tên, quận giao, phường giao"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setRiderPage(1);
            }}
          />
        </label>
        <Select value={attendanceStatus} onChange={(event) => { setAttendanceStatus(event.target.value as AttendanceCategory | "all"); setRiderPage(1); }} aria-label="Lọc trạng thái chấm công"><option value="all">Mọi trạng thái</option><option value="present">Có mặt</option><option value="absent">Vắng đột xuất</option><option value="late">Đi trễ</option><option value="leave">Nghỉ phép</option></Select>
        <Select value={shiftFilter} onChange={(event) => { setShiftFilter(event.target.value); setRiderPage(1); }} aria-label="Lọc ca"><option value="all">Tất cả ca</option>{shiftOptions.map((option) => <option key={option} value={option}>{option}</option>)}</Select>
        <Select value={kv} onChange={(event) => { setKv(event.target.value); setRiderPage(1); }} className="xl:hidden">
          <option value="all">Tất cả KV</option>
          {kvOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </Select>
        <Select value={deliveryDistrict} onChange={(event) => { setDeliveryDistrict(event.target.value); setRiderPage(1); }}>
          <option value="all">Tất cả quận giao</option>
          {deliveryDistrictOptions.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </Select>
        <Select value={rosterStatus} onChange={(event) => { setRosterStatus(event.target.value); setRiderPage(1); }}>
          <option value="active">Rider active</option>
          <option value="inactive">Rider inactive</option>
          <option value="all">Tất cả rider</option>
        </Select>
        <div className="col-span-full flex min-h-8 flex-wrap items-center gap-2 border-t border-slate-100 pt-3"><span className="text-xs font-semibold text-slate-500">Đang lọc:</span><FilterPill label={formatSelectedDate(selectedDate)} onRemove={null} />{attendanceStatus !== "all" ? <FilterPill label={attendanceCategoryLabel(attendanceStatus)} onRemove={() => setAttendanceStatus("all")} /> : null}{shiftFilter !== "all" ? <FilterPill label={`Ca ${shiftFilter}`} onRemove={() => setShiftFilter("all")} /> : null}{deliveryDistrict !== "all" ? <FilterPill label={deliveryDistrict} onRemove={() => setDeliveryDistrict("all")} /> : null}<button type="button" className="ml-auto text-xs font-semibold text-blue-700" onClick={() => { setAttendanceStatus("all"); setShiftFilter("all"); setDeliveryDistrict("all"); setKv("all"); setCot("all"); setRosterStatus("active"); setQuery(""); }}>Xóa bộ lọc</button></div>
      </Card>

      <Card className="grid gap-3 border-blue-100 bg-blue-50 p-3 sm:grid-cols-[180px_1fr_auto] sm:items-end sm:p-4">
        <label>
          <span className="mb-1 block text-xs font-bold uppercase text-blue-700">Ngày xếp nhanh</span>
          <Input
            type="date"
            min={format(days[0], "yyyy-MM-dd")}
            max={format(days[days.length - 1], "yyyy-MM-dd")}
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-bold uppercase text-blue-700">Trạng thái</span>
          <Select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as ScheduleStatus)}>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        <Button type="button" disabled={!canEdit || loading} onClick={() => void applyBulkStatus()}>
          <UsersRound size={17} />
          Áp dụng cho {visibleRiders.length} rider
        </Button>
      </Card>

      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {importIssues.length > 0 ? (
        <Card className="border-red-200 bg-red-50">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-red-900">File có {importIssues.length} lỗi</h2>
              <p className="mt-1 text-sm text-red-700">
                {issuesImportedPartially
                  ? "Các ô hợp lệ đã được import; danh sách dưới đây là phần bị bỏ qua."
                  : "Không có dữ liệu hợp lệ được import; kiểm tra các lỗi dưới đây."}
              </p>
            </div>
            <Button type="button" variant="ghost" className="size-10 p-0" onClick={() => { setImportIssues([]); setIssuePage(1); setIssuesImportedPartially(false); }}>
              <X size={18} />
            </Button>
          </div>
          <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-red-200 bg-white">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="sticky top-0 bg-red-100 text-xs uppercase text-red-800">
                <tr>
                  <th className="px-3 py-2">Dòng</th>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Ngày</th>
                  <th className="px-3 py-2">Lỗi</th>
                </tr>
              </thead>
              <tbody>
                {paginatedImportIssues.map((issue, index) => (
                  <tr
                    key={`${issue.row}-${issue.rider_code ?? ""}-${issue.date ?? ""}-${(safeIssuePage - 1) * importIssuePageSize + index}`}
                    className="border-t border-red-100 text-red-800"
                  >
                    <td className="px-3 py-2">{issue.row}</td>
                    <td className="px-3 py-2 font-mono">{issue.rider_code ?? "-"}</td>
                    <td className="px-3 py-2">{issue.date ?? "-"}</td>
                    <td className="px-3 py-2">{issue.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            className="mt-3"
            page={safeIssuePage}
            pageCount={issuePageCount}
            total={importIssues.length}
            pageSize={importIssuePageSize}
            onPageChange={setIssuePage}
          />
        </Card>
      ) : null}
      {!canEdit && !loading ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Tài khoản viewer chỉ được xem lịch. Admin hoặc leader mới có thể chỉnh sửa.
        </p>
      ) : null}

      <section aria-label="Biểu đồ chấm công" className="grid grid-cols-12 gap-4">
        <AttendanceTrendChart className="col-span-12 xl:col-span-7" days={days} summaries={dailySummaries} />
        <AttendanceDistribution className="col-span-12 xl:col-span-5" summary={selectedSummary} date={selectedDate} />
      </section>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <Button
          type="button"
          variant="secondary"
          className="size-10 p-0"
          disabled={dayWindowIndex <= 0}
          onClick={() => changeDayWindow(dayWindowIndex - 1)}
          aria-label="7 ngày trước"
        >
          <ChevronLeft size={17} />
        </Button>
        <div className="text-center">
          <p className="text-xs font-black text-slate-800">Tuần {dayWindowIndex + 1}/{dayWindowCount}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {format(visibleDays[0], "dd/MM")} - {format(visibleDays[visibleDays.length - 1], "dd/MM/yyyy")}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="size-10 p-0"
          disabled={dayWindowIndex >= dayWindowCount - 1}
          onClick={() => changeDayWindow(dayWindowIndex + 1)}
          aria-label="7 ngày sau"
        >
          <ChevronRight size={17} />
        </Button>
      </div>

      <div className="md:hidden">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3">
          {visibleDays.map((day) => {
            const date = format(day, "yyyy-MM-dd");
            const active = date === selectedDate;
            const summary = dailySummaries.get(date) ?? { on: 0, total: 0 };
            return (
              <button
                key={date}
                type="button"
                className={`min-w-16 rounded-xl border px-2 py-2 text-center ${
                  active
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-700"
                }`}
                onClick={() => setSelectedDate(date)}
              >
                <span className="block text-[10px] font-semibold uppercase">
                  {format(day, "EEE", { locale: vi })}
                </span>
                <span className="mt-0.5 block text-lg font-bold">{format(day, "dd")}</span>
                <span className={`mt-1 block text-[10px] ${active ? "text-slate-300" : "text-slate-400"}`}>
                  {summary.on}/{summary.total}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {paginatedRiders.map((rider) => {
            const log = logMap.get(cellKey(rider.id, selectedDate));
            const status = displayStatus(log?.status);
            const saving = savingCells.has(cellKey(rider.id, selectedDate));
            return (
              <Card key={rider.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/attendance/riders/${rider.id}?month=${month}`}
                      className="block truncate font-bold text-slate-950 underline-offset-4 hover:text-blue-700 hover:underline"
                    >
                      {rider.full_name ?? rider.rider_code}
                    </Link>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">ID {rider.rider_code}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone="blue">{rider.kv ?? "-"}</Badge>
                      <Badge tone="amber">{rider.cot ?? "-"}</Badge>
                      <Badge>Quận {rider.delivery_district ?? "-"}</Badge>
                      <Badge>Phường {rider.delivery_ward ?? "-"}</Badge>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-10 shrink-0 p-0"
                    disabled={!canEdit}
                    onClick={() => openEditor(rider, selectedDate)}
                  >
                    <Pencil size={16} />
                  </Button>
                </div>
                <StatusSelect
                  className="mt-4"
                  value={status}
                  saving={saving}
                  disabled={!canEdit}
                  onChange={(value) => void updateCell(rider, selectedDate, value)}
                />
                {log?.note ? <p className="mt-2 text-xs text-slate-500">Ghi chú: {log.note}</p> : null}
              </Card>
            );
          })}
        </div>
      </div>

      <section className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
        <div className="border-b border-slate-200 px-4 py-3"><h2 className="font-semibold text-slate-950">Chi tiết chấm công · {formatSelectedDate(selectedDate)}</h2><p className="text-xs text-slate-500">Chọn một dòng để cập nhật lịch hoặc mở lịch sử rider.</p></div>
        <div className="max-h-[620px] min-h-[420px] overflow-auto"><table className="w-full min-w-[1050px] table-fixed text-left text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-600 shadow-[0_1px_0_#e2e8f0]"><tr><AttendanceSortHeader label="Rider" sortKey="name" current={attendanceSort} onSort={setAttendanceSort} className="w-[24%]" /><AttendanceSortHeader label="Ngày" sortKey="date" current={attendanceSort} onSort={setAttendanceSort} /><AttendanceSortHeader label="Ca" sortKey="shift" current={attendanceSort} onSort={setAttendanceSort} /><AttendanceSortHeader label="Trạng thái" sortKey="status" current={attendanceSort} onSort={setAttendanceSort} /><th className="px-4 py-3 font-semibold">Check-in</th><th className="px-4 py-3 font-semibold">Check-out</th><th className="px-4 py-3 font-semibold">Khu vực</th><th className="w-24" /></tr></thead><tbody className="divide-y divide-slate-100">{paginatedRiders.map((rider) => { const log = logMap.get(cellKey(rider.id, selectedDate)); return <tr key={rider.id} className="h-16 transition hover:bg-blue-50/50"><td className="px-4"><Link href={`/attendance/riders/${rider.id}?month=${month}`} className="font-semibold text-slate-950 hover:text-blue-700">{rider.full_name ?? rider.rider_code}</Link><p className="font-mono text-xs text-slate-500">{rider.rider_code}</p></td><td className="px-4 tabular-nums text-slate-700">{format(parseISO(selectedDate), "dd/MM/yyyy")}</td><td className="px-4 text-slate-700">{log?.shift ?? rider.current_shift ?? "—"}</td><td className="px-4"><AttendanceBadge category={attendanceCategory(log)} /></td><td className="px-4 tabular-nums text-slate-700">{attendanceTime(log, "check_in")}</td><td className="px-4 tabular-nums text-slate-700">{attendanceTime(log, "check_out")}</td><td className="px-4"><p className="truncate font-medium text-slate-700">{rider.delivery_district ?? "—"}</p><p className="truncate text-xs text-slate-500">{rider.delivery_ward ?? rider.kv ?? "—"}</p></td><td className="px-3 text-right"><Button type="button" variant="ghost" className="h-9 px-3" disabled={!canEdit} onClick={() => openEditor(rider, selectedDate)}><Pencil size={15} />Sửa</Button></td></tr>; })}{!loading && paginatedRiders.length === 0 ? <tr><td colSpan={8} className="h-72 text-center text-sm text-slate-500">Không có bản ghi phù hợp.</td></tr> : null}</tbody></table></div>
      </section>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <PaginationBar
          page={safeRiderPage}
          pageCount={riderPageCount}
            total={visibleRiders.length}
          pageSize={riderPageSize}
          onPageChange={setRiderPage}
        />
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          Số rider mỗi trang
          <Select
            className="h-9 w-24"
            value={String(riderPageSize)}
            onChange={(event) => {
              setRiderPageSize(Number(event.target.value));
              setRiderPage(1);
            }}
          >
            {riderPageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </Select>
        </label>
      </div>

      {editor ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/45 backdrop-blur-sm sm:place-items-center sm:p-4">
          <button
            type="button"
            aria-label="Đóng chi tiết lịch"
            className="absolute inset-0"
            onClick={() => setEditor(null)}
          />
          <Card className="relative z-10 w-full max-w-lg rounded-b-none shadow-2xl sm:rounded-xl">
            <form className="space-y-4" onSubmit={saveEditor}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-950">{editor.rider.full_name ?? editor.rider.rider_code}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {editor.rider.rider_code} · {format(parseISO(editor.date), "EEEE, dd/MM/yyyy", { locale: vi })}
                  </p>
                </div>
                <Button type="button" variant="ghost" className="size-10 p-0" onClick={() => setEditor(null)}>
                  <X size={19} />
                </Button>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Trạng thái</span>
                <Select
                  value={editor.status}
                  onChange={(event) =>
                    setEditor((current) =>
                      current ? { ...current, status: event.target.value as ScheduleStatus } : current,
                    )
                  }
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Ca làm</span>
                <Input
                  placeholder="Ví dụ: AM, PM, Full day"
                  value={editor.shift}
                  onChange={(event) =>
                    setEditor((current) => (current ? { ...current, shift: event.target.value } : current))
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Ghi chú</span>
                <textarea
                  className="min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                  placeholder="Lý do nghỉ hoặc ghi chú vận hành"
                  value={editor.note}
                  onChange={(event) =>
                    setEditor((current) => (current ? { ...current, note: event.target.value } : current))
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" onClick={() => setEditor(null)}>
                  Hủy
                </Button>
                <Button type="submit" disabled={savingCells.has(cellKey(editor.rider.id, editor.date))}>
                  Lưu lịch
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

// Kept as the compact monthly matrix renderer used by downstream attendance variants.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const DesktopScheduleRow = memo(function DesktopScheduleRow({
  rider,
  index,
  days,
  logMap,
  savingCells,
  selectedDate,
  canEdit,
  onEdit,
}: {
  rider: Rider;
  index: number;
  days: Date[];
  logMap: Map<string, AttendanceLog>;
  savingCells: Set<string>;
  selectedDate: string;
  canEdit: boolean;
  onEdit: (rider: Rider, date: string) => void;
}) {
  const rowClass = index % 2 === 0 ? "bg-white" : "bg-slate-50";

  return (
    <tr>
      <td className={`sticky left-0 z-20 h-[74px] border-b border-r border-slate-200 px-4 py-3 ${rowClass}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="max-w-44 truncate text-sm font-bold text-slate-950">
              <Link
                href={`/attendance/riders/${rider.id}?month=${format(days[0], "yyyy-MM")}`}
                className="underline-offset-4 hover:text-blue-700 hover:underline"
              >
                {rider.full_name ?? rider.rider_code}
              </Link>
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500">{rider.rider_code}</p>
            <p className="mt-1 truncate text-[11px] text-slate-500">
              {rider.kv ?? "-"} · {rider.cot ?? "-"}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              Giao {rider.delivery_district ?? "-"} · Phường {rider.delivery_ward ?? "-"}
            </p>
          </div>
        </div>
      </td>
      {days.map((day) => {
        const date = format(day, "yyyy-MM-dd");
        const key = cellKey(rider.id, date);
        const log = logMap.get(key);
        return (
          <DesktopScheduleCell
            key={date}
            rider={rider}
            date={date}
            value={displayStatus(log?.status)}
            saving={savingCells.has(key)}
            selected={date === selectedDate}
            rowClass={rowClass}
            canEdit={canEdit}
            onEdit={onEdit}
          />
        );
      })}
    </tr>
  );
});

const DesktopScheduleCell = memo(function DesktopScheduleCell({
  rider,
  date,
  value,
  saving,
  selected,
  rowClass,
  canEdit,
  onEdit,
}: {
  rider: Rider;
  date: string;
  value: ScheduleStatus;
  saving: boolean;
  selected: boolean;
  rowClass: string;
  canEdit: boolean;
  onEdit: (rider: Rider, date: string) => void;
}) {
  return (
    <td className={`h-[74px] border-b border-r border-slate-200 p-2 ${selected ? "bg-blue-50/60" : rowClass}`}>
      <button
        type="button"
        disabled={!canEdit || saving}
        className={`${statusChipClasses(value)} flex h-full min-h-12 w-full flex-col items-center justify-center rounded-xl border px-2 text-center text-xs font-black transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70`}
        onClick={() => onEdit(rider, date)}
      >
        <span>{saving ? "..." : statusShortLabel(value)}</span>
        {value ? <span className="mt-0.5 text-[9px] font-semibold opacity-70">click sửa</span> : null}
      </button>
    </td>
  );
});

function StatusSelect({
  value,
  onChange,
  disabled,
  saving,
  compact,
  className = "",
}: {
  value: ScheduleStatus;
  onChange: (value: ScheduleStatus) => void;
  disabled: boolean;
  saving: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <select
      aria-label="Trạng thái lịch"
      className={`${statusClasses(value)} ${compact ? "h-12 w-28 px-2 text-xs" : "h-11 w-full px-3 text-sm"} ${className} rounded-lg border font-bold outline-none transition focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-60`}
      value={value}
      disabled={disabled || saving}
      onChange={(event) => onChange(event.target.value as ScheduleStatus)}
    >
      {statusOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {saving ? "Đang lưu..." : option.label}
        </option>
      ))}
    </select>
  );
}

function AttendanceKpi({ label, value, helper, tone, icon, active, onClick, className }: { label: string; value: number | string; helper: string; tone: "green" | "red" | "amber" | "blue"; icon: React.ReactNode; active: boolean; onClick: () => void; className?: string }) { const colors = { green: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700" }; return <button type="button" aria-pressed={active} onClick={onClick} className={`${className ?? ""} min-h-36 rounded-xl border bg-white p-4 text-left transition hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 ${active ? "border-blue-300 ring-1 ring-blue-100" : "border-slate-200"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-slate-600">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums text-slate-950">{value}</p></div><span className={`grid size-9 place-items-center rounded-lg ${colors[tone]}`}>{icon}</span></div><p className="mt-4 text-xs text-slate-500">{helper}</p></button>; }

function AttendanceBadge({ category }: { category: AttendanceCategory }) { const styles = { present: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", absent: "bg-red-50 text-red-700 ring-red-600/20", late: "bg-amber-50 text-amber-800 ring-amber-600/20", leave: "bg-blue-50 text-blue-700 ring-blue-600/20" }; return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${styles[category]}`}>{attendanceCategoryLabel(category)}</span>; }

function FilterPill({ label, onRemove }: { label: string; onRemove: (() => void) | null }) { return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-blue-700">{label}{onRemove ? <button type="button" className="grid size-5 place-items-center rounded-full hover:bg-blue-100" onClick={onRemove} aria-label={`Xóa ${label}`}><X size={12} /></button> : <span className="w-1" />}</span>; }

function AttendanceSortHeader({ label, sortKey, current, onSort, className }: { label: string; sortKey: AttendanceSortKey; current: { key: AttendanceSortKey; direction: "asc" | "desc" }; onSort: React.Dispatch<React.SetStateAction<{ key: AttendanceSortKey; direction: "asc" | "desc" }>>; className?: string }) { const Icon = current.key !== sortKey ? ArrowUpDown : current.direction === "asc" ? ArrowUp : ArrowDown; return <th className={`px-4 py-3 ${className ?? ""}`}><button type="button" className="flex items-center gap-1 font-semibold hover:text-slate-950" onClick={() => onSort((value) => value.key === sortKey ? { key: sortKey, direction: value.direction === "asc" ? "desc" : "asc" } : { key: sortKey, direction: "asc" })}>{label}<Icon size={13} /></button></th>; }

function AttendanceTrendChart({ days, summaries, className }: { days: Date[]; summaries: Map<string, ReturnType<typeof summarizeDate>>; className?: string }) { const points = days.map((day, index) => { const summary = summaries.get(format(day, "yyyy-MM-dd")); const rate = summary?.total ? summary.present / summary.total : 0; return `${days.length > 1 ? index / (days.length - 1) * 100 : 0},${92 - rate * 80}`; }).join(" "); return <article className={`${className ?? ""} rounded-xl border border-slate-200 bg-white p-4`}><div className="flex items-center gap-2"><CalendarDays size={18} className="text-emerald-700" /><h2 className="font-semibold text-slate-950">Tỷ lệ có mặt theo ngày</h2></div><p className="mt-1 text-sm text-slate-500">Xu hướng trong tháng và phạm vi bộ lọc hiện tại.</p><div className="mt-5 h-44"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Biểu đồ tỷ lệ có mặt"><line x1="0" y1="92" x2="100" y2="92" stroke="#e2e8f0" strokeWidth="1" /><line x1="0" y1="52" x2="100" y2="52" stroke="#e2e8f0" strokeWidth="0.6" strokeDasharray="2 2" /><polyline points={points} fill="none" stroke="#059669" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg></div><div className="flex justify-between text-xs text-slate-400"><span>{days[0] ? format(days[0], "dd/MM") : ""}</span><span>50%</span><span>{days.at(-1) ? format(days.at(-1)!, "dd/MM") : ""}</span></div></article>; }

function AttendanceDistribution({ summary, date, className }: { summary: ReturnType<typeof summarizeDate>; date: string; className?: string }) { const items: Array<{ key: AttendanceCategory; value: number; color: string }> = [{ key: "present", value: summary.present, color: "bg-emerald-500" }, { key: "absent", value: summary.absent, color: "bg-red-500" }, { key: "late", value: summary.late, color: "bg-amber-500" }, { key: "leave", value: summary.leave, color: "bg-blue-500" }]; const max = Math.max(1, ...items.map((item) => item.value)); return <article className={`${className ?? ""} rounded-xl border border-slate-200 bg-white p-4`}><h2 className="font-semibold text-slate-950">Phân bố trạng thái</h2><p className="mt-1 text-sm text-slate-500">{formatSelectedDate(date)}</p><div className="mt-6 space-y-4">{items.map((item) => <div key={item.key}><div className="mb-1.5 flex justify-between text-sm"><span className="text-slate-600">{attendanceCategoryLabel(item.key)}</span><strong className="tabular-nums text-slate-900">{item.value}</strong></div><div className="h-2 rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.value / max * 100}%` }} /></div></div>)}</div></article>; }

function PaginationBar({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  className = "",
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <p className="text-xs font-semibold text-slate-500">
        {start}-{end} / {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          className="size-9 p-0"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Trang trước"
        >
          <ChevronLeft size={16} />
        </Button>
        <span className="min-w-20 text-center text-xs font-bold text-slate-700">Trang {page}/{pageCount}</span>
        <Button
          type="button"
          variant="secondary"
          className="size-9 p-0"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          aria-label="Trang sau"
        >
          <ChevronRight size={16} />
        </Button>
      </div>
    </div>
  );
}

function summarizeDate(date: string, riders: Rider[], logMap: Map<string, AttendanceLog>) {
  let on = 0;
  let off = 0;
  let defaultOn = 0;
  let present = 0;
  let absent = 0;
  let late = 0;
  let leave = 0;
  for (const rider of riders) {
    const log = logMap.get(cellKey(rider.id, date));
    const status = displayStatus(log?.status);
    if (isWorkingStatus(status)) on += 1;
    else if (status.startsWith("OFF_")) off += 1;
    if (!log) defaultOn += 1;
    const category = attendanceCategory(log);
    if (category === "present") present += 1;
    else if (category === "absent") absent += 1;
    else if (category === "late") late += 1;
    else leave += 1;
  }
  return { on, off, defaultOn, present, absent, late, leave, total: riders.length };
}

function attendanceCategory(log: AttendanceLog | undefined): AttendanceCategory {
  const rawStatus = log?.status?.trim().toUpperCase() ?? "";
  const rawLate = log?.raw_data?.late ?? log?.raw_data?.is_late;
  if (rawStatus.includes("LATE") || rawLate === true || rawLate === "true" || rawLate === 1) return "late";
  const status = displayStatus(log?.status);
  if (status === "OFF_UNEXPECTED") return "absent";
  if (status === "OFF_APPROVED" || status === "OFF_WEEKLY") return "leave";
  return "present";
}

function attendanceCategoryLabel(category: AttendanceCategory) { return ({ present: "Có mặt", absent: "Vắng đột xuất", late: "Đi trễ", leave: "Nghỉ phép" } as const)[category]; }

function attendanceTime(log: AttendanceLog | undefined, kind: "check_in" | "check_out") {
  const value = kind === "check_in" ? log?.raw_data?.check_in ?? log?.raw_data?.check_in_time : log?.raw_data?.check_out ?? log?.raw_data?.check_out_time;
  if (typeof value !== "string" || !value.trim()) return "—";
  const date = new Date(value);
  if (Number.isFinite(date.getTime())) return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
  return value;
}

function compareAttendanceRiders(a: Rider, b: Rider, logMap: Map<string, AttendanceLog>, date: string, sort: { key: AttendanceSortKey }) {
  if (sort.key === "name") return (a.full_name ?? a.rider_code).localeCompare(b.full_name ?? b.rider_code, "vi", { numeric: true });
  if (sort.key === "date") return 0;
  const aLog = logMap.get(cellKey(a.id, date));
  const bLog = logMap.get(cellKey(b.id, date));
  if (sort.key === "shift") return (aLog?.shift ?? a.current_shift ?? "").localeCompare(bLog?.shift ?? b.current_shift ?? "", "vi");
  return attendanceCategoryLabel(attendanceCategory(aLog)).localeCompare(attendanceCategoryLabel(attendanceCategory(bLog)), "vi");
}

function formatSelectedDate(value: string) { const date = parseISO(value); return Number.isFinite(date.getTime()) ? format(date, "dd/MM/yyyy") : value; }

function normalizeStatus(status: string | null | undefined): ScheduleStatus {
  const normalized = status?.trim().toUpperCase() ?? "";
  if (!normalized) return "";
  if (normalized === "ON") return "ON";
  if (normalized === "WORKING_REST_DAY") return "WORKING_REST_DAY";
  if (normalized === "NO_PICKUP") return "NO_PICKUP";
  if (normalized.includes("UNEXPECTED") || normalized.includes("ĐỘT") || normalized.includes("DOT")) {
    return "OFF_UNEXPECTED";
  }
  if (normalized.includes("APPROVED") || normalized.includes("PHÉP") || normalized.includes("PHEP")) {
    return "OFF_APPROVED";
  }
  if (normalized.includes("OFF")) return "OFF_WEEKLY";
  return "";
}

function displayStatus(status: string | null | undefined): ScheduleStatus {
  return normalizeStatus(status) || "ON";
}

function statusLabel(status: ScheduleStatus) {
  return statusOptions.find((option) => option.value === status)?.label ?? "ON";
}

function statusShortLabel(status: ScheduleStatus) {
  if (status === "ON") return "ON";
  if (status === "OFF_WEEKLY") return "Tuần";
  if (status === "OFF_APPROVED") return "Phép";
  if (status === "OFF_UNEXPECTED") return "Đột xuất";
  if (status === "WORKING_REST_DAY") return "Đi làm OFF";
  if (status === "NO_PICKUP") return "Không pick";
  return "-";
}

function statusChipClasses(status: ScheduleStatus) {
  if (status === "ON") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "OFF_WEEKLY") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "OFF_APPROVED") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "OFF_UNEXPECTED") return "border-red-200 bg-red-50 text-red-700";
  if (status === "WORKING_REST_DAY") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (status === "NO_PICKUP") return "border-slate-300 bg-slate-100 text-slate-700";
  return "border-slate-200 bg-white text-slate-300";
}

function statusClasses(status: ScheduleStatus) {
  if (status === "ON") return "border-emerald-200 bg-emerald-100 text-emerald-800";
  if (status === "OFF_WEEKLY") return "border-amber-200 bg-amber-100 text-amber-800";
  if (status === "OFF_APPROVED") return "border-blue-200 bg-blue-100 text-blue-800";
  if (status === "OFF_UNEXPECTED") return "border-red-200 bg-red-100 text-red-800";
  if (status === "WORKING_REST_DAY") return "border-cyan-200 bg-cyan-100 text-cyan-800";
  if (status === "NO_PICKUP") return "border-slate-300 bg-slate-200 text-slate-800";
  return "border-slate-200 bg-slate-100 text-slate-500";
}

function isWorkingStatus(status: ScheduleStatus) {
  return status === "ON" || status === "WORKING_REST_DAY" || status === "NO_PICKUP";
}

function cellKey(riderId: string, date: string) {
  return `${riderId}:${date}`;
}

function uniqueOptions(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, "vi"),
  );
}
