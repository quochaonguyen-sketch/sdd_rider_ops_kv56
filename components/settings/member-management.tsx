"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, LoaderCircle, ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useReportInitialDataLoading } from "@/components/layout/app-loading-store";
import { PERMISSION_OPTIONS, defaultPermissionsForRole, selectedPermissionKeys, type MemberPermissions, type PermissionKey } from "@/lib/auth/permissions";

type MemberRole = "admin" | "leader" | "viewer" | "member";
type Member = {
  id: string;
  email: string;
  full_name: string | null;
  role: MemberRole;
  created_at: string;
  last_sign_in_at: string | null;
  is_current_user: boolean;
  permissions: MemberPermissions;
};
type MembersResponse = { success: boolean; members?: Member[]; error?: string; message?: string };

const initialForm = {
  full_name: "",
  email: "",
  role: "member" as MemberRole,
  permissions: defaultPermissionsForRole("member"),
};

export function MemberManagement() {
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  useReportInitialDataLoading("member-management", loading);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/members", { cache: "no-store" });
    const result = await response.json().catch(() => null) as MembersResponse | null;
    if (!response.ok || !result?.success) setError(result?.error ?? "Không thể tải danh sách thành viên");
    else setMembers(result.members ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function createMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = await response.json().catch(() => null) as MembersResponse | null;
    setSaving(false);
    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể thêm thành viên");
      return;
    }
    setForm({ ...initialForm, permissions: defaultPermissionsForRole("member") });
    setSuccess(result.message ?? "Đã thêm email vào danh sách được phép");
    await loadMembers();
  }

  async function updateMember(member: Member, patch: { role?: MemberRole; permissions?: MemberPermissions }) {
    setUpdatingId(member.id);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/admin/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: member.id, ...patch }),
    });
    const result = await response.json().catch(() => null) as MembersResponse & { permissions?: MemberPermissions } | null;
    setUpdatingId(null);
    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể cập nhật thành viên");
      return;
    }
    setMembers((current) => current.map((item) => item.id === member.id ? {
      ...item,
      role: patch.role ?? item.role,
      permissions: result.permissions ?? patch.permissions ?? item.permissions,
    } : item));
    setSuccess(`Đã cập nhật ${member.full_name ?? member.email}.`);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="h-fit">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><UserPlus size={19} /></span>
            <div><h2 className="font-bold text-slate-950">Thêm email được phép</h2><p className="text-sm text-slate-500">Chỉ email này mới đăng nhập Google. Chọn nhiều quyền bằng dropdown.</p></div>
          </div>
          <form className="mt-5 space-y-4" onSubmit={createMember}>
            <Field label="Họ và tên"><Input required minLength={2} value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Nguyễn Văn A" /></Field>
            <Field label="Email Google công ty"><Input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="name@spxexpress.com" /></Field>
            <Field label="Vai trò"><Select value={form.role} onChange={(event) => {
              const role = event.target.value as MemberRole;
              setForm((current) => ({ ...current, role, permissions: defaultPermissionsForRole(role) }));
            }}><option value="member">Member</option><option value="viewer">Viewer</option><option value="leader">Leader</option><option value="admin">Admin</option></Select></Field>
            <Field label="Quyền chức năng">
              <PermissionMultiSelect value={form.permissions} onChange={(permissions) => setForm((current) => ({ ...current, permissions }))} />
            </Field>
            <Button type="submit" className="w-full" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" size={17} /> : <UserPlus size={17} />}{saving ? "Đang thêm..." : "Cho phép đăng nhập"}</Button>
          </form>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><UsersRound size={19} /></span><div><h2 className="font-bold text-slate-950">Danh sách thành viên</h2><p className="text-sm text-slate-500">{loading ? "Đang tải..." : `${members.length} email được phép`}</p></div></div>
            <Button type="button" variant="secondary" className="h-9" onClick={() => void loadMembers()} disabled={loading}>Làm mới</Button>
          </div>
          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Thành viên</th><th className="px-4 py-3">Vai trò</th><th className="px-4 py-3">Quyền</th><th className="px-4 py-3">Đăng nhập gần nhất</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((member) => (
                  <tr key={member.id} className="bg-white align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 font-bold text-blue-700">{initials(member.full_name ?? member.email)}</span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{member.full_name ?? "Chưa có tên"} {member.is_current_user ? <Badge tone="blue">Bạn</Badge> : null}</p>
                          <p className="truncate text-xs text-slate-500">{member.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Select aria-label={`Vai trò của ${member.full_name ?? member.email}`} className="h-9 min-w-32" value={member.role} disabled={updatingId === member.id || member.is_current_user} onChange={(event) => void updateMember(member, { role: event.target.value as MemberRole, permissions: defaultPermissionsForRole(event.target.value) })}>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                        <option value="leader">Leader</option>
                        <option value="admin">Admin</option>
                      </Select>
                    </td>
                    <td className="px-4 py-3 min-w-[240px]">
                      <PermissionMultiSelect
                        value={member.permissions}
                        disabled={updatingId === member.id || member.role === "admin"}
                        onChange={(permissions) => void updateMember(member, { permissions })}
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(member.last_sign_in_at)}</td>
                  </tr>
                ))}
                {!loading && members.length === 0 ? <tr><td colSpan={4} className="h-40 text-center text-slate-500">Chưa có thành viên.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</p> : null}
      <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><ShieldCheck className="mt-0.5 shrink-0" size={18} /><p><strong>Cách cấp quyền:</strong> mở dropdown và tick nhiều chức năng. Ví dụ chỉ cho duyệt OFF và sửa Rider thì chọn đúng 2 mục đó. Admin luôn có đủ quyền.</p></div>
    </div>
  );
}

function PermissionMultiSelect({ value, onChange, disabled }: { value: MemberPermissions; onChange: (value: MemberPermissions) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => selectedPermissionKeys(value), [value]);
  const summary = selected.length === 0
    ? "Chưa chọn quyền"
    : selected.length === PERMISSION_OPTIONS.length
      ? "Tất cả quyền"
      : selected.map((key) => PERMISSION_OPTIONS.find((item) => item.key === key)?.label).filter(Boolean).join(", ");

  function toggle(key: PermissionKey) {
    onChange({ ...value, [key]: !value[key] });
  }

  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((current) => !current)} className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 disabled:opacity-60">
        <span className="line-clamp-2">{summary}</span>
        <ChevronDown size={16} className={open ? "rotate-180" : ""} />
      </button>
      {selected.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {selected.map((key) => {
            const label = PERMISSION_OPTIONS.find((item) => item.key === key)?.label ?? key;
            return (
              <button key={key} type="button" disabled={disabled} onClick={() => toggle(key)} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {label}
                <X size={11} />
              </button>
            );
          })}
        </div>
      ) : null}
      {open && !disabled ? (
        <div className="absolute z-20 mt-2 max-h-72 w-full min-w-[240px] overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {PERMISSION_OPTIONS.map((item) => (
            <label key={item.key} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-sm hover:bg-slate-50">
              <input type="checkbox" className="mt-0.5" checked={value[item.key]} onChange={() => toggle(item.key)} />
              <span>
                <strong className="block text-slate-900">{item.label}</strong>
                <span className="text-xs text-slate-500">{item.hint}</span>
              </span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>; }
function initials(value: string) { return value.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join("") || "?"; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)) : "Chưa đăng nhập"; }
