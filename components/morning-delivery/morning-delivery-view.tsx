"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { CalendarClock, CalendarDays, Check, ClipboardCheck, Copy, Download, MapPin, RefreshCcw, Save, ScanLine, Search, Settings2, Trash2, Truck, UserCheck, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { hcmDistricts, type DistrictDefinition, type WardDefinition } from "@/lib/locations/hcm";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import { cn } from "@/utils/cn";
import {createPortal} from "react-dom"

type MorningRider = {
  id: string;
  rider_code: string;
  full_name: string | null;
  kv: string | null;
  cot: string | null;
  pickup_district: string | null;
  pickup_ward: string | null;
  delivery_district: string | null;
  delivery_ward: string | null;
  status: string | null;
};

type RealtimeDeliveryRider = {
  driver_id: string;
  total_assigned: number;
  delivered: number;
  delivering: number;
  failed: number;
};

type AssignmentRow = {
  id: string;
  work_date: string;
  rider_id: string;
  rider_code: string;
  district: string;
  ward: string;
  assigned_at: string;
  checked_in_at: string | null;
  riders?: { full_name: string | null; cot: string | null } | null;
};

type AssignmentGroup = {
  key: string;
  rider_id: string;
  rider_code: string;
  full_name: string | null;
  district: string;
  wards: string[];
  assigned_at: string;
  checked_in_at: string | null;
};

type AttendanceRow = {
  id: string;
  rider_id: string | null;
  rider_code: string;
  work_date: string;
  status: string;
  note: string | null;
};

type AbsenceNoteRow = {
  id: string;
  work_date: string;
  rider_id: string;
  rider_code: string;
  reason: string;
  is_excused: boolean;
  updated_at: string;
};

type AbsenceNoteDraft = Pick<AbsenceNoteRow, "reason" | "is_excused">;

type ApiResponse = {
  success: boolean;
  error?: string;
  can_edit?: boolean;
  riders?: MorningRider[];
  assignments?: AssignmentRow[];
  attendance?: AttendanceRow[];
  absence_notes?: AbsenceNoteRow[];
  absence_note?: AbsenceNoteRow | null;
  active_delivery_rider_count?: number;
  realtime_delivery_riders?: RealtimeDeliveryRider[];
  realtime_delivery_riders_10am?: RealtimeDeliveryRider[];
  realtime_delivery_updated_at?: string | null;
};

