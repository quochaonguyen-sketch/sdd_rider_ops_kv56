"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Bike,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CloudDownload,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
  UserRound,
  X,
  ZoomIn,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import type { DriverPerformanceDaily, Rider } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiderAvatarEditor } from "@/components/riders/rider-avatar-editor";
import { cn } from "@/utils/cn";
import {
  canonicalDistrictName,
  canonicalWardNames,
  districtDefinitionFor,
  districtMatches,
  hcmDistricts,
  normalizeLocation,
  wardMatches,
  wardNamesForDistrict,
  type DistrictDefinition,
} from "@/lib/locations/hcm";

type RiderFormState = {
  kv: string;
  home_district: string;
  cot: string;
  rider_code: string;
  full_name: string;
  pickup_district: string;
  pickup_ward: string;
  point_name: string;
  delivery_district: string;
  delivery_ward: string;
  status: "active" | "inactive";
};

type ImportIssue = {
  row: number;
  rider_code?: string;
  error: string;
};

type LocationsResponse = {
  districts: DistrictDefinition[];
};

type RiderPerformanceResponse = {
  success: boolean;
  days?: number;
  performance?: DriverPerformanceDaily[];
  error?: string;
};

type ThiCongPlanSyncResponse = {
  success: boolean;
  synced_riders?: number;
  inserted_riders?: number;
  updated_riders?: number;
  skipped_rows?: number;
  error?: string;
};

type RiderSortKey = "name" | "status" | "zone" | "cot" | "updated";
const RIDERS_PER_PAGE = 20;

const emptyRiderForm: RiderFormState = {
  kv: "KV5",
  home_district: "",
  cot: "COT 1",
  rider_code: "",
  full_name: "",
  pickup_district: "",
  pickup_ward: "",
  point_name: "",
  delivery_district: "",
  delivery_ward: "",
  status: "active",
};

