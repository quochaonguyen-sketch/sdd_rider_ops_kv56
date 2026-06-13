"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Home,
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
  const [riders, setRiders] = useState<Rider[]>([]);
  const [query, setQuery] = useState("");
  const [kv, setKv] = useState("all");
  const [cot, setCot] = useState("all");
  const [pickupDistrict, setPickupDistrict] = useState("all");
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
      setSelected((current) => nextRiders.find((rider) => rider.id === current?.id) ?? current);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

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

  const kvOptions = useMemo(() => uniqueOptions(riders.map((rider) => rider.kv)), [riders]);
  const cotOptions = useMemo(() => uniqueOptions(riders.map((rider) => rider.cot)), [riders]);
  const pickupDistrictOptions = useMemo(
    () => uniqueOptions(riders.map((rider) => rider.pickup_district)),
    [riders],
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
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
        ].some((value) => value?.toLowerCase().includes(normalized));
      const matchesKv = kv === "all" || rider.kv === kv;
      const matchesCot = cot === "all" || rider.cot === cot;
      const matchesPickupDistrict = pickupDistrict === "all" || rider.pickup_district === pickupDistrict;
      const matchesStatus = status === "all" || rider.status === status;
      return matchesQuery && matchesKv && matchesCot && matchesPickupDistrict && matchesStatus;
    });
  }, [cot, kv, pickupDistrict, query, riders, status]);

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
      setError(result?.error ?? "Unable to create rider");
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
      home_district: rider.home_district ?? "",
      cot: rider.cot ?? "",
      rider_code: rider.rider_code,
      full_name: rider.full_name ?? "",
      pickup_district: rider.pickup_district ?? "",
      pickup_ward: rider.pickup_ward ?? "",
      point_name: rider.point_name ?? "",
      delivery_district: rider.delivery_district ?? "",
      delivery_ward: rider.delivery_ward ?? "",
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

  function updateRiderInView(updated: Rider) {
    setRiders((current) => current.map((rider) => (rider.id === updated.id ? updated : rider)));
    setSelected(updated);
    setSuccess("Đã cập nhật avatar rider.");
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Riders</h1>
          <p className="mt-0.5 text-sm text-slate-500">Quản lý khu vực pick và giao của rider.</p>
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
          <Button
            type="button"
            variant="secondary"
            className="px-2 sm:px-4"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} />
            <span className="hidden sm:inline">{importing ? "Đang import..." : "Import Excel"}</span>
            <span className="sm:hidden">{importing ? "Import..." : "Excel"}</span>
          </Button>
          <Button type="button" className="px-2 sm:px-4" onClick={beginAdd}>
            <Plus size={16} />
            Thêm
          </Button>
          <Button type="button" variant="secondary" className="px-2 sm:px-4" onClick={refresh} disabled={loading}>
            <RefreshCcw size={16} />
            <span className="hidden sm:inline">Refresh</span>
            <span className="sm:hidden">Tải lại</span>
          </Button>
        </div>
      </div>

      {showAddForm ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Close rider form"
            className="absolute inset-0 cursor-default"
            onClick={closeForm}
          />
          <Card
            className={`relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-b-none shadow-2xl sm:mx-auto sm:max-w-6xl sm:rounded-xl ${
              editingId ? "border-blue-200 bg-blue-50" : ""
            }`}
          >
          <form onSubmit={saveRider} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  {editingId ? "Chỉnh sửa rider" : "Thêm rider"}
                </h2>
                <p className="text-sm text-slate-500">
                  {editingId ? `Đang sửa ${form.full_name || form.rider_code}` : "Nhập thông tin vận hành của rider."}
                </p>
              </div>
              {editingId ? <Badge tone="blue">EDIT MODE</Badge> : null}
              <Button type="button" variant="ghost" className="size-10 shrink-0 p-0" onClick={closeForm}>
                <X size={18} />
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Field label="KV" value={form.kv} onChange={(value) => updateForm("kv", value)} />
              <Field label="Quận ở" value={form.home_district} onChange={(value) => updateForm("home_district", value)} />
              <Field label="COT" value={form.cot} onChange={(value) => updateForm("cot", value)} />
              <Field label="ID" value={form.rider_code} onChange={(value) => updateForm("rider_code", value)} required />
              <Field label="Fullname" value={form.full_name} onChange={(value) => updateForm("full_name", value)} required />
              <Field label="Quận lấy" value={form.pickup_district} onChange={(value) => updateForm("pickup_district", value)} />
              <Field label="Phường lấy" value={form.pickup_ward} onChange={(value) => updateForm("pickup_ward", value)} />
              <Field label="Point_name" value={form.point_name} onChange={(value) => updateForm("point_name", value)} />
              <Field label="Quận giao" value={form.delivery_district} onChange={(value) => updateForm("delivery_district", value)} />
              <Field label="Phường giao" value={form.delivery_ward} onChange={(value) => updateForm("delivery_ward", value)} />
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase text-slate-500">Status</span>
                <Select
                  value={form.status}
                  onChange={(event) => updateForm("status", event.target.value as "active" | "inactive")}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </Select>
              </label>
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

      <Card className="grid gap-3 p-3 sm:p-4 md:grid-cols-2 xl:grid-cols-[1fr_150px_150px_170px_150px]">
        <label className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} />
          <Input
            className="pl-10"
            placeholder="Search ID, fullname, point, district, ward"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Select value={kv} onChange={(event) => setKv(event.target.value)}>
          <option value="all">All KV</option>
          {kvOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Select value={cot} onChange={(event) => setCot(event.target.value)}>
          <option value="all">All COT</option>
          {cotOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Select value={pickupDistrict} onChange={(event) => setPickupDistrict(event.target.value)}>
          <option value="all">All quận lấy</option>
          {pickupDistrictOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Card>

      {success ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}
      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {importIssues.length > 0 ? (
        <Card className="border-red-200 bg-red-50">
          <h2 className="font-semibold text-red-800">Không import vì có {importIssues.length} lỗi</h2>
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
                {importIssues.map((issue, index) => (
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
      ) : null}

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
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Rider</th>
                  <th className="px-4 py-3">Khu vực / COT</th>
                  <th className="px-4 py-3">Pick</th>
                  <th className="px-4 py-3">Giao</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rider) => (
                  <tr
                    key={rider.id}
                    className={`cursor-pointer border-b border-slate-100 transition hover:bg-slate-50 ${
                      selected?.id === rider.id ? "bg-blue-50/60" : ""
                    }`}
                    onClick={() => setSelected(rider)}
                  >
                    <td className="min-w-48 px-4 py-4">
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
                        Ở: {rider.home_district ?? "Chưa xác định"}
                      </p>
                    </td>
                    <td className="min-w-52 px-4 py-4">
                      <RouteCell
                        tone="pickup"
                        district={rider.pickup_district}
                        ward={rider.pickup_ward}
                        detail={rider.point_name}
                      />
                    </td>
                    <td className="min-w-44 px-4 py-4">
                      <RouteCell
                        tone="delivery"
                        district={rider.delivery_district}
                        ward={rider.delivery_ward}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={rider.status === "active" ? "green" : "red"}>
                        {rider.status ?? "active"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 px-3"
                        onClick={(event) => {
                          event.stopPropagation();
                          beginEdit(rider);
                        }}
                      >
                        <Pencil size={15} />
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && !loading ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={6}>
                      No riders match the current filters.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="hidden h-fit md:block xl:sticky xl:top-20">
          {selected ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <RiderAvatar rider={selected} size="lg" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold text-slate-950">
                        {selected.full_name ?? selected.rider_code}
                      </h2>
                      <Badge tone={selected.status === "active" ? "green" : "red"}>
                        {selected.status ?? "active"}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-sm text-slate-500">ID {selected.rider_code}</p>
                  </div>
                </div>
                <Button type="button" variant="secondary" className="h-9 px-3" onClick={() => beginEdit(selected)}>
                  <Pencil size={15} />
                  Edit
                </Button>
              </div>

              <RiderAvatarEditor rider={selected} onUpdated={updateRiderInView} />

              <div className="grid grid-cols-3 gap-2">
                <SummaryChip label="KV" value={selected.kv ?? "-"} tone="blue" />
                <SummaryChip label="COT" value={selected.cot ?? "-"} tone="amber" />
                <SummaryChip label="Quận ở" value={selected.home_district ?? "-"} tone="slate" />
              </div>

              <div className="relative space-y-3 before:absolute before:bottom-8 before:left-[19px] before:top-8 before:w-px before:bg-slate-200">
                <RouteStep
                  icon={<Home size={17} />}
                  label="Khu vực rider ở"
                  title={selected.home_district}
                  tone="slate"
                />
                <RouteStep
                  icon={<MapPin size={17} />}
                  label="Đang pick"
                  title={selected.pickup_district}
                  subtitle={joinLocation(selected.pickup_ward, selected.point_name)}
                  tone="blue"
                />
                <RouteStep
                  icon={<Navigation size={17} />}
                  label="Đang giao"
                  title={selected.delivery_district}
                  subtitle={selected.delivery_ward}
                  tone="emerald"
                />
              </div>

              <details className="rounded-md border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Raw data</summary>
                <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
                  {JSON.stringify(selected.raw_data ?? {}, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold text-slate-950">Rider detail</h2>
              <p className="mt-4 rounded-md border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                Chọn một rider để xem nhanh khu vực hoạt động, điểm pick và khu vực giao.
              </p>
            </>
          )}
        </Card>
      </div>

      {selected && showMobileDetail ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close rider detail"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setShowMobileDetail(false)}
          />
          <Card className="absolute inset-x-0 bottom-0 z-10 max-h-[90vh] overflow-y-auto rounded-b-none rounded-t-3xl border-0 p-4 pb-8 shadow-2xl">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <RiderAvatar rider={selected} size="lg" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-bold text-slate-950">
                      {selected.full_name ?? selected.rider_code}
                    </h2>
                    <Badge tone={selected.status === "active" ? "green" : "red"}>
                      {selected.status ?? "active"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-sm text-slate-500">ID {selected.rider_code}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="size-10 shrink-0 p-0"
                onClick={() => setShowMobileDetail(false)}
              >
                <X size={20} />
              </Button>
            </div>

            <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="font-semibold text-blue-950">Cập nhật avatar rider</p>
              <p className="mt-1 text-xs text-blue-700">Chọn ảnh hoặc quét trực tiếp bằng camera điện thoại.</p>
              <div className="mt-3">
                <RiderAvatarEditor rider={selected} onUpdated={updateRiderInView} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <SummaryChip label="KV" value={selected.kv ?? "-"} tone="blue" />
              <SummaryChip label="COT" value={selected.cot ?? "-"} tone="amber" />
              <SummaryChip label="Quận ở" value={selected.home_district ?? "-"} tone="slate" />
            </div>

            <div className="relative mt-4 space-y-3 before:absolute before:bottom-8 before:left-[19px] before:top-8 before:w-px before:bg-slate-200">
              <RouteStep
                icon={<MapPin size={17} />}
                label="Đang pick"
                title={selected.pickup_district}
                subtitle={joinLocation(selected.pickup_ward, selected.point_name)}
                tone="blue"
              />
              <RouteStep
                icon={<Navigation size={17} />}
                label="Đang giao"
                title={selected.delivery_district}
                subtitle={selected.delivery_ward}
                tone="emerald"
              />
            </div>

            <Button type="button" className="mt-4 w-full" onClick={() => beginEdit(selected)}>
              <Pencil size={16} />
              Chỉnh sửa thông tin rider
            </Button>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function MobileRiderCard({
  rider,
  selected,
  onSelect,
  onEdit,
}: {
  rider: Rider;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
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
              <Badge tone={rider.status === "active" ? "green" : "red"}>{rider.status ?? "active"}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone="blue">{rider.kv ?? "Chưa có KV"}</Badge>
              <Badge tone="amber">{rider.cot ?? "Chưa có COT"}</Badge>
              <Badge>{rider.home_district ?? "Chưa có quận ở"}</Badge>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          <RouteCell
            tone="pickup"
            district={rider.pickup_district}
            ward={rider.pickup_ward}
            detail={rider.point_name}
          />
          <RouteCell tone="delivery" district={rider.delivery_district} ward={rider.delivery_ward} />
        </div>
      </button>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" className="px-2" onClick={onSelect}>
          <UserRound size={16} />
          Avatar
        </Button>
        <Button type="button" variant="secondary" className="px-2" onClick={onEdit}>
          <Pencil size={16} />
          Chỉnh sửa
        </Button>
      </div>
    </Card>
  );
}

function uniqueOptions(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function RiderAvatar({ rider, size }: { rider: Rider; size: "sm" | "lg" }) {
  const dimension = size === "lg" ? "size-16" : "size-11";
  const iconSize = size === "lg" ? 26 : 18;

  if (rider.avatar_url) {
    return (
      <span
        role="img"
        aria-label={`Avatar ${rider.full_name ?? rider.rider_code}`}
        className={`${dimension} shrink-0 rounded-full border-2 border-white bg-cover bg-center shadow-sm ring-1 ring-slate-200`}
        style={{ backgroundImage: `url("${rider.avatar_url}")` }}
      />
    );
  }

  return (
    <span className={`${dimension} flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 ring-1 ring-slate-200`}>
      <UserRound size={iconSize} />
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      <Input required={required} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function RouteCell({
  tone,
  district,
  ward,
  detail,
}: {
  tone: "pickup" | "delivery";
  district: string | null;
  ward: string | null;
  detail?: string | null;
}) {
  const Icon = tone === "pickup" ? MapPin : Navigation;
  return (
    <div
      className={
        tone === "pickup"
          ? "rounded-lg border border-blue-100 bg-blue-50 p-2.5"
          : "rounded-lg border border-emerald-100 bg-emerald-50 p-2.5"
      }
    >
      <p className={tone === "pickup" ? "flex items-center gap-1.5 font-semibold text-blue-800" : "flex items-center gap-1.5 font-semibold text-emerald-800"}>
        <Icon size={15} />
        {district ?? "Chưa xác định"}
      </p>
      <p className={tone === "pickup" ? "mt-1 text-xs text-blue-700" : "mt-1 text-xs text-emerald-700"}>
        {joinLocation(ward, detail) || "Chưa có phường/point"}
      </p>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "amber" | "slate";
}) {
  const classes = {
    blue: "bg-blue-50 text-blue-800",
    amber: "bg-amber-50 text-amber-800",
    slate: "bg-slate-100 text-slate-800",
  };

  return (
    <div className={`rounded-lg p-3 ${classes[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold" title={value}>
        {value}
      </p>
    </div>
  );
}

function RouteStep({
  icon,
  label,
  title,
  subtitle,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  title: string | null;
  subtitle?: string | null;
  tone: "slate" | "blue" | "emerald";
}) {
  const iconClasses = {
    slate: "bg-slate-100 text-slate-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div className="relative flex gap-3 rounded-lg border border-slate-100 bg-white p-3">
      <span className={`z-[1] flex size-10 shrink-0 items-center justify-center rounded-full ${iconClasses[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 font-semibold text-slate-900">{title ?? "Chưa xác định"}</p>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function joinLocation(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" / ");
}
