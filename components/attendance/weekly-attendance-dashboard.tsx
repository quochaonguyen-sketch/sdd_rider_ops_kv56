"use client";

import Link from "next/link";
import { addDays, addWeeks, format, getISOWeek, parseISO, startOfWeek } from "date-fns";
import { vi } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { AttendanceLog, Rider } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { canonicalDistrictShortName } from "@/lib/locations/hcm";

const KV5_DISTRICT_ORDER = ["Quận 2", "Quận 9", "Bình Thạnh", "Quận 3", "Hóc Môn", "Quận 12", "Gò Vấp"];

export type WeeklyAttendanceStatus = "working" | "off" | "incident";

export interface WeeklyDaySummary {
  date: string;
  working: number;
  off: number;
  incidents: number;
}

interface WeeklyAttendanceDashboardProps {
  riders: Rider[];
  logs: AttendanceLog[];
  selectedDate: string;
  loading: boolean;
  canEdit: boolean;
  savingCells: Set<string>;
  query: string;
  area: string;
  team: string;
  attendanceFilter: string;
  onlyExceptions: boolean;
  areaOptions: string[];
  teamOptions: string[];
  onQueryChange: (value: string) => void;
  onAreaChange: (value: string) => void;
  onTeamChange: (value: string) => void;
  onAttendanceFilterChange: (value: string) => void;
  onOnlyExceptionsChange: (value: boolean) => void;
  onSelectDate: (date: string) => void;
  onChangeWeek: (date: string) => void;
  onEditCell: (rider: Rider, date: string) => void;
  actions: React.ReactNode;
}