export function RidersView({ canManageRiders }: { canManageRiders: boolean }) {
  const [districts, setDistricts] = useState<DistrictDefinition[]>(hcmDistricts);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [query, setQuery] = useState("");
  const [kv, setKv] = useState("all");
  const [cot, setCot] = useState("all");
  const [pickupDistrict, setPickupDistrict] = useState("all");
  const [pickupWard, setPickupWard] = useState("all");
  const [deliveryDistrict, setDeliveryDistrict] = useState("all");
  const [deliveryWard, setDeliveryWard] = useState("all");
  const [status, setStatus] = useState("all");
  const [shift, setShift] = useState("all");
  const [sort, setSort] = useState<{ key: RiderSortKey; direction: "asc" | "desc" }>({ key: "updated", direction: "desc" });
  const [page, setPage] = useState(1);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Rider | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RiderFormState>(emptyRiderForm);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [planSyncing, setPlanSyncing] = useState(false);
  const [importIssues, setImportIssues] = useState<ImportIssue[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    setError(null);
    const riderResult = await supabase.from("riders").select("*").order("updated_at", { ascending: false });

    if (riderResult.error) {
      setError(riderResult.error.message);
    } else {
      const nextRiders = (riderResult.data ?? []) as Rider[];
      setRiders(nextRiders);
      setSelected((current) => nextRiders.find((rider) => rider.id === current?.id) ?? nextRiders[0] ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;

    fetch("/api/locations/hcm")
      .then((response) => {
        if (!response.ok) throw new Error("Không thể tải danh mục quận/phường");
        return response.json() as Promise<LocationsResponse>;
      })
      .then((data) => {
        if (active && data.districts.length > 0) setDistricts(data.districts);
      })
      .catch(() => {
        if (active) setDistricts(hcmDistricts);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showAddForm && !showDetail) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showAddForm, showDetail]);

  useEffect(() => {
    if (!showDetail) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowDetail(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showDetail]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  useSupabaseRealtime({ table: "riders", onChange: refresh });

  const districtOptions = useMemo(() => districts.map((district) => district.name), [districts]);
  const cotOptions = useMemo(() => uniqueOptions(riders.map((rider) => rider.cot)), [riders]);
  const shiftOptions = useMemo(() => uniqueOptions(riders.map((rider) => rider.current_shift)), [riders]);
  const zoneOptions = useMemo(
    () => uniqueOptions(riders.map((rider) => districtDisplayName(rider.delivery_district, districts))),
    [districts, riders],
  );
  const pickupWardOptions = useMemo(
    () => (pickupDistrict === "all" ? [] : wardNamesForDistrict(pickupDistrict, districts)),
    [districts, pickupDistrict],
  );

  const filtered = useMemo(() => {
    const normalized = normalizeLocation(query);
    return riders.filter((rider) => {
      const matchesQuery =
        !normalized ||
        [
          rider.rider_code,
          rider.full_name,
          rider.home_district,
          rider.pickup_district,
          rider.pickup_ward,
          rider.point_name,
          rider.delivery_district,
          rider.delivery_ward,
          rider.cot,
          rider.kv,
          riderPhone(rider),
        ].some((value) => normalizeLocation(value).includes(normalized));
      const matchesKv = kv === "all" || canonicalKv(rider.kv) === kv;
      const matchesCot = cot === "all" || rider.cot === cot;
      const matchesPickupDistrict = pickupDistrict === "all" || districtMatches(rider.pickup_district, pickupDistrict, districts);
      const matchesPickupWard =
        pickupWard === "all" || wardMatches(rider.pickup_district, rider.pickup_ward, pickupWard, districts);
      const matchesDeliveryDistrict = deliveryDistrict === "all" ||
        (deliveryDistrict === "__unassigned__" ? !rider.zone_id && !rider.delivery_district : districtMatches(rider.delivery_district, deliveryDistrict, districts));
      const matchesDeliveryWard =
        deliveryWard === "all" || wardMatches(rider.delivery_district, rider.delivery_ward, deliveryWard, districts);
      const matchesStatus = status === "all" || rider.status === status;
      const matchesShift = shift === "all" || (shift === "__has__" ? Boolean(rider.current_shift) : shift === "__none__" ? !rider.current_shift : rider.current_shift === shift);
      return matchesQuery && matchesKv && matchesCot && matchesPickupDistrict && matchesPickupWard && matchesDeliveryDistrict && matchesDeliveryWard && matchesStatus && matchesShift;
    }).sort((a, b) => compareRiders(a, b, sort.key) * (sort.direction === "asc" ? 1 : -1));
  }, [cot, deliveryDistrict, deliveryWard, districts, kv, pickupDistrict, pickupWard, query, riders, shift, sort, status]);

  const stats = useMemo(() => {
    const active = riders.filter((rider) => rider.status !== "inactive").length;
    const onShift = riders.filter((rider) => Boolean(rider.current_shift)).length;
    const unassigned = riders.filter((rider) => !rider.zone_id && !rider.delivery_district).length;
    return {
      total: riders.length,
      active,
      inactive: riders.length - active,
      onShift,
      unassigned,
    };
  }, [riders]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / RIDERS_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const paginated = filtered.slice((safePage - 1) * RIDERS_PER_PAGE, safePage * RIDERS_PER_PAGE);
  const visibleChecked = paginated.filter((rider) => checkedIds.has(rider.id)).length;
  const activeFilterCount = [query, status !== "all", deliveryDistrict !== "all", shift !== "all", kv !== "all", cot !== "all", pickupDistrict !== "all", pickupWard !== "all", deliveryWard !== "all"].filter(Boolean).length;

  async function saveRider(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const response = await fetch("/api/riders", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { id: editingId, ...form } : form),
    });
    const result = (await response.json().catch(() => null)) as { error?: string; rider?: Rider } | null;

    setSaving(false);

    if (!response.ok) {
      setError(result?.error ?? "Không thể lưu rider");
      return;
    }

    setForm(emptyRiderForm);
    setShowAddForm(false);
    setEditingId(null);
    setSelected(result?.rider ?? selected);
    setSuccess(editingId ? "Đã cập nhật rider thành công." : "Đã thêm rider thành công.");
    await load();
  }

  async function syncRidersFromPlan() {
    setPlanSyncing(true);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/riders/thi-cong-plan", {
      method: "POST",
    });
    const result = await response.json().catch(() => null) as ThiCongPlanSyncResponse | null;
    setPlanSyncing(false);
    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể đồng bộ Thi Công Plan");
      return;
    }
    setSuccess(`Đã lấy ${result.synced_riders ?? 0} rider từ Thi Công Plan về web: thêm ${result.inserted_riders ?? 0}, cập nhật ${result.updated_riders ?? 0}${result.skipped_rows ? `; bỏ qua ${result.skipped_rows} dòng không có ID` : ""}.`);
  }

  async function importExcel(file: File) {
    setImporting(true);
    setError(null);
    setSuccess(null);
    setImportIssues([]);

    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/riders/import", { method: "POST", body });
    const result = (await response.json().catch(() => null)) as
      | { error?: string; errors?: ImportIssue[]; imported?: number }
      | null;

    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (!response.ok) {
      setError(result?.error ?? "Không thể import file Excel");
      setImportIssues(result?.errors ?? []);
      return;
    }

    setSuccess(`Đã import ${result?.imported ?? 0} rider thành công.`);
    await load();
  }

  function updateForm(field: keyof RiderFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateFormDistrict(field: "home_district" | "pickup_district" | "delivery_district", value: string) {
    setForm((current) => {
      if (field === "pickup_district") return { ...current, pickup_district: value, pickup_ward: "" };
      if (field === "delivery_district") return { ...current, delivery_district: value, delivery_ward: "" };
      return { ...current, home_district: value };
    });
  }

  function beginAdd() {
    setEditingId(null);
    setForm(emptyRiderForm);
    setShowAddForm(true);
    setShowDetail(false);
    setError(null);
    setSuccess(null);
  }

  function beginEdit(rider: Rider) {
    setSelected(rider);
    setEditingId(rider.id);
    setForm({
      kv: rider.kv ?? "",
      home_district: canonicalDistrictName(rider.home_district, districts) || rider.home_district || "",
      cot: rider.cot ?? "",
      rider_code: rider.rider_code,
      full_name: rider.full_name ?? "",
      pickup_district: canonicalDistrictName(rider.pickup_district, districts) || rider.pickup_district || "",
      pickup_ward: canonicalWardNames(rider.pickup_district, rider.pickup_ward, districts).join(", ") || rider.pickup_ward || "",
      point_name: rider.point_name ?? "",
      delivery_district: canonicalDistrictName(rider.delivery_district, districts) || rider.delivery_district || "",
      delivery_ward:
        canonicalWardNames(rider.delivery_district, rider.delivery_ward, districts).join(", ") ||
        rider.delivery_ward ||
        "",
      status: rider.status === "inactive" ? "inactive" : "active",
    });
    setShowAddForm(true);
    setShowDetail(false);
    setError(null);
    setSuccess(null);
  }

  function closeForm() {
    setShowAddForm(false);
    setEditingId(null);
    setForm(emptyRiderForm);
  }

  function resetFilters() {
    setQuery("");
    setKv("all");
    setCot("all");
    setPickupDistrict("all");
    setPickupWard("all");
    setDeliveryDistrict("all");
    setDeliveryWard("all");
    setStatus("all");
    setShift("all");
    setPage(1);
  }

  function changeSort(key: RiderSortKey) {
    setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" });
    setPage(1);
  }

  function toggleChecked(id: string) {
    setCheckedIds((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function toggleVisible() {
    setCheckedIds((current) => { const next = new Set(current); const allVisible = paginated.every((rider) => next.has(rider.id)); for (const rider of paginated) { if (allVisible) next.delete(rider.id); else next.add(rider.id); } return next; });
  }

  function updateRiderInView(updated: Rider) {
    setRiders((current) => current.map((rider) => (rider.id === updated.id ? updated : rider)));
    setSelected(updated);
    setSuccess("Đã cập nhật avatar rider.");
  }

  async function deleteRider(rider: Rider) {
    const name = rider.full_name ?? rider.rider_code;
    if (!window.confirm(`Xóa vĩnh viễn rider ${name} (${rider.rider_code})? Lịch sử chấm công và vi phạm vẫn được giữ lại.`)) return;
    setDeletingId(rider.id);
    setError(null);
    const response = await fetch("/api/riders", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rider.id }) });
    const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
    setDeletingId(null);
    if (!response.ok || !result?.success) { setError(result?.error ?? "Không thể xóa rider"); return; }
    setRiders((current) => current.filter((item) => item.id !== rider.id));
    setSelected((current) => current?.id === rider.id ? null : current);
    setCheckedIds((current) => { const next = new Set(current); next.delete(rider.id); return next; });
    setShowDetail(false);
    setSuccess(`Đã xóa rider ${name}.`);
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-slate-950 text-white">
              <Bike size={21} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Riders</h1>
              <p className="mt-0.5 text-sm text-slate-500">Tìm nhanh, lọc và quản lý danh sách rider vận hành.</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageRiders ? <>
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
            <Button type="button" variant="secondary" className="px-2 sm:px-4" disabled={planSyncing} onClick={() => void syncRidersFromPlan()} title="Lấy dữ liệu rider từ tab Thi Công Plan về website">
              <CloudDownload size={16} />
              <span className="hidden sm:inline">{planSyncing ? "Đang đồng bộ..." : "Đồng bộ Plan"}</span>
              <span className="sm:hidden">Plan</span>
            </Button>
            <Button type="button" variant="secondary" className="px-2 sm:px-4" disabled={importing} onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              <span className="hidden sm:inline">{importing ? "Đang import..." : "Import Excel"}</span>
              <span className="sm:hidden">Excel</span>
            </Button>
            <Button type="button" className="px-2 sm:px-4" onClick={beginAdd}>
              <Plus size={16} />
              Thêm rider
            </Button>
          </> : null}
          <Button type="button" variant="secondary" className="px-2 sm:px-4" onClick={refresh} disabled={loading}>
            <RefreshCcw size={16} />
            <span className="hidden sm:inline">Tải lại</span>
            <span className="sm:hidden">Lại</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <StatCard className="col-span-6 xl:col-span-3" icon={<UserRound size={18} />} label="Tổng rider" value={stats.total} helper={`${filtered.length} đang hiển thị`} tone="slate" active={activeFilterCount === 0} onClick={resetFilters} />
        <StatCard className="col-span-6 xl:col-span-3" icon={<CheckCircle2 size={18} />} label="Đang hoạt động" value={stats.active} helper={`${stats.inactive} ngừng hoạt động`} tone="emerald" active={status === "active"} onClick={() => { setStatus("active"); setPage(1); }} />
        <StatCard className="col-span-6 xl:col-span-3" icon={<Clock3 size={18} />} label="Có ca hiện tại" value={stats.onShift} helper={`${stats.total - stats.onShift} chưa có ca`} tone="blue" active={shift === "__has__"} onClick={() => { setShift("__has__"); setPage(1); }} />
        <StatCard className="col-span-6 xl:col-span-3" icon={<MapPin size={18} />} label="Chưa gán khu vực" value={stats.unassigned} helper="Không có zone hoặc quận giao" tone="amber" active={deliveryDistrict === "__unassigned__"} onClick={() => { setDeliveryDistrict("__unassigned__"); setDeliveryWard("all"); setPage(1); }} />
      </div>

      {canManageRiders && showAddForm ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <button type="button" aria-label="Đóng form rider" className="absolute inset-0 cursor-default" onClick={closeForm} />
          <Card className={cn("app-modal-panel relative z-10 w-full rounded-b-none shadow-2xl sm:mx-auto sm:max-w-6xl sm:rounded-xl", editingId && "border-blue-200 bg-blue-50")}>
            <form onSubmit={saveRider} className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">{editingId ? "Chỉnh sửa rider" : "Thêm rider"}</h2>
                  <p className="text-sm text-slate-500">{editingId ? `Đang sửa ${form.full_name || form.rider_code}` : "Chọn quận/phường từ danh sách để dữ liệu dễ lọc hơn."}</p>
                </div>
                <div className="flex items-center gap-2">
                  {editingId ? <Badge tone="blue">EDIT</Badge> : null}
                  <Button type="button" variant="ghost" className="size-10 shrink-0 p-0" onClick={closeForm}>
                    <X size={18} />
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_1.25fr_1.25fr]">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <SectionTitle icon={<UserRound size={16} />} title="Thông tin rider" />
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <Field label="KV" value={form.kv} onChange={(value) => updateForm("kv", value)} />
                    <Field label="COT" value={form.cot} onChange={(value) => updateForm("cot", value)} />
                    <Field label="ID rider" value={form.rider_code} onChange={(value) => updateForm("rider_code", value)} required />
                    <Field label="Họ tên" value={form.full_name} onChange={(value) => updateForm("full_name", value)} required />
                    <DistrictField label="Quận ở" value={form.home_district} options={districtOptions} onChange={(value) => updateFormDistrict("home_district", value)} />
                    <SelectField label="Status" value={form.status} onChange={(value) => updateForm("status", value)}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </SelectField>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
                  <SectionTitle icon={<MapPin size={16} />} title="Khu vực lấy" />
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <DistrictField label="Quận lấy" value={form.pickup_district} options={districtOptions} onChange={(value) => updateFormDistrict("pickup_district", value)} />
                    <WardField
                      label="Phường lấy"
                      district={form.pickup_district}
                      districts={districts}
                      value={form.pickup_ward}
                      onChange={(value) => updateForm("pickup_ward", value)}
                    />
                    <div className="sm:col-span-2">
                      <Field label="Điểm lấy / Point name" value={form.point_name} onChange={(value) => updateForm("point_name", value)} />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                  <SectionTitle icon={<Navigation size={16} />} title="Khu vực giao" />
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <DistrictField label="Quận giao" value={form.delivery_district} options={districtOptions} onChange={(value) => updateFormDistrict("delivery_district", value)} />
                    <WardField
                      label="Phường giao"
                      district={form.delivery_district}
                      districts={districts}
                      value={form.delivery_ward}
                      onChange={(value) => updateForm("delivery_ward", value)}
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                <Button type="button" variant="secondary" onClick={closeForm}>
                  Hủy
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Đang lưu..." : editingId ? "Cập nhật rider" : "Lưu rider"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      ) : null}

      <section aria-label="Tìm kiếm và lọc rider" className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-12 gap-4">
          <label className="relative col-span-12 lg:col-span-5">
            <span className="sr-only">Tìm rider</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <Input className="pl-10" placeholder="Tìm theo tên, ID, khu vực hoặc điểm lấy..." value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          </label>
          <div className="col-span-12 grid gap-3 sm:grid-cols-3 lg:col-span-7">
            <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} aria-label="Lọc trạng thái">
              <option value="all">Tất cả trạng thái</option><option value="active">Đang hoạt động</option><option value="inactive">Ngừng hoạt động</option>
            </Select>
            <Select value={kv} onChange={(event) => { setKv(event.target.value); setPage(1); }} aria-label="Lọc khu vực">
              <option value="all">Tất cả khu vực</option><option value="KV5">KV5</option><option value="KV6">KV6</option>
            </Select>
            <Select value={shift} onChange={(event) => { setShift(event.target.value); setPage(1); }} aria-label="Lọc ca làm việc">
              <option value="all">Tất cả ca</option><option value="__has__">Có ca hiện tại</option><option value="__none__">Chưa có ca</option>{shiftOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </Select>
          </div>
        </div>
        <details className="mt-3 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600">Bộ lọc nâng cao</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={deliveryDistrict} onChange={(event) => { setDeliveryDistrict(event.target.value); setDeliveryWard("all"); setPage(1); }} aria-label="Lọc quận giao"><option value="all">Tất cả quận giao</option><option value="__unassigned__">Chưa gán quận giao</option>{zoneOptions.map((option) => <option key={option} value={option}>{option}</option>)}</Select>
            <Select value={cot} onChange={(event) => { setCot(event.target.value); setPage(1); }} aria-label="Lọc COT"><option value="all">Tất cả COT</option>{cotOptions.map((option) => <option key={option} value={option}>{option}</option>)}</Select>
            <Select value={pickupDistrict} onChange={(event) => { setPickupDistrict(event.target.value); setPickupWard("all"); setPage(1); }} aria-label="Lọc quận lấy"><option value="all">Tất cả quận lấy</option>{districtOptions.map((option) => <option key={option} value={option}>{districtShortLabel(option, districts)}</option>)}</Select>
            <Select value={pickupWard} onChange={(event) => { setPickupWard(event.target.value); setPage(1); }} disabled={pickupDistrict === "all"} aria-label="Lọc phường lấy"><option value="all">Tất cả phường lấy</option>{pickupWardOptions.map((option) => <option key={option} value={option}>{wardShortLabel(option)}</option>)}</Select>
          </div>
        </details>
        <div className="mt-3 flex min-h-8 flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500">Đang lọc:</span>
          {query ? <FilterChip label={`Từ khóa: ${query}`} onRemove={() => { setQuery(""); setPage(1); }} /> : null}
          {status !== "all" ? <FilterChip label={status === "active" ? "Đang hoạt động" : "Ngừng hoạt động"} onRemove={() => setStatus("all")} /> : null}
          {deliveryDistrict !== "all" ? <FilterChip label={deliveryDistrict === "__unassigned__" ? "Chưa gán khu vực" : deliveryDistrict} onRemove={() => setDeliveryDistrict("all")} /> : null}
          {shift !== "all" ? <FilterChip label={shift === "__has__" ? "Có ca hiện tại" : shift === "__none__" ? "Chưa có ca" : shift} onRemove={() => setShift("all")} /> : null}
          {kv !== "all" ? <FilterChip label={kv} onRemove={() => setKv("all")} /> : null}
          {cot !== "all" ? <FilterChip label={cot} onRemove={() => setCot("all")} /> : null}
          {activeFilterCount === 0 ? <span className="text-xs text-slate-400">Không có bộ lọc</span> : <button type="button" className="ml-auto text-xs font-semibold text-blue-700 hover:text-blue-800" onClick={resetFilters}>Xóa tất cả</button>}
        </div>
      </section>

      {success ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {importIssues.length > 0 ? <ImportIssues issues={importIssues} /> : null}

      <div>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div><h2 className="font-semibold text-slate-950">Danh sách rider</h2><p className="text-xs text-slate-500">{filtered.length} kết quả · Chọn dòng để xem chi tiết</p></div>
            {canManageRiders && checkedIds.size > 0 ? <div className="flex items-center gap-2"><span className="text-sm font-semibold text-blue-700">Đã chọn {checkedIds.size}</span>{checkedIds.size === 1 ? <Button type="button" variant="secondary" className="h-9" onClick={() => { const rider = riders.find((item) => checkedIds.has(item.id)); if (rider) beginEdit(rider); }}><Pencil size={15} />Sửa</Button> : null}<Button type="button" variant="ghost" className="h-9" onClick={() => setCheckedIds(new Set())}>Bỏ chọn</Button></div> : null}
          </div>
          <div className="max-h-[680px] min-h-[480px] overflow-auto">
            <table className="w-full min-w-[860px] table-fixed text-left text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-600 shadow-[0_1px_0_#e2e8f0]"><tr>{canManageRiders ? <th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Chọn tất cả rider trên trang" checked={paginated.length > 0 && visibleChecked === paginated.length} onChange={toggleVisible} /></th> : null}<SortableRiderHeader label="Rider" sortKey="name" current={sort} onSort={changeSort} className="w-[30%]" /><SortableRiderHeader label="Trạng thái" sortKey="status" current={sort} onSort={changeSort} className="w-[14%]" /><SortableRiderHeader label="Khu vực" sortKey="zone" current={sort} onSort={changeSort} /><SortableRiderHeader label="COT" sortKey="cot" current={sort} onSort={changeSort} /><SortableRiderHeader label="Cập nhật" sortKey="updated" current={sort} onSort={changeSort} align="right" />{canManageRiders ? <th className="w-16" /> : null}</tr></thead>
              <tbody className="divide-y divide-slate-100">{loading ? Array.from({ length: 8 }, (_, index) => <tr key={index} className="h-16 animate-pulse"><td colSpan={canManageRiders ? 7 : 5} className="px-4"><div className="h-4 rounded bg-slate-100" /></td></tr>) : paginated.map((rider) => <tr key={rider.id} className={cn("h-16 cursor-pointer transition hover:bg-blue-50/50", checkedIds.has(rider.id) && "bg-blue-50/70")} onClick={() => { setSelected(rider); setShowDetail(true); }}>{canManageRiders ? <td className="px-4" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Chọn ${rider.full_name ?? rider.rider_code}`} checked={checkedIds.has(rider.id)} onChange={() => toggleChecked(rider.id)} /></td> : null}<td className="px-4 py-2"><div className="flex min-w-0 items-center gap-3"><RiderAvatar rider={rider} size="sm" /><div className="min-w-0"><p className="truncate font-semibold text-slate-950">{rider.full_name ?? "Chưa có tên"}</p><p className="truncate font-mono text-xs text-slate-500">{rider.rider_code}{riderPhone(rider) ? ` · ${riderPhone(rider)}` : ""}</p></div></div></td><td className="px-4"><RiderStatusBadge status={rider.status} /></td><td className="px-4"><p className="truncate font-medium text-slate-800">{districtDisplayName(rider.delivery_district, districts) || "Chưa gán"}</p><p className="truncate text-xs text-slate-500">{rider.delivery_ward ?? rider.kv ?? "—"}</p></td><td className="px-4 font-semibold text-slate-700">{rider.cot ?? "—"}</td><td className="px-4 text-right"><p className="text-sm tabular-nums text-slate-700">{formatRelativeTime(rider.updated_at)}</p><p className="text-xs tabular-nums text-slate-400">{formatShortDate(rider.updated_at)}</p></td>{canManageRiders ? <td className="pr-3 text-right"><Button type="button" variant="ghost" aria-label={`Sửa ${rider.full_name ?? rider.rider_code}`} className="size-9 p-0" onClick={(event) => { event.stopPropagation(); beginEdit(rider); }}><Pencil size={15} /></Button></td> : null}</tr>)}{!loading && paginated.length === 0 ? <tr><td colSpan={canManageRiders ? 7 : 5} className="h-80 text-center text-sm text-slate-500">Không có rider nào khớp bộ lọc hiện tại.</td></tr> : null}</tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3"><p className="text-sm text-slate-500">Trang <strong className="text-slate-700">{safePage}/{pageCount}</strong></p><div className="flex gap-2"><Button type="button" variant="secondary" className="size-9 p-0" aria-label="Trang trước" disabled={safePage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16} /></Button><Button type="button" variant="secondary" className="size-9 p-0" aria-label="Trang sau" disabled={safePage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}><ChevronRight size={16} /></Button></div></div>
        </section>
      </div>

      {selected && showDetail ? (
        <RiderDetailModal selected={selected} canManageRiders={canManageRiders} deleting={selected.id === deletingId} onClose={() => setShowDetail(false)} onEdit={beginEdit} onDelete={deleteRider} onUpdated={updateRiderInView} />
      ) : null}
    </div>
  );
}

function StatCard({ icon, label, value, helper, tone, active, onClick, className }: { icon: React.ReactNode; label: string; value: number; helper: string; tone: "slate" | "emerald" | "blue" | "amber"; active?: boolean; onClick: () => void; className?: string }) {
  const classes = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("min-h-36 rounded-xl border bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50/30 focus:outline-none focus:ring-2 focus:ring-blue-500", active ? "border-blue-300 ring-1 ring-blue-200" : "border-slate-200", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className={cn("grid size-10 place-items-center rounded-lg", classes[tone])}>{icon}</span>
        <strong className="text-2xl text-slate-950">{value}</strong>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-800">{label}</p>
      <p className="mt-0.5 text-xs text-slate-500">{helper}</p>
    </button>
  );
}

function RiderStatusBadge({ status }: { status: string | null }) {
  const inactive = status === "inactive" || status === "suspended";
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", inactive ? "bg-slate-100 text-slate-700 ring-slate-500/20" : "bg-emerald-50 text-emerald-700 ring-emerald-600/20")}><span className={cn("size-1.5 rounded-full", inactive ? "bg-slate-400" : "bg-emerald-500")} />{inactive ? "inactive" : "active"}</span>;
}

function SortableRiderHeader({ label, sortKey, current, onSort, align, className }: { label: string; sortKey: RiderSortKey; current: { key: RiderSortKey; direction: "asc" | "desc" }; onSort: (key: RiderSortKey) => void; align?: "right"; className?: string }) {
  const Icon = current.key !== sortKey ? ArrowUpDown : current.direction === "asc" ? ArrowUp : ArrowDown;
  return <th className={cn("px-4 py-3", className)}><button type="button" className={cn("flex items-center gap-1 font-semibold hover:text-slate-950", align === "right" && "ml-auto")} onClick={() => onSort(sortKey)}>{label}<Icon size={13} /></button></th>;
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-blue-700">{label}<button type="button" aria-label={`Xóa bộ lọc ${label}`} className="grid size-5 place-items-center rounded-full hover:bg-blue-100" onClick={onRemove}><X size={12} /></button></span>;
}

function compareRiders(a: Rider, b: Rider, key: RiderSortKey) {
  if (key === "name") return (a.full_name ?? a.rider_code).localeCompare(b.full_name ?? b.rider_code, "vi", { numeric: true });
  if (key === "status") return (a.status ?? "active").localeCompare(b.status ?? "active");
  if (key === "zone") return (a.delivery_district ?? "").localeCompare(b.delivery_district ?? "", "vi", { numeric: true });
  if (key === "cot") return (a.cot ?? "").localeCompare(b.cot ?? "", "vi", { numeric: true });
  return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
}

function formatRelativeTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "Vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

function formatReportDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("vi-VN").format(value ?? 0);
}

function formatRate(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  const normalized = value <= 1 ? value * 100 : value;
  return `${new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }).format(normalized)}%`;
}

function riderPhone(rider: Rider) {
  const phone = rider.raw_data?.phone ?? rider.raw_data?.phone_number ?? rider.raw_data?.mobile;
  return typeof phone === "string" || typeof phone === "number" ? String(phone) : "";
}

function RiderDetailModal({ selected, canManageRiders, deleting, onClose, onEdit, onDelete, onUpdated }: { selected: Rider; canManageRiders: boolean; deleting: boolean; onClose: () => void; onEdit: (rider: Rider) => void; onDelete: (rider: Rider) => void; onUpdated: (rider: Rider) => void }) {
  const [performance, setPerformance] = useState<DriverPerformanceDaily[]>([]);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceError, setPerformanceError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setPerformanceLoading(true);
      setPerformanceError(null);
      setPerformance([]);

      fetch(`/api/riders/${selected.id}/performance?days=45`)
        .then((response) => response.json() as Promise<RiderPerformanceResponse>)
        .then((result) => {
          if (!active) return;
          if (!result.success) {
            setPerformanceError(result.error ?? "Không thể tải lượng deli/pick");
            return;
          }
          setPerformance(result.performance ?? []);
        })
        .catch((error: unknown) => {
          if (active) setPerformanceError(error instanceof Error ? error.message : "Không thể tải lượng deli/pick");
        })
        .finally(() => {
          if (active) setPerformanceLoading(false);
        });
    })();

    return () => {
      active = false;
    };
  }, [selected.id]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="rider-detail-title" className="fixed inset-0 z-50 grid items-end md:place-items-center md:p-6">
      <button type="button" aria-label="Đóng chi tiết rider" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <Card className="app-modal-panel relative z-10 flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-b-none rounded-t-3xl border-0 p-0 shadow-2xl md:rounded-2xl">
        <div className="shrink-0 border-b border-slate-100 p-5 pb-4 md:p-6">
          <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300 md:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <RiderAvatar rider={selected} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="rider-detail-title" className="truncate text-lg font-bold text-slate-950">{selected.full_name ?? selected.rider_code}</h2>
                  <Badge tone={selected.status === "inactive" ? "red" : "green"}>{selected.status ?? "active"}</Badge>
                </div>
                <p className="mt-1 font-mono text-sm text-slate-500">ID {selected.rider_code}</p>
              </div>
            </div>
            <Button type="button" variant="ghost" className="size-10 shrink-0 p-0" onClick={onClose}>
              <X size={20} />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 [scrollbar-gutter:stable] md:p-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="min-w-0">
              {canManageRiders ? <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                <p className="font-semibold text-blue-950">Cập nhật avatar rider</p>
                <div className="mt-3">
                  <RiderAvatarEditor rider={selected} onUpdated={onUpdated} />
                </div>
              </div> : null}

              <div className="mt-4 grid grid-cols-3 gap-2">
                <SummaryChip label="KV" value={selected.kv ?? "-"} tone="blue" />
                <SummaryChip label="COT" value={selected.cot ?? "-"} tone="amber" />
                <SummaryChip label="Quận ở" value={districtDisplayName(selected.home_district) || "-"} tone="slate" />
              </div>

              <div className="relative mt-4 space-y-3 before:absolute before:bottom-8 before:left-[19px] before:top-8 before:w-px before:bg-slate-200">
                <RouteStep icon={<MapPin size={17} />} label="Khu vực lấy" title={districtDisplayName(selected.pickup_district)} subtitle={joinLocation(selected.pickup_ward, selected.point_name)} tone="blue" />
                <RouteStep icon={<Navigation size={17} />} label="Khu vực giao" title={districtDisplayName(selected.delivery_district)} subtitle={selected.delivery_ward} tone="emerald" />
              </div>
            </div>

            <RiderPerformancePanel performance={performance} loading={performanceLoading} error={performanceError} />
          </div>
        </div>

        {canManageRiders ? <div className="shrink-0 border-t border-slate-100 bg-white p-5 pt-4 md:p-6">
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" className="w-full" onClick={() => onEdit(selected)}>
              <Pencil size={16} />
              Chỉnh sửa thông tin rider
            </Button>
            <Button type="button" variant="ghost" className="w-full text-red-700 hover:bg-red-50" disabled={deleting} onClick={() => void onDelete(selected)}>
              <Trash2 size={16} />
              {deleting ? "Đang xóa..." : "Xóa rider"}
            </Button>
          </div>
        </div> : null}
      </Card>
    </div>
  );
}

function RiderPerformancePanel({ performance, loading, error }: { performance: DriverPerformanceDaily[]; loading: boolean; error: string | null }) {
  const totals = useMemo(
    () =>
      performance.reduce(
        (acc, item) => ({
          deliveryAssigned: acc.deliveryAssigned + (item.delivery_assigned ?? 0),
          deliveryDelivered: acc.deliveryDelivered + (item.delivery_delivered ?? 0),
          pickupAssigned: acc.pickupAssigned + (item.pickup_assigned ?? 0),
          pickupPicked: acc.pickupPicked + (item.pickup_picked ?? 0),
        }),
        { deliveryAssigned: 0, deliveryDelivered: 0, pickupAssigned: 0, pickupPicked: 0 },
      ),
    [performance],
  );

  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-blue-50 text-blue-700">
                <BarChart3 size={17} />
              </span>
              <h3 className="font-semibold text-slate-950">Lượng deli / pick từng ngày</h3>
            </div>
            <p className="mt-1 text-xs text-slate-500">Dữ liệu 45 ngày gần nhất từ bảng driver_performance_daily.</p>
          </div>
          <Badge tone="blue">{performance.length} ngày</Badge>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <SummaryMetric label="Deli giao / phân" value={`${formatNumber(totals.deliveryDelivered)} / ${formatNumber(totals.deliveryAssigned)}`} />
          <SummaryMetric label="Pick lấy / phân" value={`${formatNumber(totals.pickupPicked)} / ${formatNumber(totals.pickupAssigned)}`} />
        </div>
      </div>

      <div className="max-h-[23rem] overflow-y-auto [scrollbar-gutter:stable]">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : error ? (
          <div className="p-4 text-sm text-red-700">{error}</div>
        ) : performance.length === 0 ? (
          <div className="p-4 text-sm text-slate-500">Chưa có dữ liệu deli/pick cho rider này.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-slate-400 shadow-[0_1px_0_#e2e8f0]">
              <tr>
                <th className="px-4 py-3">Ngày</th>
                <th className="px-3 py-3 text-right">Deli</th>
                <th className="px-3 py-3 text-right">Pick</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {performance.map((item) => (
                <tr key={item.performance_id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{formatReportDate(item.report_date)}</p>
                    <p className="text-xs text-slate-400">{item.contract_type_name ?? "Không có loại hợp đồng"}</p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-semibold text-slate-900">{formatNumber(item.delivery_delivered)} / {formatNumber(item.delivery_assigned)}</p>
                    <p className="text-xs text-slate-400">{formatRate(item.delivery_success_rate)}</p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-semibold text-slate-900">{formatNumber(item.pickup_picked)} / {formatNumber(item.pickup_assigned)}</p>
                    <p className="text-xs text-slate-400">{formatRate(item.pickup_success_rate)}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-950">{value}</p>
    </div>
  );
}

function ImportIssues({ issues }: { issues: ImportIssue[] }) {
  return (
    <Card className="border-red-200 bg-red-50">
      <h2 className="font-semibold text-red-800">Không import vì có {issues.length} lỗi</h2>
      <div className="mt-3 max-h-64 overflow-auto">
        <table className="w-full text-left text-sm text-red-800">
          <thead>
            <tr>
              <th className="pb-2 pr-4">Dòng</th>
              <th className="pb-2 pr-4">ID</th>
              <th className="pb-2">Lỗi</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue, index) => (
              <tr key={`${issue.row}-${issue.rider_code ?? ""}-${index}`} className="border-t border-red-200">
                <td className="py-2 pr-4">{issue.row}</td>
                <td className="py-2 pr-4">{issue.rider_code ?? "-"}</td>
                <td className="py-2">{issue.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      <Input required={required} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </Select>
    </label>
  );
}

function DistrictField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <SelectField label={label} value={value} onChange={onChange}>
      <option value="">Chọn quận/huyện</option>
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </SelectField>
  );
}

function WardField({
  label,
  district,
  districts,
  value,
  onChange,
}: {
  label: string;
  district: string;
  districts: DistrictDefinition[];
  value: string;
  onChange: (value: string) => void;
}) {
  const options = useMemo(() => wardNamesForDistrict(district, districts), [district, districts]);
  const selectedValues = useMemo(
    () => canonicalWardNames(district, value, districts),
    [district, districts, value],
  );

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      <Select
        multiple
        disabled={!district}
        className="h-32 py-2"
        value={selectedValues}
        onChange={(event) => {
          const values = Array.from(event.currentTarget.selectedOptions, (option) => option.value);
          onChange(values.join(", "));
        }}
      >
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
      </Select>
      <span className="mt-1 block text-[11px] text-slate-500">
        {district ? "Có thể chọn nhiều phường/xã." : "Chọn quận trước."}
      </span>
    </label>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
      <span className="grid size-8 place-items-center rounded-lg bg-white text-slate-600 shadow-sm ring-1 ring-slate-200">{icon}</span>
      {title}
    </div>
  );
}

function RiderAvatar({ rider, size }: { rider: Rider; size: "sm" | "lg" }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const dimension = size === "lg" ? "size-16" : "size-11";
  const iconSize = size === "lg" ? 26 : 18;

  useEffect(() => {
    if (!previewOpen) return;
    const originalOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [previewOpen]);

  if (rider.avatar_url) {
    const riderName = rider.full_name ?? rider.rider_code;
    return (
      <>
        <button
          type="button"
          aria-label={`Xem ảnh lớn của ${riderName}`}
          title="Bấm để xem ảnh lớn"
          className={cn(
            dimension,
            "group relative shrink-0 cursor-zoom-in overflow-hidden rounded-full border-2 border-white bg-cover bg-center shadow-sm ring-1 ring-slate-200 transition hover:scale-105 hover:ring-2 hover:ring-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500",
          )}
          style={{ backgroundImage: `url("${rider.avatar_url}")` }}
          onClick={(event) => {
            event.stopPropagation();
            setPreviewOpen(true);
          }}
        >
          <span className="absolute inset-0 grid place-items-center bg-slate-950/0 text-white opacity-0 transition group-hover:bg-slate-950/35 group-hover:opacity-100 group-focus:bg-slate-950/35 group-focus:opacity-100">
            <ZoomIn size={size === "lg" ? 20 : 16} />
          </span>
        </button>
        {previewOpen
          ? createPortal(
              <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Ảnh rider ${riderName}`}>
                <button type="button" aria-label="Đóng ảnh lớn" className="absolute inset-0 cursor-zoom-out" onClick={() => setPreviewOpen(false)} />
                <div className="relative z-10 w-full max-w-xl">
                  <button
                    type="button"
                    aria-label="Đóng"
                    className="absolute -right-2 -top-12 grid size-10 place-items-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 sm:right-0"
                    onClick={() => setPreviewOpen(false)}
                  >
                    <X size={22} />
                  </button>
                  <div className="overflow-hidden rounded-3xl bg-white p-2 shadow-2xl">
                    <div className="aspect-square w-full rounded-[1.15rem] bg-slate-100 bg-cover bg-center" style={{ backgroundImage: `url("${rider.avatar_url}")` }} role="img" aria-label={`Avatar ${riderName}`} />
                  </div>
                  <div className="mt-4 text-center text-white">
                    <p className="text-lg font-bold">{riderName}</p>
                    <p className="mt-0.5 font-mono text-sm text-white/65">ID {rider.rider_code}</p>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}
      </>
    );
  }

  return (
    <span className={`${dimension} flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200`}>
      <UserRound size={iconSize} />
    </span>
  );
}

