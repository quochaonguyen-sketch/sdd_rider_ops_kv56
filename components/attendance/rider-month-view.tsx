"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Home,
  MapPin,
  Navigation,
  Pencil,
  RefreshCcw,
  UserRound,
  X,
} from "lucide-react";
import type { AttendanceLog, Rider } from "@/types";
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
  | "NO_PICKUP"
  | "NO_DELIVERY";

type RiderMonthResponse = {
  success: boolean;
  can_edit?: boolean;
  rider?: Rider;
  logs?: AttendanceLog[];
  error?: string;
};

type DayEditor = {
  date: string;
  status: ScheduleStatus;
  shift: string;
  note: string;
};

const statusOptions: Array<{ value: ScheduleStatus; label: string }> = [
  { value: "ON", label: "ON" },
  { value: "OFF_WEEKLY", label: "OFF tuần" },
  { value: "OFF_APPROVED", label: "OFF phép" },
  { value: "OFF_UNEXPECTED", label: "OFF đột xuất" },
  { value: "WORKING_REST_DAY", label: "OFF nhưng không OFF" },
  { value: "NO_PICKUP", label: "Không đi pick" },
  { value: "NO_DELIVERY", label: "Không đi giao" },
];

const weekdayLabels = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "CN"];

export function RiderMonthView({ riderId, initialMonth }: { riderId: string; initialMonth: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [rider, setRider] = useState<Rider | null>(null);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<DayEditor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/attendance/riders/${riderId}?month=${month}`, { cache: "no-store" });
    const result = (await response.json().catch(() => null)) as RiderMonthResponse | null;

    if (!response.ok || !result?.success || !result.rider) {
      setError(result?.error ?? "Không thể tải lịch rider");
    } else {
      setRider(result.rider);
      setLogs(result.logs ?? []);
      setCanEdit(Boolean(result.can_edit));
    }
    setLoading(false);
  }, [month, riderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const monthDate = useMemo(() => parseISO(`${month}-01`), [month]);
  const days = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(monthDate), end: endOfMonth(monthDate) }),
    [monthDate],
  );
  const leadingBlanks = useMemo(() => (startOfMonth(monthDate).getDay() + 6) % 7, [monthDate]);
  const logByDate = useMemo(() => new Map(logs.map((log) => [log.work_date, log])), [logs]);

  const summary = useMemo(() => {
    let weekly = 0;
    let approved = 0;
    let unexpected = 0;
    for (const log of logs) {
      const status = normalizeStatus(log.status);
      if (status === "OFF_WEEKLY") weekly += 1;
      else if (status === "OFF_APPROVED") approved += 1;
      else if (status === "OFF_UNEXPECTED") unexpected += 1;
    }
    const off = weekly + approved + unexpected;
    return {
      on: Math.max(0, days.length - off),
      off,
      defaultOn: Math.max(0, days.length - logs.length),
      weekly,
      approved,
      unexpected,
    };
  }, [days.length, logs]);

  function changeMonth(nextMonth: string) {
    setMonth(nextMonth);
    setEditor(null);
    setSuccess(null);
    router.replace(`/attendance/riders/${riderId}?month=${nextMonth}`, { scroll: false });
  }

  function openDay(date: string) {
    const log = logByDate.get(date);
    setEditor({
      date,
      status: displayStatus(log?.status),
      shift: log?.shift ?? "",
      note: log?.note ?? "",
    });
    setSuccess(null);
  }

  async function saveDay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || !rider) return;

    setSaving(true);
    setError(null);
    const response = await fetch("/api/attendance/schedule", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: [
          {
            rider_id: rider.id,
            work_date: editor.date,
            status: editor.status === "ON" ? "" : editor.status,
            shift: editor.status === "ON" ? null : editor.shift,
            note: editor.status === "ON" ? null : editor.note,
          },
        ],
      }),
    });
    const result = (await response.json().catch(() => null)) as RiderMonthResponse | null;
    setSaving(false);

    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể cập nhật lịch");
      return;
    }

    setLogs((current) => [
      ...current.filter((log) => log.work_date !== editor.date),
      ...(result.logs ?? []),
    ]);
    setSuccess(`Đã cập nhật lịch ngày ${format(parseISO(editor.date), "dd/MM/yyyy")}.`);
    setEditor(null);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <Link
            href={`/attendance?month=${month}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft size={19} />
          </Link>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Lịch cá nhân</p>
            <h1 className="mt-0.5 text-xl font-bold text-slate-950 sm:text-2xl">
              {rider?.full_name ?? (loading ? "Đang tải rider..." : "Rider")}
            </h1>
            <p className="mt-0.5 font-mono text-sm text-slate-500">{rider?.rider_code ?? ""}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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

      {rider ? (
        <Card className="grid gap-4 lg:grid-cols-[auto_1fr]">
          <RiderAvatar rider={rider} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <RiderInfo icon={<Home size={16} />} label="KV / COT" value={`${rider.kv ?? "-"} · ${rider.cot ?? "-"}`} />
            <RiderInfo icon={<MapPin size={16} />} label="Quận giao" value={rider.delivery_district ?? "-"} />
            <RiderInfo icon={<Navigation size={16} />} label="Phường giao" value={rider.delivery_ward ?? "-"} />
            <RiderInfo
              icon={<UserRound size={16} />}
              label="Trạng thái rider"
              value={rider.status === "inactive" ? "Inactive" : "Active"}
            />
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Metric label="Đi làm" value={summary.on} tone="green" />
        <Metric label="Tổng nghỉ" value={summary.off} tone="red" />
        <Metric label="ON" value={summary.defaultOn} tone="slate" />
        <Metric label="OFF tuần" value={summary.weekly} tone="amber" />
        <Metric label="OFF phép" value={summary.approved} tone="blue" />
        <Metric label="Đột xuất" value={summary.unexpected} tone="red" />
      </div>

      {success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <Card className="overflow-hidden p-0">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {weekdayLabels.map((label) => (
            <div key={label} className="px-1 py-3 text-center text-[10px] font-bold uppercase text-slate-500 sm:text-xs">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array.from({ length: leadingBlanks }, (_, index) => (
            <div key={`blank-${index}`} className="min-h-24 border-b border-r border-slate-100 bg-slate-50/50 sm:min-h-32" />
          ))}
          {days.map((day) => {
            const date = format(day, "yyyy-MM-dd");
            const log = logByDate.get(date);
            const status = displayStatus(log?.status);
            return (
              <button
                key={date}
                type="button"
                className={`group min-h-24 border-b border-r border-slate-100 p-1.5 text-left transition hover:bg-blue-50 sm:min-h-32 sm:p-2.5 ${
                  date === format(new Date(), "yyyy-MM-dd") ? "ring-2 ring-inset ring-blue-400" : ""
                }`}
                onClick={() => openDay(date)}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="text-sm font-black text-slate-900 sm:text-base">{format(day, "dd")}</span>
                  {canEdit ? <Pencil className="hidden text-slate-400 group-hover:block" size={13} /> : null}
                </div>
                <span className={`mt-2 flex min-h-9 items-center justify-center rounded-lg border px-1 text-center text-[10px] font-black sm:text-xs ${statusClasses(status)}`}>
                  {statusLabel(status)}
                </span>
                {log?.shift ? <p className="mt-1 truncate text-[9px] text-slate-500 sm:text-[10px]">Ca {log.shift}</p> : null}
                {log?.note ? <p className="mt-1 line-clamp-2 text-[9px] text-slate-400 sm:text-[10px]">{log.note}</p> : null}
              </button>
            );
          })}
        </div>
      </Card>

      {!canEdit && !loading ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          Tài khoản viewer chỉ được xem lịch cá nhân.
        </p>
      ) : null}

      {editor && rider ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-end bg-slate-950/45 backdrop-blur-sm sm:place-items-center sm:p-4">
          <button type="button" aria-label="Đóng form lịch" className="absolute inset-0" onClick={() => setEditor(null)} />
          <Card className="app-modal-panel relative z-10 w-full max-w-lg rounded-b-none shadow-2xl sm:rounded-xl">
            <form className="space-y-4" onSubmit={saveDay}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-slate-950">
                    {format(parseISO(editor.date), "EEEE, dd/MM/yyyy", { locale: vi })}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">{rider.full_name ?? rider.rider_code}</p>
                </div>
                <Button type="button" variant="ghost" className="size-10 p-0" onClick={() => setEditor(null)}>
                  <X size={19} />
                </Button>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Trạng thái</span>
                <Select
                  value={editor.status}
                  disabled={!canEdit}
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
                  disabled={!canEdit}
                  placeholder="AM, PM, Full day"
                  value={editor.shift}
                  onChange={(event) =>
                    setEditor((current) => (current ? { ...current, shift: event.target.value } : current))
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase text-slate-500">Ghi chú</span>
                <textarea
                  disabled={!canEdit}
                  className="min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:bg-slate-50"
                  value={editor.note}
                  onChange={(event) =>
                    setEditor((current) => (current ? { ...current, note: event.target.value } : current))
                  }
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant="secondary" onClick={() => setEditor(null)}>
                  Đóng
                </Button>
                <Button type="submit" disabled={!canEdit || saving}>
                  {saving ? "Đang lưu..." : "Lưu lịch"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function RiderAvatar({ rider }: { rider: Rider }) {
  if (rider.avatar_url) {
    return (
      <span
        className="size-20 shrink-0 rounded-2xl border-4 border-white bg-cover bg-center shadow ring-1 ring-slate-200"
        style={{ backgroundImage: `url("${rider.avatar_url}")` }}
      />
    );
  }
  return (
    <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-slate-200">
      <UserRound size={32} />
    </span>
  );
}

function RiderInfo({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-bold text-slate-800" title={value}>
        {value}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "red" | "amber" | "blue" | "slate";
}) {
  const classes = {
    green: "bg-emerald-50 text-emerald-800",
    red: "bg-red-50 text-red-800",
    amber: "bg-amber-50 text-amber-800",
    blue: "bg-blue-50 text-blue-800",
    slate: "bg-slate-100 text-slate-800",
  };
  return (
    <div className={`rounded-xl p-3 sm:p-4 ${classes[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function normalizeStatus(status: string | null | undefined): ScheduleStatus {
  const normalized = status?.trim().toUpperCase() ?? "";
  if (!normalized) return "";
  if (normalized === "ON") return "ON";
  if (normalized === "WORKING_REST_DAY") return "WORKING_REST_DAY";
  if (normalized === "NO_PICKUP") return "NO_PICKUP";
  if (normalized === "NO_DELIVERY") return "NO_DELIVERY";
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
  if (status === "ON") return "ON";
  if (status === "OFF_WEEKLY") return "OFF tuần";
  if (status === "OFF_APPROVED") return "OFF phép";
  if (status === "OFF_UNEXPECTED") return "Đột xuất";
  if (status === "WORKING_REST_DAY") return "Đi làm ngày OFF";
  if (status === "NO_PICKUP") return "Không đi pick";
  if (status === "NO_DELIVERY") return "Không đi giao";
  return "ON";
}

function statusClasses(status: ScheduleStatus) {
  if (status === "ON") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "OFF_WEEKLY") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "OFF_APPROVED") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "OFF_UNEXPECTED") return "border-red-200 bg-red-50 text-red-700";
  if (status === "WORKING_REST_DAY") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (status === "NO_PICKUP") return "border-slate-200 bg-slate-100 text-slate-700";
  if (status === "NO_DELIVERY") return "border-violet-200 bg-violet-50 text-violet-700";
  return "border-slate-200 bg-slate-50 text-slate-400";
}