export function WeeklyAttendanceDashboard({
  riders,
  logs,
  selectedDate,
  loading,
  canEdit,
  savingCells,
  query,
  area,
  team,
  attendanceFilter,
  onlyExceptions,
  areaOptions,
  teamOptions,
  onQueryChange,
  onAreaChange,
  onTeamChange,
  onAttendanceFilterChange,
  onOnlyExceptionsChange,
  onSelectDate,
  onChangeWeek,
  onEditCell,
  actions,
}: WeeklyAttendanceDashboardProps) {
  const weekStart = startOfWeek(parseISO(selectedDate), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  const riderIdByCode = new Map(riders.map((rider) => [rider.rider_code, rider.id]));
  const logMap = new Map<string, AttendanceLog>();
  for (const log of logs) {
    const riderId = log.rider_id ?? riderIdByCode.get(log.rider_code);
    if (riderId) logMap.set(`${riderId}:${log.work_date.slice(0, 10)}`, log);
  }

  const summaries = weekDays.map((day) => summarizeDay(format(day, "yyyy-MM-dd"), riders, logMap));
  const statusFilteredRiders = riders.filter((rider) => {
    if (attendanceFilter === "all") return true;
    const status = attendanceStatus(logMap.get(`${rider.id}:${selectedDate}`));
    return attendanceFilter === "working" ? status === "working" : status !== "working";
  });
  const displayedRiders = (onlyExceptions
    ? statusFilteredRiders.filter((rider) => weekDays.some((day) => {
        const status = attendanceStatus(logMap.get(`${rider.id}:${format(day, "yyyy-MM-dd")}`));
        return status === "off" || status === "incident";
      }))
    : statusFilteredRiders).sort(compareRidersByOperationOrder);
  const districtRows = summarizeDistricts(selectedDate, riders, logMap);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">Vận hành rider</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Chấm công · Theo tuần</h1>
          <p className="mt-1 text-sm text-slate-500">Theo dõi quân số đi làm và OFF trong toàn bộ tuần vận hành.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </header>

      <section aria-label="Tuần và bộ lọc chấm công" className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <WeekSelector
            weekStart={weekStart}
            onPrevious={() => onChangeWeek(format(addWeeks(weekStart, -1), "yyyy-MM-dd"))}
            onNext={() => onChangeWeek(format(addWeeks(weekStart, 1), "yyyy-MM-dd"))}
          />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:flex">
            <label className="relative min-w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input className="h-10 pl-9" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Tìm rider" aria-label="Tìm rider" />
            </label>
            <Select className="h-10 min-w-36" value={area} onChange={(event) => onAreaChange(event.target.value)} aria-label="Lọc theo quận">
              <option value="all">Tất cả quận</option>
              {areaOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <Select className="h-10 min-w-36" value={team} onChange={(event) => onTeamChange(event.target.value)} aria-label="Lọc theo cột">
              <option value="all">Tất cả cột</option>
              {teamOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
            <Select className="h-10 min-w-36" value={attendanceFilter} onChange={(event) => onAttendanceFilterChange(event.target.value)} aria-label="Lọc trạng thái chấm công">
              <option value="all">Tất cả trạng thái</option>
              <option value="working">Đang đi làm</option>
              <option value="off">Đang OFF</option>
            </Select>
          </div>
        </div>
      </section>

      <WeekStrip days={weekDays} summaries={summaries} selectedDate={selectedDate} onSelect={onSelectDate} />

      <DistrictAttendanceBreakdown date={selectedDate} rows={districtRows} />

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-950">Chi tiết chấm công rider</h2>
            <p className="mt-0.5 text-sm text-slate-500">{displayedRiders.length} rider · sắp xếp theo cột, quận, phường</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
            <input type="checkbox" checked={onlyExceptions} onChange={(event) => onOnlyExceptionsChange(event.target.checked)} className="size-4 rounded border-slate-300 accent-blue-600" />
            Chỉ hiện rider có OFF / sự cố
          </label>
        </div>
        <AttendanceTable
          riders={displayedRiders}
          days={weekDays}
          logMap={logMap}
          selectedDate={selectedDate}
          loading={loading}
          canEdit={canEdit}
          savingCells={savingCells}
          onEdit={onEditCell}
        />
      </section>
    </div>
  );
}

export function WeekSelector({ weekStart, onPrevious, onNext }: { weekStart: Date; onPrevious: () => void; onNext: () => void }) {
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  return <div className="flex items-center gap-2"><Button type="button" variant="secondary" className="size-10 p-0" onClick={onPrevious} aria-label="Tuần trước"><ChevronLeft size={17} /></Button><div className="min-w-44 text-center"><p className="text-sm font-bold text-slate-900">Tuần {getISOWeek(weekStart)} · {format(weekStart, "dd/MM")}–{format(weekEnd, "dd/MM")}</p><p className="text-xs text-slate-500">Năm {format(weekStart, "yyyy")}</p></div><Button type="button" variant="secondary" className="size-10 p-0" onClick={onNext} aria-label="Tuần sau"><ChevronRight size={17} /></Button></div>;
}

export function WeekStrip({ days, summaries, selectedDate, onSelect }: { days: Date[]; summaries: WeeklyDaySummary[]; selectedDate: string; onSelect: (date: string) => void }) {
  return <section aria-label="Tổng quan chấm công từng ngày" className="overflow-x-auto pb-1"><div className="grid min-w-[840px] grid-cols-7 gap-2">{days.map((day, index) => { const date = format(day, "yyyy-MM-dd"); const summary = summaries[index]; const selected = date === selectedDate; const exceptions = summary.off + summary.incidents; return <button key={date} type="button" aria-pressed={selected} onClick={() => onSelect(date)} className={`rounded-2xl border p-3 text-left transition ${selected ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" : exceptions > 0 ? "border-amber-200 bg-amber-50/40 hover:border-amber-300" : "border-slate-200 bg-white hover:border-blue-300"}`}><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase text-slate-500">{format(day, "EEE", { locale: vi })}</p><p className="mt-1 text-lg font-bold text-slate-950">{format(day, "dd/MM")}</p></div>{selected ? <span className="size-2 rounded-full bg-blue-600" /> : null}</div><div className="mt-4 space-y-1.5 text-xs"><StatLine label="Đi làm" value={summary.working} dot="bg-blue-600" /><StatLine label="OFF" value={summary.off} dot="bg-slate-400" /><StatLine label="Sự cố" value={summary.incidents} dot="bg-amber-500" /></div></button>; })}</div></section>;
}

function DistrictAttendanceBreakdown({ date, rows }: { date: string; rows: Array<{ district: string; total: number; working: number; off: number }> }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-4 py-3"><h2 className="font-semibold text-slate-950">Quân số theo quận · {format(parseISO(date), "dd/MM/yyyy")}</h2><p className="mt-0.5 text-sm text-slate-500">Tỷ lệ được tính trên tổng rider trong từng quận ở bộ lọc hiện tại.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 text-left">Quận</th><th className="px-4 py-3 text-right">Tổng rider</th><th className="px-4 py-3 text-right">Đi làm</th><th className="px-4 py-3 text-right">Tỷ lệ đi làm</th><th className="px-4 py-3 text-right">OFF</th><th className="px-4 py-3 text-right">Tỷ lệ OFF</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row) => { const workingRate = row.total ? Math.round(row.working / row.total * 100) : 0; const offRate = row.total ? Math.round(row.off / row.total * 100) : 0; return <tr key={row.district}><td className="px-4 py-3 font-semibold text-slate-900">{row.district}</td><td className="px-4 py-3 text-right tabular-nums text-slate-600">{row.total}</td><td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-700">{row.working}</td><td className="px-4 py-3 text-right"><span className="font-semibold tabular-nums text-blue-700">{workingRate}%</span></td><td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-700">{row.off}</td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-amber-500" style={{ width: `${offRate}%` }} /></div><span className="w-9 text-right font-semibold tabular-nums text-amber-700">{offRate}%</span></div></td></tr>; })}{rows.length === 0 ? <tr><td colSpan={6} className="h-28 text-center text-slate-500">Không có dữ liệu quận trong ngày đã chọn.</td></tr> : null}</tbody></table></div></section>;
}

function StatLine({ label, value, dot }: { label: string; value: number; dot: string }) { return <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-slate-500"><span className={`size-1.5 rounded-full ${dot}`} />{label}</span><strong className="tabular-nums text-slate-800">{value}</strong></div>; }

export function AttendanceTable({ riders, days, logMap, selectedDate, loading, canEdit, savingCells, onEdit }: { riders: Rider[]; days: Date[]; logMap: Map<string, AttendanceLog>; selectedDate: string; loading: boolean; canEdit: boolean; savingCells: Set<string>; onEdit: (rider: Rider, date: string) => void }) {
  return <div className="max-h-[640px] overflow-auto"><table className="w-full min-w-[960px] border-separate border-spacing-0 text-left"><thead className="sticky top-0 z-30 bg-slate-50"><tr><th className="sticky left-0 z-40 w-72 border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Rider · Cột · Quận · Phường</th>{days.map((day) => { const date = format(day, "yyyy-MM-dd"); return <th key={date} className={`min-w-24 border-b border-slate-200 px-2 py-3 text-center ${date === selectedDate ? "bg-blue-50" : ""}`}><p className="text-xs font-semibold uppercase text-slate-500">{format(day, "EEE", { locale: vi })}</p><p className="mt-0.5 text-sm font-bold text-slate-900">{format(day, "dd/MM")}</p></th>; })}</tr></thead><tbody>{loading ? <tr><td colSpan={8} className="h-48 text-center text-sm text-slate-500">Đang tải dữ liệu chấm công…</td></tr> : riders.length === 0 ? <tr><td colSpan={8} className="h-48 text-center text-sm text-slate-500">Không có rider phù hợp với bộ lọc.</td></tr> : riders.map((rider, index) => <tr key={rider.id} className="group"><td className={`sticky left-0 z-20 border-b border-r border-slate-200 px-4 py-3 ${index % 2 ? "bg-slate-50" : "bg-white"}`}><Link href={`/attendance/riders/${rider.id}?month=${format(days[0], "yyyy-MM")}`} className="block max-w-56 truncate text-sm font-semibold text-slate-900 hover:text-blue-700">{rider.full_name ?? rider.rider_code}</Link><p className="mt-0.5 font-mono text-[11px] text-slate-500">{rider.rider_code}</p><p className="mt-1 truncate text-[11px] text-slate-400">Cột {rider.cot ?? "—"} · {canonicalDistrictShortName(rider.delivery_district) || "Chưa xếp quận"} · {rider.delivery_ward ?? "Chưa xếp phường"}</p></td>{days.map((day) => { const date = format(day, "yyyy-MM-dd"); const key = `${rider.id}:${date}`; const log = logMap.get(key); return <td key={date} className={`border-b border-slate-100 px-2 py-3 text-center ${date === selectedDate ? "bg-blue-50/50" : ""}`}><button type="button" disabled={!canEdit || savingCells.has(key)} onClick={() => onEdit(rider, date)} title={statusTooltip(log)} className="rounded-lg p-1.5 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-default"><StatusBadge status={attendanceStatus(log)} saving={savingCells.has(key)} /></button></td>; })}</tr>)}</tbody></table></div>;
}

export function StatusBadge({ status, saving = false }: { status: WeeklyAttendanceStatus; saving?: boolean }) {
  const config: Record<WeeklyAttendanceStatus, { label: string; dot: string; text: string }> = { working: { label: "Đi làm", dot: "bg-blue-600", text: "text-slate-700" }, off: { label: "OFF", dot: "bg-slate-300", text: "text-slate-500" }, incident: { label: "Sự cố", dot: "bg-amber-500", text: "text-amber-800" } }; const item = config[status]; return <span className={`inline-flex min-w-16 items-center justify-center gap-1.5 text-xs font-semibold ${item.text}`}><span className={`size-2 rounded-full ${saving ? "animate-pulse bg-slate-300" : item.dot}`} />{saving ? "Đang lưu" : item.label}</span>;
}

function attendanceStatus(log: AttendanceLog | undefined): WeeklyAttendanceStatus {
  const raw = log?.status?.trim().toUpperCase() ?? "";
  if (raw.includes("NO_PICKUP") || raw.includes("NO_DELIVERY")) return "incident";
  if (raw.includes("OFF")) return "off";
  return "working";
}

function summarizeDay(date: string, riders: Rider[], logMap: Map<string, AttendanceLog>): WeeklyDaySummary {
  const result: WeeklyDaySummary = { date, working: 0, off: 0, incidents: 0 };
  for (const rider of riders) { const status = attendanceStatus(logMap.get(`${rider.id}:${date}`)); if (status === "incident") result.incidents += 1; else result[status] += 1; }
  return result;
}

function statusTooltip(log: AttendanceLog | undefined) {
  const status = attendanceStatus(log); const checkIn = log?.raw_data?.check_in ?? log?.raw_data?.check_in_time; const details = [status === "working" ? "Đi làm" : status === "off" ? "OFF" : "Sự cố"]; if (typeof checkIn === "string" && checkIn) details.push(`Giờ vào: ${checkIn}`); if (log?.note) details.push(log.note); return details.join(" · ");
}

function summarizeDistricts(date: string, riders: Rider[], logMap: Map<string, AttendanceLog>) {
  const rows = new Map<string, { district: string; total: number; working: number; off: number }>();
  for (const rider of riders) { const district = canonicalDistrictShortName(rider.delivery_district) || "Chưa xếp quận"; const row = rows.get(district) ?? { district, total: 0, working: 0, off: 0 }; const status = attendanceStatus(logMap.get(`${rider.id}:${date}`)); row.total += 1; if (status === "working") row.working += 1; else row.off += 1; rows.set(district, row); }
  return Array.from(rows.values()).sort((a, b) => districtOrder(a.district) - districtOrder(b.district) || a.district.localeCompare(b.district, "vi"));
}

function districtOrder(district: string) {
  const index = KV5_DISTRICT_ORDER.indexOf(district);
  return index === -1 ? KV5_DISTRICT_ORDER.length : index;
}

function compareRidersByOperationOrder(a: Rider, b: Rider) {
  const aDistrict = canonicalDistrictShortName(a.delivery_district);
  const bDistrict = canonicalDistrictShortName(b.delivery_district);
  return (a.cot ?? "").localeCompare(b.cot ?? "", "vi", { numeric: true }) || districtOrder(aDistrict) - districtOrder(bDistrict) || aDistrict.localeCompare(bDistrict, "vi") || (a.delivery_ward ?? "").localeCompare(b.delivery_ward ?? "", "vi", { numeric: true }) || (a.full_name ?? a.rider_code).localeCompare(b.full_name ?? b.rider_code, "vi");
}