function SummaryChip({ label, value, tone }: { label: string; value: string; tone: "blue" | "amber" | "slate" }) {
  const classes = {
    blue: "bg-blue-50 text-blue-800",
    amber: "bg-amber-50 text-amber-800",
    slate: "bg-slate-100 text-slate-800",
  };

  return (
    <div className={`rounded-lg p-3 ${classes[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold" title={value}>{value}</p>
    </div>
  );
}

function RouteStep({ icon, label, title, subtitle, tone }: { icon: React.ReactNode; label: string; title: string | null; subtitle?: string | null; tone: "slate" | "blue" | "emerald" }) {
  const iconClasses = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div className="relative flex gap-3 rounded-lg border border-slate-100 bg-white p-3">
      <span className={`z-[1] flex size-10 shrink-0 items-center justify-center rounded-full ${iconClasses[tone]}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 font-semibold text-slate-900">{title ?? "Chưa xác định"}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function uniqueOptions(values: Array<string | null>) {
  return mergeOptions([], values);
}

function canonicalKv(value: string | null) {
  const match = normalizeLocation(value).match(/^(?:kv|khu vuc)?\s*([56])$/);
  return match ? `KV${match[1]}` : value?.trim().toUpperCase() ?? "";
}

function mergeOptions(primary: Array<string | null | undefined>, extra: Array<string | null | undefined>) {
  const options = new Map<string, string>();
  for (const value of [...primary, ...extra]) {
    const clean = value?.trim();
    if (!clean) continue;
    options.set(normalizeLocation(clean), clean);
  }
  return Array.from(options.values()).sort((a, b) => a.localeCompare(b, "vi"));
}

function districtShortLabel(value: string, districts: DistrictDefinition[]) {
  return districts.find((district) => district.name === value)?.shortName ?? value;
}

function districtDisplayName(value: string | null | undefined, districts: DistrictDefinition[] = hcmDistricts) {
  return districtDefinitionFor(value, districts)?.shortName ?? value?.trim() ?? "";
}

function wardShortLabel(value: string) {
  return value.replace(/^Phường\s+/i, "P.");
}

function joinLocation(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" / ");
}
