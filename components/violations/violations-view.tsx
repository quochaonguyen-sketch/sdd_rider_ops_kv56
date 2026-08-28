/* Hallmark · macrostructure: Bento Grid · theme: Cobalt adapted · genre: modern-minimal · enrichment: none
 * pre-emit critique: P5 H4 E5 S5 R5 V4 · contrast: pass (40–41) · tokens: pass (48) · mobile: pass (34, 49–57)
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, MapPin, Plus, RefreshCcw, Search, ShieldAlert, X } from "lucide-react";
import type { Rider, RiderViolationRecord } from "@/types";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/utils/cn";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";

type ApiResponse = { success: boolean; can_edit?: boolean; violations?: RiderViolationRecord[]; violation?: RiderViolationRecord; error?: string; result?: { attendanceUpdated: number; violationsCreated: number } };
const initialForm = { rider_id: "", work_date: today(), violation_type: "POLICY", severity: "MEDIUM", zone: "", note: "" };

export function ViolationsView() {
  const [violations, setViolations] = useState<RiderViolationRecord[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  useReportInitialDataLoading("violations", loading);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [response, riderResult] = await Promise.all([
      fetch("/api/violations", { cache: "no-store" }),
      createClient().from("riders").select("*").eq("status", "active").order("full_name"),
    ]);
    const result = (await response.json().catch(() => null)) as ApiResponse | null;
    if (!response.ok || !result?.success) setError(result?.error ?? "Không thể tải vi phạm");
    else {
      setViolations(result.violations ?? []);
      setCanEdit(Boolean(result.can_edit));
    }
    if (!riderResult.error) setRiders((riderResult.data ?? []) as Rider[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return violations.filter(
      (item) =>
        (!normalized || `${item.rider_name} ${item.rider_code} ${item.zone} ${item.note}`.toLowerCase().includes(normalized)) &&
        (status === "all" || item.status === status) &&
        (type === "all" || item.violation_type === type),
    );
  }, [query, status, type, violations]);

  const stats = useMemo(
    () => ({
      total: violations.length,
      open: violations.filter((item) => item.status === "OPEN").length,
      high: violations.filter((item) => item.severity === "HIGH" && item.status === "OPEN").length,
      resolved: violations.filter((item) => item.status === "RESOLVED").length,
    }),
    [violations],
  );

  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of violations.filter((v) => v.status === "OPEN")) map.set(v.violation_type, (map.get(v.violation_type) ?? 0) + 1);
    return Array.from(map, ([key, count]) => ({ key, label: typeLabel(key as RiderViolationRecord["violation_type"]), count })).sort((a, b) => b.count - a.count);
  }, [violations]);

  async function addViolation(event: React.FormEvent) {
    event.preventDefault();
    const rider = riders.find((item) => item.id === form.rider_id);
    if (!rider) return;
    setSaving(true);
    const response = await fetch("/api/violations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, rider_id: rider.id, rider_code: rider.rider_code, rider_name: rider.full_name, zone: form.zone || rider.delivery_district }),
    });
    const result = (await response.json().catch(() => null)) as ApiResponse | null;
    setSaving(false);
    if (!response.ok || !result?.success) return setError(result?.error ?? "Không thể thêm vi phạm");
    setShowForm(false);
    setForm(initialForm);
    setSuccess("Đã thêm vi phạm.");
    await load();
  }

  async function toggleResolved(item: RiderViolationRecord) {
    const next = item.status === "OPEN" ? "RESOLVED" : "OPEN";
    const note = next === "RESOLVED" ? window.prompt("Ghi chú xử lý (không bắt buộc):", item.resolution_note ?? "") : null;
    if (next === "RESOLVED" && note === null) return;
    const response = await fetch("/api/violations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, status: next, resolution_note: note }),
    });
    const result = (await response.json().catch(() => null)) as ApiResponse | null;
    if (!response.ok || !result?.violation) return setError(result?.error ?? "Không thể cập nhật");
    setViolations((current) => current.map((value) => (value.id === item.id ? result.violation! : value)));
    setSuccess(next === "RESOLVED" ? "Đã đánh dấu xử lý." : "Đã mở lại vi phạm.");
  }

  async function reconcile() {
    setSaving(true);
    const response = await fetch("/api/violations/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ work_date: today() }),
    });
    const result = (await response.json().catch(() => null)) as ApiResponse | null;
    setSaving(false);
    if (!response.ok || !result?.success) return setError(result?.error ?? "Đối soát thất bại");
    setSuccess(`Đã cập nhật ${result.result?.attendanceUpdated ?? 0} lịch và tạo ${result.result?.violationsCreated ?? 0} vi phạm.`);
    await load();
  }

  return (
    <div className="dashboard-control mx-auto max-w-[1600px] space-y-6">
      {/* Command header — graphite, matches Control Ledger */}
      <header className="dashboard-command-header">
        <div className="min-w-0">
          <div className="dashboard-kicker">
            <span className="dashboard-live-dot" style={{ background: "var(--color-error)" }} />
            Safety & compliance · KV5 + KV6
          </div>
          <h1>Quản lý vi phạm rider</h1>
          <p>Theo dõi, thêm mới và xác nhận xử lý vi phạm vận hành — off đột xuất, off nhưng không off, không lên lấy hàng.</p>
        </div>
        <div className="dashboard-command-actions">
          <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCcw size={16} className={loading ? "animate-spin" : undefined} />
            <span>Tải lại</span>
          </Button>
          {canEdit ? (
            <>
              <Button type="button" variant="secondary" onClick={() => void reconcile()} disabled={saving}>
                Đối soát hôm nay
              </Button>
              <Button type="button" onClick={() => setShowForm(true)}>
                <Plus size={16} />
                Thêm vi phạm
              </Button>
            </>
          ) : null}
        </div>
      </header>

      <div className="dashboard-readout-strip">
        <ShieldAlert size={14} />
        <strong>{filtered.length}/{violations.length} vi phạm</strong>
        <span>KV5 + KV6</span>
        <span className="dashboard-readout-time">{stats.open} chưa xử lý · {stats.high} mức cao</span>
      </div>

      {error ? (
        <p role="alert" className="dashboard-error">
          {error}
        </p>
      ) : null}
      {success ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}

      {/* BENTO GRID — stats */}
      <section aria-labelledby="violation-bento" className="space-y-3">
        <div className="dashboard-section-heading">
          <span>01</span>
          <div>
            <h2 id="violation-bento">Tổng quan vi phạm</h2>
            <p>4 ô bento — kích thước phản ánh mức độ ưu tiên.</p>
          </div>
        </div>
        <div className="grid auto-rows-[minmax(112px,auto)] grid-cols-12 gap-3">
          <BentoStat
            className="col-span-12 md:col-span-6 lg:col-span-6"
            label="Tổng vi phạm"
            value={stats.total}
            helper="Toàn bộ hồ sơ"
            icon={ShieldAlert}
            tone="slate"
            featured
          />
          <BentoStat
            className="col-span-6 lg:col-span-3"
            label="Chưa xử lý"
            value={stats.open}
            helper={`${stats.high} mức cao`}
            icon={CircleAlert}
            tone={stats.open ? "red" : "slate"}
          />
          <BentoStat
            className="col-span-6 lg:col-span-3"
            label="Đã xử lý"
            value={stats.resolved}
            helper={`${stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0}% hoàn tất`}
            icon={CheckCircle2}
            tone={stats.resolved ? "green" : "slate"}
          />
          <div className="col-span-12 grid gap-3 md:grid-cols-3 lg:col-span-12">
            <div className="rounded-xl border border-slate-200 bg-white p-4 md:col-span-2">
              <h3 className="text-sm font-bold text-slate-900">Phân bổ theo loại (đang mở)</h3>
              <p className="mt-1 text-xs text-slate-500">{typeCounts.length ? `${typeCounts.length} loại vi phạm` : "Chưa có vi phạm đang mở"}</p>
              <div className="mt-4 space-y-3">
                {typeCounts.map((item) => {
                  const max = Math.max(1, ...typeCounts.map((t) => t.count));
                  return (
                    <div key={item.key} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{item.label}</span>
                      <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[var(--color-error)]" style={{ width: `${(item.count / max) * 100}%` }} />
                      </div>
                      <strong className="w-8 text-right font-mono text-sm text-slate-900">{item.count}</strong>
                    </div>
                  );
                })}
                {!typeCounts.length ? <p className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">Không có dữ liệu.</p> : null}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-bold text-slate-900">Mức độ ưu tiên</h3>
              <p className="mt-1 text-xs text-slate-500">Tập trung xử lý mức cao trước.</p>
              <div className="mt-4 space-y-2">
                {[
                  { k: "HIGH", label: "Cao", count: stats.high, cls: "bg-red-500" },
                  { k: "MEDIUM", label: "Vừa", count: stats.open - stats.high, cls: "bg-amber-500" },
                  { k: "RESOLVED", label: "Đã xử lý", count: stats.resolved, cls: "bg-emerald-500" },
                ].map((row) => (
                  <div key={row.k} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <span className={cn("size-2 rounded-full", row.cls)} />
                      {row.label}
                    </span>
                    <strong className="font-mono text-sm text-slate-900">{row.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="grid gap-3 border-b border-slate-200 p-4 md:grid-cols-[1fr_180px_220px]">
          <label className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <Input className="pl-9" placeholder="Tìm rider, mã, khu vực, ghi chú" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Mọi trạng thái</option>
            <option value="OPEN">Chưa xử lý</option>
            <option value="RESOLVED">Đã xử lý</option>
          </Select>
          <Select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="all">Mọi loại vi phạm</option>
            {violationOptions().map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 text-xs text-slate-500">
          <span className="font-semibold text-slate-600">Đang lọc:</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{status === "all" ? "Mọi trạng thái" : status === "OPEN" ? "Chưa xử lý" : "Đã xử lý"}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{type === "all" ? "Mọi loại" : typeLabel(type as RiderViolationRecord["violation_type"])}</span>
          <span className="ml-auto tabular-nums">
            {filtered.length}/{violations.length}
          </span>
        </div>
      </section>

      {/* Ledger */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-900">Sổ vi phạm</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-slate-600">{filtered.length} hồ sơ</span>
        </div>
        <div className="max-h-[680px] min-h-[400px] overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-600 shadow-[0_1px_0_#e2e8f0]">
              <tr>
                <th className="px-4 py-3 font-semibold">Rider</th>
                <th className="px-4 py-3 font-semibold">Ngày</th>
                <th className="px-4 py-3 font-semibold">Loại</th>
                <th className="px-4 py-3 font-semibold">Mức độ</th>
                <th className="px-4 py-3 font-semibold">Khu vực</th>
                <th className="px-4 py-3 font-semibold">Ghi chú</th>
                <th className="px-4 py-3 font-semibold">Trạng thái</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={i} className="h-[56px] animate-pulse">
                      <td colSpan={8} className="px-4">
                        <div className="h-3 rounded bg-slate-100" />
                      </td>
                    </tr>
                  ))
                : filtered.map((item) => (
                    <tr key={item.id} className="group hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{item.rider_name ?? item.rider_code}</p>
                        <p className="font-mono text-xs text-slate-500">{item.rider_code}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{formatDate(item.work_date)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{typeLabel(item.violation_type)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <Severity value={item.severity} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-slate-700">
                          <MapPin size={12} className="text-slate-400" />
                          {item.zone ?? "—"}
                        </span>
                      </td>
                      <td className="max-w-72 px-4 py-3">
                        <p className="line-clamp-2 text-slate-600" title={item.note ?? ""}>
                          {item.note ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Status value={item.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canEdit ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                            onClick={() => void toggleResolved(item)}
                          >
                            {item.status === "OPEN" ? "Đánh dấu xử lý" : "Mở lại"}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="h-72 text-center">
                    <div className="mx-auto max-w-sm rounded-lg border border-dashed border-slate-200 p-6">
                      <p className="font-semibold text-slate-700">Không có vi phạm phù hợp.</p>
                      <p className="mt-1 text-sm text-slate-500">Thử đổi bộ lọc hoặc thêm vi phạm mới.</p>
                    </div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {showForm ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/35 backdrop-blur-sm sm:place-items-center sm:p-4">
          <button type="button" className="absolute inset-0" aria-label="Đóng" onClick={() => setShowForm(false)} />
          <form onSubmit={addViolation} className="relative z-10 w-full max-w-xl space-y-4 rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Thêm vi phạm</h2>
              <Button type="button" variant="ghost" className="size-9 p-0" onClick={() => setShowForm(false)}>
                <X size={17} />
              </Button>
            </div>
            <Field label="Rider">
              <Select required value={form.rider_id} onChange={(event) => setForm((current) => ({ ...current, rider_id: event.target.value }))}>
                <option value="">Chọn rider</option>
                {riders.map((rider) => (
                  <option key={rider.id} value={rider.id}>
                    {rider.full_name ?? rider.rider_code} · {rider.rider_code}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Ngày">
                <Input required type="date" value={form.work_date} onChange={(event) => setForm((current) => ({ ...current, work_date: event.target.value }))} />
              </Field>
              <Field label="Mức độ">
                <Select value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}>
                  <option value="LOW">Thấp</option>
                  <option value="MEDIUM">Vừa</option>
                  <option value="HIGH">Cao</option>
                </Select>
              </Field>
            </div>
            <Field label="Loại">
              <Select value={form.violation_type} onChange={(event) => setForm((current) => ({ ...current, violation_type: event.target.value }))}>
                {violationOptions().map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Khu vực">
              <Input placeholder="Để trống sẽ lấy theo rider" value={form.zone} onChange={(event) => setForm((current) => ({ ...current, zone: event.target.value }))} />
            </Field>
            <Field label="Ghi chú">
              <textarea
                className="min-h-24 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                placeholder="Chi tiết vi phạm, ví dụ: OFF đột xuất không báo trước"
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Đang lưu..." : "Lưu vi phạm"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function BentoStat({
  label,
  value,
  helper,
  icon: Icon,
  tone = "slate",
  featured,
  className,
}: {
  label: string;
  value: number;
  helper: string;
  icon: typeof ShieldAlert;
  tone?: "slate" | "red" | "amber" | "green";
  featured?: boolean;
  className?: string;
}) {
  const styles = {
    slate: "bg-slate-100 text-slate-700",
    red: "bg-red-50 text-red-700 ring-red-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  };
  return (
    <article
      className={cn(
        "flex min-h-28 flex-col justify-between rounded-xl border bg-white p-4",
        featured ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn("text-xs font-bold uppercase tracking-wide", featured ? "text-slate-300" : "text-slate-500")}>{label}</p>
          <p className={cn("mt-2 font-mono text-2xl font-bold tabular-nums", featured ? "text-white" : "text-slate-900")}>{value.toLocaleString("vi-VN")}</p>
          <p className={cn("mt-1 text-xs", featured ? "text-slate-300" : "text-slate-500")}>{helper}</p>
        </div>
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg ring-1", featured ? "bg-white text-slate-900" : styles[tone])}>
          <Icon size={18} />
        </span>
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
function Severity({ value }: { value: RiderViolationRecord["severity"] }) {
  const style = value === "HIGH" ? "bg-red-50 text-red-700 ring-red-200" : value === "MEDIUM" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-slate-100 text-slate-600 ring-slate-200";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1", style)}>{value === "HIGH" ? "Cao" : value === "MEDIUM" ? "Vừa" : "Thấp"}</span>;
}
function Status({ value }: { value: RiderViolationRecord["status"] }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1", value === "RESOLVED" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200")}>
      {value === "RESOLVED" ? "Đã xử lý" : "Chưa xử lý"}
    </span>
  );
}
function violationOptions() {
  return [
    { value: "LATE_CHECKIN", label: "Đi trễ" },
    { value: "NO_SHOW", label: "Vắng ca" },
    { value: "SLA_BREACH", label: "Vi phạm SLA" },
    { value: "SAFETY", label: "An toàn" },
    { value: "POLICY", label: "Chính sách" },
    { value: "OFF_UNEXPECTED", label: "OFF đột xuất" },
    { value: "WORKING_REST_DAY", label: "OFF nhưng không OFF" },
  ];
}
function typeLabel(value: RiderViolationRecord["violation_type"]) {
  return violationOptions().find((item) => item.value === value)?.label ?? value;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}
function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
