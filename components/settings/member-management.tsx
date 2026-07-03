"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, LoaderCircle, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type MemberRole = "admin" | "leader" | "viewer" | "member";
type Member = {
  id: string;
  email: string;
  full_name: string | null;
  role: MemberRole;
  created_at: string;
  last_sign_in_at: string | null;
  is_current_user: boolean;
};
type MembersResponse = { success: boolean; members?: Member[]; error?: string; message?: string };

const initialForm = { full_name: "", email: "", password: "", role: "member" as MemberRole };

export function MemberManagement() {
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
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
    // The member list is loaded after the admin-only page mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      setError(result?.error ?? "Không thể tạo thành viên");
      return;
    }
    setForm(initialForm);
    setSuccess(result.message ?? "Đã tạo thành viên mới");
    await loadMembers();
  }

  async function updateRole(member: Member, role: MemberRole) {
    setUpdatingId(member.id);
    setError(null);
    setSuccess(null);
    const response = await fetch("/api/admin/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: member.id, role }),
    });
    const result = await response.json().catch(() => null) as MembersResponse | null;
    setUpdatingId(null);
    if (!response.ok || !result?.success) {
      setError(result?.error ?? "Không thể đổi quyền thành viên");
      return;
    }
    setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role } : item));
    setSuccess(`Đã đổi quyền của ${member.full_name ?? member.email} thành ${roleLabel(role)}.`);
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="h-fit">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><UserPlus size={19} /></span>
            <div><h2 className="font-bold text-slate-950">Thêm thành viên</h2><p className="text-sm text-slate-500">Tạo tài khoản và cấp quyền ban đầu.</p></div>
          </div>
          <form className="mt-5 space-y-4" onSubmit={createMember}>
            <Field label="Họ và tên"><Input required minLength={2} value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} placeholder="Nguyễn Văn A" /></Field>
            <Field label="Email đăng nhập"><Input required type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="member@sdd.vn" /></Field>
            <Field label="Mật khẩu tạm">
              <div className="relative"><Input required minLength={8} type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Tối thiểu 8 ký tự" className="pr-11" /><button type="button" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} className="absolute right-1 top-1 grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
            </Field>
            <Field label="Quyền truy cập"><Select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value as MemberRole }))}><option value="member">Member — quyền cơ bản</option><option value="viewer">Viewer — chỉ xem</option><option value="leader">Leader — xem và cập nhật</option><option value="admin">Admin — toàn quyền</option></Select></Field>
            <Button type="submit" className="w-full" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" size={17} /> : <UserPlus size={17} />}{saving ? "Đang tạo..." : "Tạo tài khoản"}</Button>
          </form>
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><UsersRound size={19} /></span><div><h2 className="font-bold text-slate-950">Danh sách thành viên</h2><p className="text-sm text-slate-500">{loading ? "Đang tải..." : `${members.length} tài khoản trong hệ thống`}</p></div></div>
            <Button type="button" variant="secondary" className="h-9" onClick={() => void loadMembers()} disabled={loading}>Làm mới</Button>
          </div>
          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Thành viên</th><th className="px-4 py-3">Quyền</th><th className="px-4 py-3">Đăng nhập gần nhất</th><th className="px-4 py-3">Ngày tạo</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((member) => <tr key={member.id} className="bg-white"><td className="px-4 py-3"><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 font-bold text-blue-700">{initials(member.full_name ?? member.email)}</span><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{member.full_name ?? "Chưa có tên"} {member.is_current_user ? <Badge tone="blue">Bạn</Badge> : null}</p><p className="truncate text-xs text-slate-500">{member.email}</p></div></div></td><td className="px-4 py-3"><Select aria-label={`Quyền của ${member.full_name ?? member.email}`} className="h-9 min-w-32" value={member.role} disabled={updatingId === member.id || member.is_current_user} onChange={(event) => void updateRole(member, event.target.value as MemberRole)}><option value="member">Member</option><option value="viewer">Viewer</option><option value="leader">Leader</option><option value="admin">Admin</option></Select></td><td className="px-4 py-3 text-slate-600">{formatDate(member.last_sign_in_at)}</td><td className="px-4 py-3 text-slate-600">{formatDate(member.created_at)}</td></tr>)}
                {!loading && members.length === 0 ? <tr><td colSpan={4} className="h-40 text-center text-slate-500">Chưa có thành viên.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{success}</p> : null}
      <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900"><ShieldCheck className="mt-0.5 shrink-0" size={18} /><p><strong>Phân quyền:</strong> Member là tài khoản cơ bản chưa có chức năng riêng; Viewer chỉ xem dữ liệu; Leader được cập nhật nghiệp vụ; Admin có toàn quyền và quản lý tài khoản.</p></div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>; }
function roleLabel(role: MemberRole) { return role === "admin" ? "Admin" : role === "leader" ? "Leader" : role === "viewer" ? "Viewer" : "Member"; }
function initials(value: string) { return value.trim().split(/\s+/).slice(-2).map((part) => part[0]?.toUpperCase()).join("") || "?"; }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)) : "Chưa đăng nhập"; }
