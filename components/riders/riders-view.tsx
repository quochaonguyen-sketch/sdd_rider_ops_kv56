"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bike,
  CheckCircle2,
  Home,
  ListFilter,
  MapPin,
  Navigation,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseRealtime } from "@/hooks/use-supabase-realtime";
import type { Rider } from "@/types";
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

export function RidersView() {
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
  const [selected, setSelected] = useState<Rider | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RiderFormState>(emptyRiderForm);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
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
    if (!showAddForm && !showMobileDetail) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [showAddForm, showMobileDetail]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  useSupabaseRealtime({ table: "riders", onChange: refresh });

  const districtOptions = useMemo(() => districts.map((district) => district.name), [districts]);
  const kvOptions = useMemo(() => uniqueOptions(riders.map((rider) => rider.kv)), [riders]);
  const cotOptions = useMemo(() => uniqueOptions(riders.map((rider) => rider.cot)), [riders]);
  const pickupWardOptions = useMemo(
    () => (pickupDistrict === "all" ? [] : wardNamesForDistrict(pickupDistrict, districts)),
    [districts, pickupDistrict],
  );
  const deliveryWardOptions = useMemo(
    () => (deliveryDistrict === "all" ? [] : wardNamesForDistrict(deliveryDistrict, districts)),
    [deliveryDistrict, districts],
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
        ].some((value) => normalizeLocation(value).includes(normalized));
      const matchesKv = kv === "all" || rider.kv === kv;
      const matchesCot = cot === "all" || rider.cot === cot;
      const matchesPickupDistrict = pickupDistrict === "all" || districtMatches(rider.pickup_district, pickupDistrict, districts);
      const matchesPickupWard =
        pickupWard === "all" || wardMatches(rider.pickup_district, rider.pickup_ward, pickupWard, districts);
      const matchesDeliveryDistrict =
        deliveryDistrict === "all" || districtMatches(rider.delivery_district, deliveryDistrict, districts);
      const matchesDeliveryWard =
        deliveryWard === "all" || wardMatches(rider.delivery_district, rider.delivery_ward, deliveryWard, districts);
      const matchesStatus = status === "all" || rider.status === status;
      return matchesQuery && matchesKv && matchesCot && matchesPickupDistrict && matchesPickupWard && matchesDeliveryDistrict && matchesDeliveryWard && matchesStatus;
    });
  }, [cot, deliveryDistrict, deliveryWard, districts, kv, pickupDistrict, pickupWard, query, riders, status]);

  const stats = useMemo(() => {
    const active = riders.filter((rider) => rider.status !== "inactive").length;
    const missingPickup = riders.filter((rider) => !rider.pickup_district || !rider.pickup_ward).length;
    const activeDistricts = new Set(riders.map((rider) => canonicalDistrictName(rider.pickup_district, districts)).filter(Boolean));
    return {
      total: riders.length,
      active,
      inactive: riders.length - active,
      missingPickup,
      activeDistricts: activeDistricts.size,
    };
  }, [districts, riders]);

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
    setShowMobileDetail(false);
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
    setShowMobileDetail(false);
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
  }

  function updateRiderInView(updated: Rider) {
    setRiders((current) => current.map((rider) => (rider.id === updated.id ? updated : rider)));
    setSelected(updated);
    setSuccess("Đã cập nhật avatar rider.");
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-slate-950 text-white">
              <Bike size={21} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Riders</h1>
              <p className="mt-0.5 text-sm text-slate-500">Tìm rider theo ID, COT, quận/phường lấy và giao.</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
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
          <Button type="button" variant="secondary" className="px-2 sm:px-4" disabled={importing} onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            <span className="hidden sm:inline">{importing ? "Đang import..." : "Import Excel"}</span>
            <span className="sm:hidden">Excel</span>
          </Button>
          <Button type="button" className="px-2 sm:px-4" onClick={beginAdd}>
            <Plus size={16} />
            Thêm
          </Button>
          <Button type="button" variant="secondary" className="px-2 sm:px-4" onClick={refresh} disabled={loading}>
            <RefreshCcw size={16} />
            <span className="hidden sm:inline">Tải lại</span>
            <span className="sm:hidden">Lại</span>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<UserRound size={18} />} label="Tổng rider" value={stats.total} helper={`${filtered.length} đang hiển thị`} tone="slate" />
        <StatCard icon={<CheckCircle2 size={18} />} label="Đang hoạt động" value={stats.active} helper={`${stats.inactive} inactive`} tone="emerald" />
        <StatCard icon={<MapPin size={18} />} label="Quận đang pick" value={stats.activeDistricts} helper="Theo dữ liệu quận lấy" tone="blue" />
        <StatCard icon={<ListFilter size={18} />} label="Thiếu địa bàn" value={stats.missingPickup} helper="Chưa có quận hoặc phường lấy" tone="amber" />
      </div>

      {showAddForm ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <button type="button" aria-label="Đóng form rider" className="absolute inset-0 cursor-default" onClick={closeForm} />
          <Card className={cn("relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-b-none shadow-2xl sm:mx-auto sm:max-w-6xl sm:rounded-xl", editingId && "border-blue-200 bg-blue-50")}>
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

      <Card className="p-3 sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row">
          <label className="relative xl:min-w-[320px] xl:flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} />
            <Input className="pl-10" placeholder="Tìm ID, tên, COT, point, quận/phường..." value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="grid flex-[2] gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Select value={kv} onChange={(event) => setKv(event.target.value)} aria-label="Lọc KV">
              <option value="all">Tất cả KV</option>
              {kvOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </Select>
            <Select value={cot} onChange={(event) => setCot(event.target.value)} aria-label="Lọc COT">
              <option value="all">Tất cả COT</option>
              {cotOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </Select>
            <Select value={pickupDistrict} onChange={(event) => { setPickupDistrict(event.target.value); setPickupWard("all"); }} aria-label="Lọc quận lấy">
              <option value="all">Quận lấy</option>
              {districtOptions.map((option) => (
                <option key={option} value={option}>{districtShortLabel(option, districts)}</option>
              ))}
            </Select>
            <Select value={pickupWard} onChange={(event) => setPickupWard(event.target.value)} disabled={pickupDistrict === "all"} aria-label="Lọc phường lấy">
              <option value="all">Phường lấy</option>
              {pickupWardOptions.map((option) => (
                <option key={option} value={option}>{wardShortLabel(option)}</option>
              ))}
            </Select>
            <Select value={deliveryDistrict} onChange={(event) => { setDeliveryDistrict(event.target.value); setDeliveryWard("all"); }} aria-label="Lọc quận giao">
              <option value="all">Quận giao</option>
              {districtOptions.map((option) => (
                <option key={option} value={option}>{districtShortLabel(option, districts)}</option>
              ))}
            </Select>
            <Select value={deliveryWard} onChange={(event) => setDeliveryWard(event.target.value)} disabled={deliveryDistrict === "all"} aria-label="Lọc phường giao">
              <option value="all">Phường giao</option>
              {deliveryWardOptions.map((option) => (
                <option key={option} value={option}>{wardShortLabel(option)}</option>
              ))}
            </Select>
            <Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Lọc trạng thái">
              <option value="all">Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <Button type="button" variant="ghost" className="shrink-0" onClick={resetFilters}>
            <X size={16} />
            Xóa lọc
          </Button>
        </div>
      </Card>

      {success ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {importIssues.length > 0 ? <ImportIssues issues={importIssues} /> : null}

      <div className="grid gap-4 xl:grid-cols-[1.55fr_0.85fr]">
        <div className="space-y-3 md:hidden">
          {filtered.map((rider) => (
            <MobileRiderCard
              key={rider.id}
              rider={rider}
              selected={selected?.id === rider.id}
              onSelect={() => {
                setSelected(rider);
                setShowMobileDetail(true);
              }}
              onEdit={() => beginEdit(rider)}
            />
          ))}
          {filtered.length === 0 && !loading ? (
            <Card>
              <p className="py-6 text-center text-sm text-slate-500">Không tìm thấy rider phù hợp.</p>
            </Card>
          ) : null}
        </div>

        <Card className="hidden overflow-hidden p-0 md:block">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">Danh sách rider</h2>
                <p className="text-xs text-slate-500">Sắp xếp mới cập nhật trước, bấm một dòng để xem chi tiết.</p>
              </div>
              <Badge tone="neutral">{filtered.length} rider</Badge>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Rider</th>
                  <th className="px-4 py-3">Nhóm</th>
                  <th className="px-4 py-3">Khu vực lấy</th>
                  <th className="px-4 py-3">Khu vực giao</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Sửa</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rider) => (
                  <tr key={rider.id} className={cn("cursor-pointer border-b border-slate-100 transition hover:bg-slate-50", selected?.id === rider.id && "bg-blue-50/70")} onClick={() => setSelected(rider)}>
                    <td className="min-w-56 px-4 py-4">
                      <div className="flex items-center gap-3">
                        <RiderAvatar rider={rider} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-950">{rider.full_name ?? "Chưa có tên"}</p>
                          <p className="mt-1 font-mono text-xs text-slate-500">ID {rider.rider_code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="min-w-44 px-4 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone="blue">{rider.kv ?? "Chưa có KV"}</Badge>
                        <Badge tone="amber">{rider.cot ?? "Chưa có COT"}</Badge>
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                        <Home size={13} />
                        {rider.home_district ?? "Chưa có quận ở"}
                      </p>
                    </td>
                    <td className="min-w-56 px-4 py-4">
                      <RouteCell tone="pickup" district={rider.pickup_district} ward={rider.pickup_ward} detail={rider.point_name} />
                    </td>
                    <td className="min-w-52 px-4 py-4">
                      <RouteCell tone="delivery" district={rider.delivery_district} ward={rider.delivery_ward} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={rider.status === "inactive" ? "red" : "green"}>{rider.status ?? "active"}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button type="button" variant="ghost" className="h-9 px-3" onClick={(event) => { event.stopPropagation(); beginEdit(rider); }}>
                        <Pencil size={15} />
                        Sửa
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                      Không có rider nào khớp bộ lọc hiện tại.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <RiderDetailPanel selected={selected} onEdit={beginEdit} onUpdated={updateRiderInView} />
      </div>

      {selected && showMobileDetail ? (
        <MobileDetail selected={selected} onClose={() => setShowMobileDetail(false)} onEdit={beginEdit} onUpdated={updateRiderInView} />
      ) : null}
    </div>
  );
}

function StatCard({ icon, label, value, helper, tone }: { icon: React.ReactNode; label: string; value: number; helper: string; tone: "slate" | "emerald" | "blue" | "amber" }) {
  const classes = {
    slate: "bg-slate-100 text-slate-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <span className={cn("grid size-10 place-items-center rounded-lg", classes[tone])}>{icon}</span>
        <strong className="text-2xl text-slate-950">{value}</strong>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-800">{label}</p>
      <p className="mt-0.5 text-xs text-slate-500">{helper}</p>
    </Card>
  );
}

function RiderDetailPanel({ selected, onEdit, onUpdated }: { selected: Rider | null; onEdit: (rider: Rider) => void; onUpdated: (rider: Rider) => void }) {
  return (
    <Card className="hidden h-fit md:block xl:sticky xl:top-20">
      {selected ? (
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <RiderAvatar rider={selected} size="lg" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-semibold text-slate-950">{selected.full_name ?? selected.rider_code}</h2>
                  <Badge tone={selected.status === "inactive" ? "red" : "green"}>{selected.status ?? "active"}</Badge>
                </div>
                <p className="mt-1 font-mono text-sm text-slate-500">ID {selected.rider_code}</p>
              </div>
            </div>
            <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => onEdit(selected)}>
              <Pencil size={15} />
              Sửa
            </Button>
          </div>

          <RiderAvatarEditor rider={selected} onUpdated={onUpdated} />

          <div className="grid grid-cols-3 gap-2">
            <SummaryChip label="KV" value={selected.kv ?? "-"} tone="blue" />
            <SummaryChip label="COT" value={selected.cot ?? "-"} tone="amber" />
            <SummaryChip label="Quận ở" value={selected.home_district ?? "-"} tone="slate" />
          </div>

          <div className="relative space-y-3 before:absolute before:bottom-8 before:left-[19px] before:top-8 before:w-px before:bg-slate-200">
            <RouteStep icon={<Home size={17} />} label="Nơi ở" title={selected.home_district} tone="slate" />
            <RouteStep icon={<MapPin size={17} />} label="Khu vực lấy" title={selected.pickup_district} subtitle={joinLocation(selected.pickup_ward, selected.point_name)} tone="blue" />
            <RouteStep icon={<Navigation size={17} />} label="Khu vực giao" title={selected.delivery_district} subtitle={selected.delivery_ward} tone="emerald" />
          </div>
        </div>
      ) : (
        <>
          <h2 className="text-base font-semibold text-slate-950">Chi tiết rider</h2>
          <p className="mt-4 rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">Chọn một rider để xem nhanh khu vực ở, lấy và giao.</p>
        </>
      )}
    </Card>
  );
}

function MobileDetail({ selected, onClose, onEdit, onUpdated }: { selected: Rider; onClose: () => void; onEdit: (rider: Rider) => void; onUpdated: (rider: Rider) => void }) {
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <button type="button" aria-label="Đóng chi tiết rider" className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <Card className="absolute inset-x-0 bottom-0 z-10 max-h-[90vh] overflow-y-auto rounded-b-none rounded-t-3xl border-0 p-4 pb-8 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <RiderAvatar rider={selected} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold text-slate-950">{selected.full_name ?? selected.rider_code}</h2>
                <Badge tone={selected.status === "inactive" ? "red" : "green"}>{selected.status ?? "active"}</Badge>
              </div>
              <p className="mt-1 font-mono text-sm text-slate-500">ID {selected.rider_code}</p>
            </div>
          </div>
          <Button type="button" variant="ghost" className="size-10 shrink-0 p-0" onClick={onClose}>
            <X size={20} />
          </Button>
        </div>

        <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <p className="font-semibold text-blue-950">Cập nhật avatar rider</p>
          <div className="mt-3">
            <RiderAvatarEditor rider={selected} onUpdated={onUpdated} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <SummaryChip label="KV" value={selected.kv ?? "-"} tone="blue" />
          <SummaryChip label="COT" value={selected.cot ?? "-"} tone="amber" />
          <SummaryChip label="Quận ở" value={selected.home_district ?? "-"} tone="slate" />
        </div>

        <div className="relative mt-4 space-y-3 before:absolute before:bottom-8 before:left-[19px] before:top-8 before:w-px before:bg-slate-200">
          <RouteStep icon={<MapPin size={17} />} label="Khu vực lấy" title={selected.pickup_district} subtitle={joinLocation(selected.pickup_ward, selected.point_name)} tone="blue" />
          <RouteStep icon={<Navigation size={17} />} label="Khu vực giao" title={selected.delivery_district} subtitle={selected.delivery_ward} tone="emerald" />
        </div>

        <Button type="button" className="mt-4 w-full" onClick={() => onEdit(selected)}>
          <Pencil size={16} />
          Chỉnh sửa thông tin rider
        </Button>
      </Card>
    </div>
  );
}

function MobileRiderCard({ rider, selected, onSelect, onEdit }: { rider: Rider; selected: boolean; onSelect: () => void; onEdit: () => void }) {
  return (
    <Card className={selected ? "border-blue-300 ring-2 ring-blue-100" : ""}>
      <button type="button" className="w-full text-left" onClick={onSelect}>
        <div className="flex items-start gap-3">
          <RiderAvatar rider={rider} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-950">{rider.full_name ?? "Chưa có tên"}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">ID {rider.rider_code}</p>
              </div>
              <Badge tone={rider.status === "inactive" ? "red" : "green"}>{rider.status ?? "active"}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="blue">{rider.kv ?? "Chưa có KV"}</Badge>
              <Badge tone="amber">{rider.cot ?? "Chưa có COT"}</Badge>
              <Badge>{rider.home_district ?? "Chưa có quận ở"}</Badge>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <RouteCell tone="pickup" district={rider.pickup_district} ward={rider.pickup_ward} detail={rider.point_name} />
          <RouteCell tone="delivery" district={rider.delivery_district} ward={rider.delivery_ward} />
        </div>
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" className="px-2" onClick={onSelect}>
          <UserRound size={16} />
          Chi tiết
        </Button>
        <Button type="button" variant="secondary" className="px-2" onClick={onEdit}>
          <Pencil size={16} />
          Sửa
        </Button>
      </div>
    </Card>
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
  const dimension = size === "lg" ? "size-16" : "size-11";
  const iconSize = size === "lg" ? 26 : 18;

  if (rider.avatar_url) {
    return <span role="img" aria-label={`Avatar ${rider.full_name ?? rider.rider_code}`} className={`${dimension} shrink-0 rounded-full border-2 border-white bg-cover bg-center shadow-sm ring-1 ring-slate-200`} style={{ backgroundImage: `url("${rider.avatar_url}")` }} />;
  }

  return (
    <span className={`${dimension} flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200`}>
      <UserRound size={iconSize} />
    </span>
  );
}

function RouteCell({ tone, district, ward, detail }: { tone: "pickup" | "delivery"; district: string | null; ward: string | null; detail?: string | null }) {
  const Icon = tone === "pickup" ? MapPin : Navigation;
  const classes = tone === "pickup" ? "border-blue-100 bg-blue-50 text-blue-800" : "border-emerald-100 bg-emerald-50 text-emerald-800";
  const subClasses = tone === "pickup" ? "text-blue-700" : "text-emerald-700";
  return (
    <div className={cn("rounded-lg border p-2.5", classes)}>
      <p className="flex items-center gap-1.5 font-semibold">
        <Icon size={15} />
        {district ?? "Chưa xác định"}
      </p>
      <p className={cn("mt-1 text-xs", subClasses)}>{joinLocation(ward, detail) || "Chưa có phường/point"}</p>
    </div>
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

function wardShortLabel(value: string) {
  return value.replace(/^Phường\s+/i, "P.");
}

function joinLocation(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" / ");
}