export function MorningDeliveryView() {
  const [date, setDate] = useState(todayInVietnam());
  const [riders, setRiders] = useState<MorningRider[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [activeDeliveryRiderCount, setActiveDeliveryRiderCount] = useState(0);
  const [realtimeDeliveryRiders, setRealtimeDeliveryRiders] = useState<RealtimeDeliveryRider[]>([]);
  const [realtimeDeliveryRiders10am, setRealtimeDeliveryRiders10am] = useState<RealtimeDeliveryRider[]>([]);
  const [absenceNoteDrafts, setAbsenceNoteDrafts] = useState<Record<string, AbsenceNoteDraft>>({});
  const [selectedRider, setSelectedRider] = useState<MorningRider | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState(hcmDistricts[0]?.id ?? "");
  const [selectedWards, setSelectedWards] = useState<Set<string>>(new Set());
  const [assignmentQuery, setAssignmentQuery] = useState("");
  const [assignmentDistrict, setAssignmentDistrict] = useState("all");
  const [assignmentWard, setAssignmentWard] = useState("all");
  const [assignmentStatus, setAssignmentStatus] = useState("all");
  const [emptyWardQuery, setEmptyWardQuery] = useState("");
  const [onlyEmptyDistricts, setOnlyEmptyDistricts] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingNoteRiderId, setSavingNoteRiderId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [planningDefaults, setPlanningDefaults] = useState(false);
  const [savingDefaultRiderId, setSavingDefaultRiderId] = useState<string | null>(null);
  const [defaultRoutesOpen, setDefaultRoutesOpen] = useState(false);
  const [defaultRouteQuery, setDefaultRouteQuery] = useState("");
  const [defaultRouteDistrict, setDefaultRouteDistrict] = useState("all");
  const [defaultRouteWard, setDefaultRouteWard] = useState("all");
  const [defaultRouteSort, setDefaultRouteSort] = useState<"area" | "rider">("area");
  const [editingDefaultRiderId, setEditingDefaultRiderId] = useState<string | null>(null);
  const [cloneSourceRiderId, setCloneSourceRiderId] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [assignmentToast, setAssignmentToast] = useState<{ riderId: string; riderCode: string; district: string; message: string } | null>(null);
  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const emptyWardSearchRef = useRef<HTMLInputElement | null>(null);
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/morning-delivery?date=${date}`, { cache: "no-store" });
    const result = (await response.json().catch(() => null)) as ApiResponse | null;
    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể tải dữ liệu điểm danh sáng");
      setLoading(false);
      return;
    }
    setRiders(result.riders ?? []);
    setAssignments(result.assignments ?? []);
    setAttendance(result.attendance ?? []);
    setActiveDeliveryRiderCount(result.active_delivery_rider_count ?? 0);
    setRealtimeDeliveryRiders(result.realtime_delivery_riders ?? []);
    setRealtimeDeliveryRiders10am(result.realtime_delivery_riders_10am ?? []);
    setAbsenceNoteDrafts(
      Object.fromEntries(
        (result.absence_notes ?? []).map((note) => [
          note.rider_id,
          { reason: note.reason, is_excused: note.is_excused },
        ]),
      ),
    );
    setCanEdit(Boolean(result.can_edit));
    setLoading(false);
  }, [date]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const requestRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
    realtimeRefreshTimerRef.current = setTimeout(() => void load(), 700);
  }, [load]);

  useEffect(() => () => {
    if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
  }, []);

  useSupabaseRealtime({ table: "morning_delivery_assignments", onChange: requestRealtimeRefresh });
  useSupabaseRealtime({ table: "attendance_logs", onChange: requestRealtimeRefresh });
  useSupabaseRealtime({ table: "morning_delivery_absence_notes", onChange: requestRealtimeRefresh });
  useSupabaseRealtime({ table: "realtime_delivery_riders", onChange: requestRealtimeRefresh });

  const selectedDistrict = hcmDistricts.find((district) => district.id === selectedDistrictId) ?? hcmDistricts[0];
  const occupiedAreas = useMemo(
    () => new Set(assignments.map((assignment) => areaKey(assignment.district, assignment.ward))),
    [assignments],
  );
  const wardAssignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of assignments) {
      const key = areaKey(assignment.district, assignment.ward);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [assignments]);
  const availableWards = useMemo(
    () => selectedDistrict?.wards ?? [],
    [selectedDistrict],
  );
  const visibleAvailableWards = useMemo(() => {
    const query = normalize(emptyWardQuery);
    return query ? availableWards.filter((ward) => normalize(ward.name).includes(query)) : availableWards;
  }, [availableWards, emptyWardQuery]);
  const districtsWithAvailability = useMemo(() => hcmDistricts.map((district) => ({
    ...district,
    emptyCount: district.wards.filter((ward) => !occupiedAreas.has(areaKey(district.name, ward.name))).length,
  })).filter((district) => !onlyEmptyDistricts || district.emptyCount > 0), [occupiedAreas, onlyEmptyDistricts]);
  const groups = useMemo(() => groupAssignments(assignments), [assignments]);
  const attendanceByRider = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const log of attendance) {
      if (log.rider_id) map.set(log.rider_id, log);
      map.set(normalize(log.rider_code), log);
    }
    return map;
  }, [attendance]);
  const assignmentDistrictOptions = useMemo(() => Array.from(new Set(groups.map((group) => group.district))).sort((a, b) => a.localeCompare(b, "vi", { numeric: true })), [groups]);
  const assignmentWardOptions = useMemo(() => Array.from(new Set(groups.filter((group) => assignmentDistrict === "all" || group.district === assignmentDistrict).flatMap((group) => group.wards))).sort((a, b) => a.localeCompare(b, "vi", { numeric: true })), [assignmentDistrict, groups]);
  const filteredGroups = useMemo(() => {
    const query = normalize(assignmentQuery);
    return groups.filter((group) => {
      const log = attendanceByRider.get(group.rider_id) ?? attendanceByRider.get(normalize(group.rider_code));
      const off = isOffStatus(log?.status);
      const matchesStatus = assignmentStatus === "all"
        || (assignmentStatus === "off" ? off : assignmentStatus === "present" ? Boolean(group.checked_in_at) && !off : !group.checked_in_at && !off);
      return (!query || normalize([group.rider_code, group.full_name, group.district, ...group.wards].filter(Boolean).join(" ")).includes(query))
        && (assignmentDistrict === "all" || group.district === assignmentDistrict)
        && (assignmentWard === "all" || group.wards.includes(assignmentWard))
        && matchesStatus;
    });
  }, [assignmentDistrict, assignmentQuery, assignmentStatus, assignmentWard, attendanceByRider, groups]);
  const requiredRiders = useMemo(
    () => riders.filter((rider) => !rider.pickup_district?.trim() && !rider.pickup_ward?.trim()),
    [riders],
  );
  const assignedRiderIds = useMemo(
    () => new Set(assignments.filter((assignment) => assignment.checked_in_at).map((assignment) => assignment.rider_id)),
    [assignments],
  );
  const realtime10amByRider = useMemo(
    () => new Map(realtimeDeliveryRiders10am.map((row) => [normalize(row.driver_id), row])),
    [realtimeDeliveryRiders10am],
  );
  const requiredAbsentRiders = useMemo(
    () =>
      requiredRiders
        .filter((rider) => !assignedRiderIds.has(rider.id))
        .map((rider) => ({
          rider,
          attendance: attendanceByRider.get(rider.id) ?? attendanceByRider.get(normalize(rider.rider_code)) ?? null,
          realtime10am: realtime10amByRider.get(normalize(rider.rider_code)) ?? null,
        }))
        .sort((a, b) =>
          kvSortRank(a.rider.kv) - kvSortRank(b.rider.kv)
          || absentStatusSortRank(a.attendance?.status) - absentStatusSortRank(b.attendance?.status)
          || a.rider.rider_code.localeCompare(b.rider.rider_code, "vi", { numeric: true }),
        ),
    [assignedRiderIds, attendanceByRider, realtime10amByRider, requiredRiders],
  );
  const assignedRiderCount = new Set(
    assignments.filter((assignment) => assignment.checked_in_at).map((assignment) => assignment.rider_id),
  ).size;
  const totalAreaCount = hcmDistricts.reduce((total, district) => total + district.wards.length, 0);
  const assignedAreaCount = occupiedAreas.size;
  const realtimeByRider = useMemo(
    () => new Map(realtimeDeliveryRiders.map((row) => [normalize(row.driver_id), row])),
    [realtimeDeliveryRiders],
  );
  const defaultDistrictOptions = useMemo(
    () => defaultRoutesOpen ? Array.from(new Set(requiredRiders.map((rider) => rider.delivery_district?.trim()).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "vi", { numeric: true })) : [],
    [defaultRoutesOpen, requiredRiders],
  );
  const defaultWardOptions = useMemo(() => {
    if (!defaultRoutesOpen) return [];
    const values = requiredRiders
      .filter((rider) => defaultRouteDistrict === "all" || rider.delivery_district === defaultRouteDistrict)
      .flatMap((rider) => (rider.delivery_ward ?? "").split(/[,;|]+/).map((ward) => ward.trim()).filter(Boolean));
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, "vi", { numeric: true }));
  }, [defaultRouteDistrict, defaultRoutesOpen, requiredRiders]);
  const filteredDefaultRiders = useMemo(() => {
    if (!defaultRoutesOpen) return [];
    const query = normalize(defaultRouteQuery);
    return requiredRiders.filter((rider) => {
      const matchesQuery = !query || normalize(`${rider.rider_code} ${rider.full_name ?? ""} ${rider.delivery_district ?? ""} ${rider.delivery_ward ?? ""}`).includes(query);
      const matchesDistrict = defaultRouteDistrict === "all" || rider.delivery_district === defaultRouteDistrict;
      const matchesWard = defaultRouteWard === "all" || (rider.delivery_ward ?? "").split(/[,;|]+/).some((ward) => ward.trim() === defaultRouteWard);
      return matchesQuery && matchesDistrict && matchesWard;
    }).sort((a, b) => defaultRouteSort === "rider"
      ? a.rider_code.localeCompare(b.rider_code, "vi", { numeric: true })
      : (a.delivery_district ?? "~").localeCompare(b.delivery_district ?? "~", "vi", { numeric: true })
        || (a.delivery_ward ?? "~").localeCompare(b.delivery_ward ?? "~", "vi", { numeric: true })
        || a.rider_code.localeCompare(b.rider_code, "vi", { numeric: true }));
  }, [defaultRouteDistrict, defaultRouteQuery, defaultRouteSort, defaultRouteWard, defaultRoutesOpen, requiredRiders]);

  async function scanRider(rawCode: string) {
    setError(null);
    setSuccess(null);
    const code = normalize(rawCode);
    if (!code) return;
    const rider = riders.find((item) => normalize(item.rider_code) === code) ?? null;
    if (!rider) {
      setSelectedRider(null);
      setError("Không tìm thấy Rider ID thuộc COT 1.");
      return;
    }
    const existingGroups = groups.filter((group) => group.rider_id === rider.id);
    if (existingGroups.length > 0) {
      const assignedRoutes = existingGroups
        .map((group) => routeLabel(group.district.replace(/^(Quận|Huyện)\s+/i, ""), group.wards))
        .join(" · ");
      if (existingGroups.some((group) => !group.checked_in_at)) {
        const response = await fetch("/api/morning-delivery", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ work_date: date, rider_id: rider.id }),
        });
        const result = (await response.json().catch(() => null)) as ApiResponse | null;
        if (!response.ok || !result?.success) {
          setError(result?.error ?? "Không thể xác nhận rider có mặt");
          return;
        }
        await load();
        setSuccess(`${rider.full_name?.trim() || rider.rider_code} đã có mặt: ${assignedRoutes}.`);
      } else {
        setSuccess(`${rider.full_name?.trim() || rider.rider_code} đã có mặt trước đó: ${assignedRoutes}.`);
      }
      setSelectedRider(null);
      return;
    }
    setSelectedRider(rider);
    const defaultDistrict = findDefaultDistrict(rider.delivery_district);
    if (defaultDistrict) {
      setSelectedDistrictId(defaultDistrict.id);
      const defaultWards = findDefaultWards(defaultDistrict, rider.delivery_ward);
      setSelectedWards(new Set(defaultWards.map((ward) => ward.name)));
    } else {
      setSelectedWards(new Set());
    }
  }

  function toggleWard(ward: string) {
    setSelectedWards((current) => {
      const next = new Set(current);
      if (next.has(ward)) next.delete(ward);
      else next.add(ward);
      return next;
    });
  }

  async function assignAreas() {
    if (!selectedRider || !selectedDistrict || selectedWards.size === 0) return;
    const assignedRider = selectedRider;
    const assignedDistrict = selectedDistrict;
    const assignedWards = Array.from(selectedWards);
    setSaving(true);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/morning-delivery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        work_date: date,
        rider_id: selectedRider.id,
        district: selectedDistrict.name,
        wards: Array.from(selectedWards),
      }),
    });
    const result = (await response.json().catch(() => null)) as ApiResponse | null;
    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể chia khu vực");
      setSaving(false);
      await load();
      return;
    }
    const message = `Đã gán ${routeLabel(assignedDistrict.shortName, assignedWards)} cho Rider ${assignedRider.rider_code}`;
    setSuccess(message);
    setAssignmentToast({ riderId: assignedRider.id, riderCode: assignedRider.rider_code, district: assignedDistrict.name, message });
    setSaving(false);
    await load();
    window.setTimeout(() => {
      setSelectedRider(null);
      setSelectedWards(new Set());
      scanInputRef.current?.focus();
    }, 900);
  }

  async function undoLastAssignment() {
    if (!assignmentToast) return;
    const response = await fetch("/api/morning-delivery", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ work_date: date, rider_id: assignmentToast.riderId, district: assignmentToast.district }) });
    if (!response.ok) { setError("Không thể hoàn tác phân tuyến vừa rồi"); return; }
    setAssignmentToast(null);
    setSuccess(`Đã hoàn tác phân tuyến của ${assignmentToast.riderCode}.`);
    await load();
    scanInputRef.current?.focus();
  }

  async function removeGroup(group: AssignmentGroup) {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/morning-delivery", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ work_date: date, rider_id: group.rider_id, district: group.district }),
    });
    const result = (await response.json().catch(() => null)) as ApiResponse | null;
    if (!response.ok || !result?.success) setError(result?.error ?? "Không thể huỷ chia khu vực");
    setSaving(false);
    await load();
  }

  function updateAbsenceNoteDraft(riderId: string, patch: Partial<AbsenceNoteDraft>) {
    setAbsenceNoteDrafts((current) => {
      const existing = current[riderId] ?? { reason: "", is_excused: false };
      return { ...current, [riderId]: { ...existing, ...patch } };
    });
  }

  async function saveAbsenceNote(rider: MorningRider) {
    const draft = absenceNoteDrafts[rider.id] ?? { reason: "", is_excused: false };
    setSavingNoteRiderId(rider.id);
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/morning-delivery", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        work_date: date,
        rider_id: rider.id,
        reason: draft.reason,
        is_excused: draft.is_excused,
      }),
    });
    const result = (await response.json().catch(() => null)) as ApiResponse | null;
    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể lưu lý do vắng");
      setSavingNoteRiderId(null);
      return;
    }

    setSuccess(`Đã lưu lý do vắng của ${rider.rider_code}.`);
    setSavingNoteRiderId(null);
  }

  async function exportAbsentRiders() {
    setExporting(true);
    setError(null);
    try {
      const response = await fetch(`/api/morning-delivery/export?date=${date}`);
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(result?.error ?? "Không thể xuất danh sách");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `rider-chua-diem-danh-${date}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể xuất danh sách");
    } finally {
      setExporting(false);
    }
  }

  async function assignDefaultAreas() {
    if (!canEdit || planningDefaults) return;
    const alreadyAssigned = new Set(assignments.map((assignment) => assignment.rider_id));
    const candidates = riders.filter((rider) => {
      const hasPickupRoute = Boolean(rider.pickup_district?.trim() || rider.pickup_ward?.trim());
      return !hasPickupRoute && !alreadyAssigned.has(rider.id);
    });
    const plans: Array<{ rider: MorningRider; district: DistrictDefinition; wards: WardDefinition[] }> = [];
    let missingDefault = 0;

    for (const rider of candidates) {
      const district = findDefaultDistrict(rider.delivery_district);
      const defaultWards = district ? findDefaultWards(district, rider.delivery_ward) : [];
      if (!district || defaultWards.length === 0) {
        missingDefault += 1;
        continue;
      }
      plans.push({ rider, district, wards: defaultWards });
    }

    if (plans.length === 0) {
      setError(`Không có tuyến mặc định mới để xếp. Còn ${missingDefault} rider thiếu tuyến cố định.`);
      return;
    }
    const offPlanCount = plans.filter(({ rider }) => {
      const log = attendanceByRider.get(rider.id) ?? attendanceByRider.get(normalize(rider.rider_code));
      return isOffStatus(log?.status);
    }).length;
    if (!window.confirm(`Đồng bộ tuyến cố định ngày ${formatDate(date)}: xếp ${plans.length} rider${offPlanCount ? `, trong đó ${offPlanCount} rider OFF sẽ được giữ để cảnh báo cần người thay` : ""}?`)) return;

    setPlanningDefaults(true);
    setError(null);
    setSuccess(null);
    let assigned = 0;
    const failures: string[] = [];
    for (const plan of plans) {
      const response = await fetch("/api/morning-delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          work_date: date,
          rider_id: plan.rider.id,
          district: plan.district.name,
          wards: plan.wards.map((ward) => ward.name),
          preassigned: true,
        }),
      });
      if (response.ok) assigned += 1;
      else failures.push(plan.rider.rider_code);
    }
    await load();
    setPlanningDefaults(false);
    if (failures.length > 0) setError(`Không xếp được ${failures.length} rider: ${failures.join(", ")}.`);
    setSuccess(`Đã đồng bộ: xếp ${assigned} rider; giữ rider OFF trên tuyến để điều phối thấy và gán người thay; còn ${missingDefault} rider thiếu tuyến cố định.`);
  }

  function updateDefaultRoute(riderId: string, district: string, ward = "") {
    setRiders((current) => current.map((rider) =>
      rider.id === riderId ? { ...rider, delivery_district: district || null, delivery_ward: ward || null } : rider,
    ));
  }

  function toggleDefaultWard(rider: MorningRider, wardName: string) {
    const district = findDefaultDistrict(rider.delivery_district);
    if (!district) return;
    const selected = new Set(findDefaultWards(district, rider.delivery_ward).map((ward) => ward.name));
    if (selected.has(wardName)) selected.delete(wardName);
    else selected.add(wardName);
    updateDefaultRoute(rider.id, district.name, Array.from(selected).join(", "));
  }

  function cloneDefaultWards(target: MorningRider, sourceId: string) {
    const source = riders.find((rider) => rider.id === sourceId);
    if (!source || source.delivery_district !== target.delivery_district) return;
    updateDefaultRoute(target.id, target.delivery_district ?? "", source.delivery_ward ?? "");
    setCloneSourceRiderId(sourceId);
  }

  async function saveDefaultRoute(rider: MorningRider) {
    setSavingDefaultRiderId(rider.id);
    setError(null);
    const response = await fetch("/api/morning-delivery/default-routes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rider_id: rider.id,
        delivery_district: rider.delivery_district,
        delivery_ward: rider.delivery_ward,
      }),
    });
    const result = (await response.json().catch(() => null)) as ApiResponse | null;
    if (!response.ok || !result?.success) setError(result?.error ?? "Không thể lưu tuyến cố định");
    else setSuccess(`Đã lưu tuyến cố định cho ${rider.rider_code}.`);
    setSavingDefaultRiderId(null);
  }

  async function copyPlanForGroup() {
    const offRiders = riders.filter((rider) => {
      const log = attendanceByRider.get(rider.id) ?? attendanceByRider.get(normalize(rider.rider_code));
      return isOffStatus(log?.status);
    });
    const lines = [
      `PHÂN TUYẾN GIAO SÁNG ${formatDate(date)}`,
      "",
      ...groups.map((group, index) => {
        const log = attendanceByRider.get(group.rider_id) ?? attendanceByRider.get(normalize(group.rider_code));
        const status = isOffStatus(log?.status)
          ? `${attendanceStatusLabel(log?.status).toUpperCase()} - CẦN RIDER THAY`
          : group.checked_in_at ? "ĐÃ CÓ MẶT" : "ĐÃ ĐƯỢC CHIA - CHƯA LÊN";
        return `${index + 1}. ${group.rider_code} - ${group.full_name?.trim() || "Chưa có tên"}: ${routeLabel(group.district, group.wards)} [${status}]`;
      }),
      "",
      `RIDER OFF (${offRiders.length}): ${offRiders.map((rider) => rider.rider_code).join(", ") || "Không có"}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setSuccess("Đã sao chép danh sách phân tuyến để gửi lên nhóm.");
      setError(null);
    } catch {
      setError("Trình duyệt không cho phép sao chép. Hãy cấp quyền clipboard rồi thử lại.");
    }
  }

  useEffect(() => {
    function handleDispatchShortcut(event: KeyboardEvent) {
      if (!selectedRider || defaultRoutesOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        setSelectedRider(null);
        setSelectedWards(new Set());
        window.requestAnimationFrame(() => scanInputRef.current?.focus());
      }
      if (event.key === "Enter" && selectedWards.size > 0 && !saving) {
        event.preventDefault();
        void assignAreas();
      }
    }
    window.addEventListener("keydown", handleDispatchShortcut);
    return () => window.removeEventListener("keydown", handleDispatchShortcut);
    // assignAreas intentionally uses the latest render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultRoutesOpen, saving, selectedRider, selectedWards]);

  const riderHasPickupRoute = Boolean(selectedRider?.pickup_district?.trim() || selectedRider?.pickup_ward?.trim());
  const selectedRiderAttendance = selectedRider
    ? attendanceByRider.get(selectedRider.id) ?? attendanceByRider.get(normalize(selectedRider.rider_code))
    : null;
  const selectedRiderIsOff = isOffStatus(selectedRiderAttendance?.status);
  const editingDefaultRider = riders.find((rider) => rider.id === editingDefaultRiderId) ?? null;
  const editingDefaultDistrict = editingDefaultRider ? findDefaultDistrict(editingDefaultRider.delivery_district) : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">Morning dispatch</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Điểm danh sáng & chia khu vực giao</h1>
          <p className="mt-1 text-sm text-slate-500">Rider COT 1 đều có thể lên lấy hàng; nhóm chưa có tuyến pickup là nhóm bắt buộc.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative block min-w-[200px]">
            <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="pl-9" />
          </label>
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} />
            Làm mới
          </Button>
          <Button type="button" onClick={() => void assignDefaultAreas()} disabled={!canEdit || loading || planningDefaults}>
            <CalendarClock size={16} />
            {planningDefaults ? "Đang đồng bộ..." : "Đồng bộ tuyến cố định"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setDefaultRoutesOpen(true)} disabled={loading}>
            <Settings2 size={16} />
            Sửa tuyến mặc định
          </Button>
          <Button type="button" variant="secondary" onClick={() => void copyPlanForGroup()} disabled={loading || groups.length === 0}>
            <Copy size={16} />
            Sao chép gửi nhóm
          </Button>
        </div>
      </header>

      {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {success ? <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{success}</p> : null}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Tổng quan điểm danh sáng">
        <Metric icon={Users} label="Bắt buộc chưa tuyến pick" value={requiredRiders.length} />
        <Metric icon={UserCheck} label="Rider đã có mặt" value={assignedRiderCount} />
        <Metric icon={Truck} label="Rider có đơn realtime" value={activeDeliveryRiderCount} />
        <Metric icon={MapPin} label="Phường đã nhận" value={assignedAreaCount} />
        <Metric icon={ClipboardCheck} label="Phường còn trống" value={Math.max(0, totalAreaCount - assignedAreaCount)} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)_390px]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
            <h2 className="font-bold text-slate-950">1. Quét Rider ID</h2>
            <p className="mt-0.5 text-xs text-slate-500">Nhấn Enter sau khi máy quét nhập mã.</p>
          </div>
          <div className="space-y-4 p-4">
            <RiderScanInput inputRef={scanInputRef} onScan={scanRider} />

            {selectedRider ? (
              <div className={cn("rounded-lg border p-4", riderHasPickupRoute ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-slate-500">Rider đã quét</p>
                    <h3 className="mt-1 truncate font-black text-slate-950">{selectedRider.full_name?.trim() || "Chưa có tên"}</h3>
                    <p className="mt-0.5 text-sm font-bold text-slate-600">{selectedRider.rider_code}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="rounded-md bg-white px-2 py-1 text-xs font-black text-emerald-700">{selectedRider.cot}</span>
                    <span className={cn("rounded-md px-2 py-1 text-[10px] font-bold uppercase", riderHasPickupRoute ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800")}>
                      {riderHasPickupRoute ? "Có tuyến pickup" : "Bắt buộc lên lấy"}
                    </span>
                  </div>
                </div>
                <div className="mt-3 border-t border-black/5 pt-3 text-xs text-slate-600">
                  {selectedRiderIsOff ? (
                    <p className="mb-3 rounded-lg border border-red-200 bg-red-100 px-3 py-2 text-xs font-black uppercase text-red-800">
                      {attendanceStatusLabel(selectedRiderAttendance?.status)} — rider này đang OFF, chỉ gán khi đã xác nhận đi thay
                    </p>
                  ) : null}
                  <p className="font-bold text-slate-800">
                    Mặc định giao: {[selectedRider.delivery_district, selectedRider.delivery_ward].filter(Boolean).join(" · ") || "Chưa có"}
                  </p>
                  <p className="mt-1">
                    Số đơn Supabase: <strong>{realtimeByRider.get(normalize(selectedRider.rider_code))?.total_assigned ?? "Chưa có dữ liệu"}</strong>
                  </p>
                  {(realtimeByRider.get(normalize(selectedRider.rider_code))?.total_assigned ?? 0) > 0 ? (
                    <p className="mt-2 rounded-lg bg-red-100 px-2.5 py-2 text-[11px] font-black uppercase text-red-700">Rider có đơn realtime — hạn chế đổi tuyến</p>
                  ) : null}
                  <p>Tuyến pickup: {[selectedRider.pickup_district, selectedRider.pickup_ward].filter(Boolean).join(" · ") || "Chưa có"}</p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Chưa quét rider.</div>
            )}

            {selectedRider && selectedDistrict && selectedWards.size > 0 ? (
              <div className="rounded-md bg-slate-950 p-3 text-white">
                <p className="text-[10px] font-bold uppercase text-slate-400">Tuyến giao dự kiến</p>
                <p className="mt-1 text-sm font-bold">{routeLabel(selectedDistrict.shortName, Array.from(selectedWards))}</p>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Button type="button" className="w-full" onClick={() => void assignAreas()} disabled={!canEdit || saving || !selectedRider || selectedWards.size === 0}>
                <Check size={17} /> Gán phường gợi ý <span className="ml-auto text-[10px] opacity-70">Enter</span>
              </Button>
              <Button type="button" variant="outline" className="w-full" disabled={!selectedRider} onClick={() => emptyWardSearchRef.current?.focus()}>
                <MapPin size={17} /> Chọn phường thủ công <span className="ml-auto text-[10px] opacity-70">Esc để hủy</span>
              </Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
            <h2 className="font-bold text-slate-950">2. Chọn khu vực giao</h2>
            <p className="mt-0.5 text-xs text-slate-500">Một phường có thể gán nhiều rider để bổ sung hoặc thay rider OFF.</p>
          </div>
          <div className="border-b border-slate-100 p-3">
            <label className="relative mb-3 block">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input ref={emptyWardSearchRef} value={emptyWardQuery} onChange={(event) => setEmptyWardQuery(event.target.value)} placeholder="Tìm phường" className="pl-9" />
            </label>
            <label className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={onlyEmptyDistricts} onChange={(event) => setOnlyEmptyDistricts(event.target.checked)} className="size-4 accent-blue-600" /> Chỉ hiện quận còn phường chưa có rider</label>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {districtsWithAvailability.map((district) => (
                <button
                  key={district.id}
                  type="button"
                  onClick={() => {
                    setSelectedDistrictId(district.id);
                    setSelectedWards(new Set());
                  }}
                  className={cn(
                    "shrink-0 rounded-md border px-3 py-2 text-xs font-bold transition",
                    selectedDistrictId === district.id
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {district.shortName} · {district.emptyCount}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black text-slate-950">{selectedDistrict?.name}</h3>
                <p className="text-xs text-slate-500">{availableWards.length} phường/xã · có thể gán trùng người</p>
              </div>
              {selectedWards.size > 0 ? (
                <button type="button" onClick={() => setSelectedWards(new Set())} className="text-xs font-bold text-red-600">Bỏ chọn</button>
              ) : null}
            </div>
            <div className="grid max-h-[520px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {visibleAvailableWards.map((ward) => {
                const selected = selectedWards.has(ward.name);
                const assignedCount = wardAssignmentCounts.get(areaKey(selectedDistrict.name, ward.name)) ?? 0;
                return (
                  <button
                    key={ward.name}
                    type="button"
                    onClick={() => toggleWard(ward.name)}
                    className={cn(
                      "min-h-16 rounded-md border px-3 py-2 text-left text-sm font-semibold transition",
                      selected
                        ? "border-emerald-500 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    <span className="block truncate">{ward.name}</span>
                    <span className={cn("mt-1 block text-[10px] font-bold uppercase", assignedCount > 0 ? "text-blue-600" : "text-slate-400")}>{selected ? "Đã chọn" : assignedCount > 0 ? `${assignedCount} rider đang nhận` : "Chưa có rider"}</span>
                  </button>
                );
              })}
            </div>
            {visibleAvailableWards.length === 0 ? (
              <p className="rounded-md border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">Không tìm thấy phường phù hợp.</p>
            ) : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur">
            <h2 className="font-bold text-slate-950">3. Đã điểm danh & chia tuyến</h2>
            <p className="mt-0.5 text-xs text-slate-500">{groups.length} rider trong ngày {formatDate(date)}.</p>
          </div>
          <div className="grid gap-2 border-b border-slate-100 p-3">
            <label className="relative block">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={assignmentQuery} onChange={(event) => setAssignmentQuery(event.target.value)} placeholder="Tìm rider hoặc khu vực" className="pl-9" />
            </label>
            <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
              <Select value={assignmentDistrict} onChange={(event) => { setAssignmentDistrict(event.target.value); setAssignmentWard("all"); }}><option value="all">Tất cả quận</option>{assignmentDistrictOptions.map((district) => <option key={district} value={district}>{district}</option>)}</Select>
              <Select value={assignmentWard} onChange={(event) => setAssignmentWard(event.target.value)}><option value="all">Tất cả phường</option>{assignmentWardOptions.map((ward) => <option key={ward} value={ward}>{ward}</option>)}</Select>
              <Select value={assignmentStatus} onChange={(event) => setAssignmentStatus(event.target.value)}><option value="all">Tất cả trạng thái</option><option value="off">Rider OFF</option><option value="present">Đã có mặt</option><option value="assigned">Đã được chia</option></Select>
            </div>
          </div>
          <div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto">
            {filteredGroups.map((group) => {
              const log = attendanceByRider.get(group.rider_id) ?? attendanceByRider.get(normalize(group.rider_code));
              const off = isOffStatus(log?.status);
              return (
                <article key={group.key} className={cn("px-4 py-3 transition-colors hover:bg-blue-50/60", off && "bg-red-50/70 hover:bg-red-50")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-black text-slate-950">{group.full_name?.trim() || "Chưa có tên"}</h3>
                      <p className="text-xs font-bold text-slate-500">{group.rider_code}</p>
                      {off ? <p className="mt-1 text-xs font-black uppercase text-red-700">{attendanceStatusLabel(log?.status)} — cần gán rider thay</p> : null}
                    </div>
                    {canEdit ? (
                      <button type="button" onClick={() => void removeGroup(group)} disabled={saving} className="grid size-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Huỷ chia tuyến ${group.rider_code}`}>
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 rounded-md bg-slate-50 p-2.5">
                    <p className="text-xs font-bold text-slate-800">{routeLabel(group.district.replace(/^(Quận|Huyện)\s+/i, ""), group.wards)}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className="text-[10px] text-slate-400">Chia lúc {formatTime(group.assigned_at)}</p>
                      <span className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-black uppercase",
                        off ? "bg-red-100 text-red-700" : group.checked_in_at ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700",
                      )}>
                        {off ? "OFF" : group.checked_in_at ? "Đã có mặt" : "Đã được chia"}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
            {!loading && filteredGroups.length === 0 ? (
              <p className="p-8 text-center text-sm text-slate-500">Chưa có rider được chia khu vực.</p>
            ) : null}
          </div>
        </section>
      </div>

      {defaultRoutesOpen && typeof document !== "undefined" ? createPortal(
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[9999] flex items-end justify-center overflow-y-auto bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <button type="button" aria-label="Đóng sửa tuyến mặc định" className="absolute inset-0" onClick={() => setDefaultRoutesOpen(false)} />
          <section className="app-modal-panel relative z-10 flex w-full max-w-6xl flex-col overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white shadow-2xl sm:rounded-3xl">
            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold leading-6 text-slate-950">Sửa tuyến giao mặc định</h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">Rider COT 1 không có tuyến pickup; có thể chọn nhiều phường trong một quận.</p>
              </div>
              <div className="flex items-center gap-2">
                <label className="relative min-w-0 flex-1 sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={16} />
                  <Input value={defaultRouteQuery} onChange={(event) => setDefaultRouteQuery(event.target.value)} placeholder="Tìm rider hoặc tuyến" className="pl-9" />
                </label>
                <Button type="button" variant="ghost" className="size-10 p-0" onClick={() => setDefaultRoutesOpen(false)}><X size={18} /></Button>
              </div>
            </div>
            <div className="grid gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:grid-cols-3">
              <Select value={defaultRouteDistrict} onChange={(event) => { setDefaultRouteDistrict(event.target.value); setDefaultRouteWard("all"); }}>
                <option value="all">Tất cả quận</option>
                {defaultDistrictOptions.map((district) => <option key={district} value={district}>{district}</option>)}
              </Select>
              <Select value={defaultRouteWard} onChange={(event) => setDefaultRouteWard(event.target.value)}>
                <option value="all">Tất cả phường</option>
                {defaultWardOptions.map((ward) => <option key={ward} value={ward}>{ward}</option>)}
              </Select>
              <Select value={defaultRouteSort} onChange={(event) => setDefaultRouteSort(event.target.value as "area" | "rider")}>
                <option value="area">Sắp xếp quận → phường</option>
                <option value="rider">Sắp xếp Rider ID</option>
              </Select>
            </div>
            <div className="overflow-auto min-h-0 flex-1">
          <table className="w-full min-w-[920px] text-left text-sm leading-5">
            <thead className="sticky top-0 z-10 bg-slate-100/95 text-[11px] font-bold uppercase tracking-wide text-slate-500 backdrop-blur">
              <tr>
                <th className="px-4 py-3">Rider</th>
                <th className="px-4 py-3">Lịch {formatDate(date)}</th>
                <th className="px-4 py-3">Quận cố định</th>
                <th className="px-4 py-3">Phường cố định</th>
                <th className="px-4 py-3">Trạng thái chia</th>
                <th className="px-4 py-3 text-right">Lưu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDefaultRiders.map((rider) => {
                const log = attendanceByRider.get(rider.id) ?? attendanceByRider.get(normalize(rider.rider_code));
                const off = isOffStatus(log?.status);
                const district = findDefaultDistrict(rider.delivery_district);
                const riderAssignments = groups.filter((group) => group.rider_id === rider.id);
                const assignmentState = riderAssignments.some((group) => group.checked_in_at)
                  ? "Đã có mặt"
                  : riderAssignments.length > 0 ? "Đã được chia" : "Chưa chia";
                return (
                  <tr key={rider.id} className={cn("transition-colors hover:bg-blue-50/60", off && "bg-amber-50/50 hover:bg-amber-50")}>
                    <td className="px-4 py-3">
                      <p className="font-black text-slate-950">{rider.rider_code}</p>
                      <p className="text-xs text-slate-500">{rider.full_name?.trim() || "Chưa có tên"}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-md px-2 py-1 text-xs font-bold", off ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700")}>
                        {off ? attendanceStatusLabel(log?.status) : "Đi làm"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={district?.id ?? ""}
                        disabled={!canEdit || savingDefaultRiderId === rider.id}
                        onChange={(event) => {
                          const next = hcmDistricts.find((item) => item.id === event.target.value);
                          updateDefaultRoute(rider.id, next?.name ?? "");
                        }}
                        className="h-10 min-w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                      >
                        <option value="">Chọn quận</option>
                        {hcmDistricts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-sm flex-wrap gap-1.5">
                        {district ? findDefaultWards(district, rider.delivery_ward).map((ward) => <span key={ward.name} className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-100">{ward.name}</span>) : null}
                        {!rider.delivery_ward?.trim() ? <span className="text-xs text-slate-400">Chưa chọn phường</span> : null}
                      </div>
                      <Button type="button" variant="outline" className="mt-2" disabled={!canEdit || !district} onClick={() => { setEditingDefaultRiderId(rider.id); setCloneSourceRiderId(""); }}>
                        Chọn phường
                      </Button>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-600">{assignmentState}</td>
                    <td className="px-4 py-3 text-right">
                      <Button type="button" variant="secondary" className="size-10 p-0" disabled={!canEdit || savingDefaultRiderId === rider.id} onClick={() => void saveDefaultRoute(rider)}>
                        <Save size={16} />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
            </div>
          </section>
        </div>,document.body,
      ) : null}

      {editingDefaultRider && editingDefaultDistrict ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] grid place-items-end bg-slate-950/45 backdrop-blur-sm sm:place-items-center sm:p-4">
          <button type="button" aria-label="Đóng chọn phường" className="absolute inset-0" onClick={() => setEditingDefaultRiderId(null)} />
          <section className="app-modal-panel relative z-10 w-full max-w-2xl rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-wide text-blue-600">Chọn phường cố định</p><h3 className="mt-1 text-lg font-bold text-slate-950">{editingDefaultRider.full_name || editingDefaultRider.rider_code}</h3><p className="text-sm text-slate-500">{editingDefaultDistrict.name}</p></div>
              <Button type="button" variant="ghost" className="size-10 p-0" onClick={() => setEditingDefaultRiderId(null)}><X size={18} /></Button>
            </div>
            <label className="mt-5 block"><span className="mb-1.5 block text-xs font-bold uppercase text-slate-500">Sao chép từ rider cùng quận</span><Select value={cloneSourceRiderId} onChange={(event) => cloneDefaultWards(editingDefaultRider, event.target.value)}><option value="">Chọn rider để sao chép…</option>{requiredRiders.filter((rider) => rider.id !== editingDefaultRider.id && rider.delivery_district === editingDefaultRider.delivery_district && rider.delivery_ward?.trim()).map((rider) => <option key={rider.id} value={rider.id}>{rider.rider_code} — {rider.full_name}</option>)}</Select></label>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {editingDefaultDistrict.wards.map((ward) => {
                const checked = findDefaultWards(editingDefaultDistrict, editingDefaultRider.delivery_ward).some((item) => item.name === ward.name);
                return <button key={ward.name} type="button" onClick={() => toggleDefaultWard(editingDefaultRider, ward.name)} className={cn("flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition", checked ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-100" : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50/60")}><span className={cn("grid size-5 shrink-0 place-items-center rounded border", checked ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white")}>{checked ? <Check size={13} /> : null}</span>{ward.name}</button>;
              })}
            </div>
            <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditingDefaultRiderId(null)}>Hủy</Button><Button type="button" disabled={savingDefaultRiderId === editingDefaultRider.id} onClick={async () => { await saveDefaultRoute(editingDefaultRider); setEditingDefaultRiderId(null); }}><Save size={16} /> Lưu phường</Button></div>
          </section>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-slate-950">Rider bắt buộc chưa điểm danh</h2>
            <p className="mt-0.5 text-xs text-slate-500">Rider COT 1 chưa có tuyến pickup và chưa được chia khu vực ngày {formatDate(date)}.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-fit rounded-md bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700">
              {requiredAbsentRiders.length} rider
            </span>
            <Button type="button" variant="secondary" disabled={exporting} onClick={() => void exportAbsentRiders()}>
              <Download size={16} />
              {exporting ? "Đang xuất..." : "Xuất Excel"}
            </Button>
          </div>
        </div>

        {requiredAbsentRiders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Rider ID</th>
                  <th className="px-4 py-3">Tên rider</th>
                  <th className="px-4 py-3">KV</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Ghi chú lịch OFF</th>
                  <th className="px-4 py-3">Lý do không lên lấy hàng</th>
                  <th className="px-4 py-3 text-center">Có phép</th>
                  <th className="px-4 py-3 text-right">Lưu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requiredAbsentRiders.map(({ rider, attendance: log, realtime10am }) => {
                  const off = isOffStatus(log?.status);
                  const deliveredWithoutCheckIn = (realtime10am?.total_assigned ?? 0) > 0;
                  const draft = absenceNoteDrafts[rider.id] ?? { reason: "", is_excused: false };
                  return (
                    <tr key={rider.id} className="transition hover:bg-slate-50">
                      <td className="px-4 py-3 font-black text-slate-950">{rider.rider_code}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{rider.full_name?.trim() || "Chưa có tên"}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                          {rider.kv?.trim() || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex rounded-md px-2 py-1 text-[11px] font-bold",
                          off ? offStatusClass(log?.status) : "bg-red-50 text-red-700",
                        )}>
                          {off ? attendanceStatusLabel(log?.status) : "Chưa điểm danh"}
                        </span>
                      </td>
                      <td className="max-w-[440px] px-4 py-3 text-slate-600">
                        {deliveredWithoutCheckIn ? (
                          <p className="font-bold text-red-700">
                            Có đi giao nhưng không điểm danh ({realtime10am?.total_assigned} đơn tính đến 10:00)
                          </p>
                        ) : null}
                        {off ? <p className={deliveredWithoutCheckIn ? "mt-1" : undefined}>{log?.note?.trim() || "Có lịch OFF, chưa có ghi chú."}</p> : !deliveredWithoutCheckIn ? "-" : null}
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          value={draft.reason}
                          disabled={!canEdit || savingNoteRiderId === rider.id}
                          onChange={(event) => updateAbsenceNoteDraft(rider.id, { reason: event.target.value })}
                          placeholder="Nhập lý do vắng"
                          maxLength={500}
                          className="min-w-64"
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={draft.is_excused}
                          disabled={!canEdit || savingNoteRiderId === rider.id}
                          onChange={(event) => updateAbsenceNoteDraft(rider.id, { is_excused: event.target.checked })}
                          aria-label={`Đánh dấu ${rider.rider_code} vắng có phép`}
                          className="size-5 rounded border-slate-300 accent-emerald-600"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="secondary"
                          className="size-10 p-0"
                          disabled={!canEdit || savingNoteRiderId === rider.id}
                          onClick={() => void saveAbsenceNote(rider)}
                          aria-label={`Lưu lý do vắng của ${rider.rider_code}`}
                        >
                          <Save size={16} className={savingNoteRiderId === rider.id ? "animate-pulse" : undefined} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-8 text-center text-sm text-slate-500">Tất cả rider bắt buộc đã được điểm danh và chia khu vực.</p>
        )}
      </section>
      {assignmentToast ? (
        <div className="fixed bottom-6 left-1/2 z-[70] flex w-[min(92vw,560px)] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-white px-4 py-3 shadow-2xl">
          <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-blue-600">Phân tuyến thành công</p><p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{assignmentToast.message}</p></div>
          <div className="flex shrink-0 gap-1"><Button type="button" variant="ghost" onClick={() => void undoLastAssignment()}>Hoàn tác</Button><Button type="button" variant="ghost" className="size-9 p-0" onClick={() => setAssignmentToast(null)}><X size={16} /></Button></div>
        </div>
      ) : null}
    </div>
  );
}

function RiderScanInput({ inputRef, onScan }: { inputRef: RefObject<HTMLInputElement | null>; onScan: (value: string) => void | Promise<void> }) {
  const [value, setValue] = useState("");
  return (
    <form onSubmit={(event) => { event.preventDefault(); const code = value.trim(); if (!code) return; setValue(""); void onScan(code); }} className="flex gap-2">
      <label className="relative min-w-0 flex-1">
        <ScanLine size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input ref={inputRef} autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="Bắn hoặc nhập Rider ID" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm font-bold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
      </label>
      <Button type="submit" aria-label="Tra Rider ID"><Search size={17} /></Button>
    </form>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase text-slate-500">{label}</p>
        <span className="grid size-8 place-items-center rounded-md bg-emerald-50 text-emerald-700"><Icon size={17} /></span>
      </div>
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function groupAssignments(rows: AssignmentRow[]): AssignmentGroup[] {
  const groups = new Map<string, AssignmentGroup>();
  for (const row of rows) {
    const key = `${row.rider_id}|${row.district}`;
    const current = groups.get(key) ?? {
      key,
      rider_id: row.rider_id,
      rider_code: row.rider_code,
      full_name: row.riders?.full_name ?? null,
      district: row.district,
      wards: [],
      assigned_at: row.assigned_at,
      checked_in_at: row.checked_in_at,
    };
    current.wards.push(row.ward);
    if (row.checked_in_at && !current.checked_in_at) current.checked_in_at = row.checked_in_at;
    groups.set(key, current);
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    wards: group.wards.sort((a, b) => a.localeCompare(b, "vi", { numeric: true })),
  }));
}

function areaKey(district: string, ward: string) {
  return `${normalize(district)}|${normalize(ward)}`;
}

function findDefaultDistrict(value: string | null) {
  const target = normalizeLocation(value);
  if (!target) return null;
  return hcmDistricts.find((district) =>
    [district.name, district.shortName, ...district.aliases].some((candidate) => normalizeLocation(candidate) === target),
  ) ?? null;
}

function findDefaultWards(district: DistrictDefinition, value: string | null) {
  const targets = (value ?? "")
    .split(/[,;|]+/)
    .map(normalizeLocation)
    .filter(Boolean);
  if (targets.length === 0) return [];
  return district.wards.filter((ward: WardDefinition) => {
    const aliases = [ward.name, ...(ward.aliases ?? [])].map(normalizeLocation);
    return targets.some((target) => aliases.includes(target));
  });
}

function normalizeLocation(value: string | null | undefined) {
  return normalize(value)
    .replace(/\b(quan|huyen|phuong|xa|thi tran|district|ward)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function routeLabel(district: string, wards: string[]) {
  return `${district} · ${wards.map(shortWard).join(", ")}`;
}

function shortWard(value: string) {
  return value.replace(/^Phường\s+/i, "P.").replace(/^Xã\s+/i, "X.").replace(/^Thị trấn\s+/i, "TT.");
}

function normalize(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().trim();
}

function todayInVietnam() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(
    new Date(value),
  );
}

function isOffStatus(status: string | null | undefined) {
  return (status ?? "").toUpperCase().includes("OFF");
}

function kvSortRank(kv: string | null | undefined) {
  const match = normalize(kv).match(/^(?:kv|khu vuc)?\s*([56])$/);
  if (match?.[1] === "5") return 0;
  if (match?.[1] === "6") return 1;
  return 2;
}

function absentStatusSortRank(status: string | null | undefined) {
  if (!isOffStatus(status)) return 0;
  if (status === "OFF_APPROVED") return 1;
  return 2;
}

function attendanceStatusLabel(status: string | null | undefined) {
  if (status === "OFF_APPROVED") return "OFF phép";
  if (status === "OFF_UNEXPECTED") return "OFF đột xuất";
  return "OFF tuần";
}

function offStatusClass(status: string | null | undefined) {
  if (status === "OFF_APPROVED") return "bg-blue-50 text-blue-700";
  if (status === "OFF_UNEXPECTED") return "bg-red-50 text-red-700";
  return "bg-amber-50 text-amber-700";
}
