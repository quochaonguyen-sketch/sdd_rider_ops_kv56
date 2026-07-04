"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDot, ClipboardList, Clock3, GripVertical, LoaderCircle, Plus, RefreshCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/utils/cn";

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
type Person = { id: string; full_name: string | null; email: string; role?: string };
type Task = { id: string; title: string; description: string | null; priority: TaskPriority; status: TaskStatus; due_at: string | null; completed_at: string | null; created_at: string; assignee_id: string; created_by: string; assignee: Person | null; creator: Person | null };
type ApiResponse = { success: boolean; tasks?: Task[]; task?: Task; members?: Person[]; can_create?: boolean; current_user_id?: string; error?: string };
const initialForm = { title: "", description: "", assignee_id: "", priority: "MEDIUM" as TaskPriority, due_at: "" };
const columns: Array<{ status: TaskStatus; label: string; dot: string; surface: string }> = [
  { status: "TODO", label: "Chưa bắt đầu", dot: "bg-slate-400", surface: "bg-slate-100/80" },
  { status: "IN_PROGRESS", label: "Đang thực hiện", dot: "bg-blue-500", surface: "bg-blue-50/70" },
  { status: "DONE", label: "Hoàn thành", dot: "bg-emerald-500", surface: "bg-emerald-50/60" },
];

export function TasksView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Person[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [currentUserId, setCurrentUserId] = useState("");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragTarget, setDragTarget] = useState<TaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [renderedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const response = await fetch("/api/tasks", { cache: "no-store" });
    const result = await response.json().catch(() => null) as ApiResponse | null;
    if (!response.ok || !result?.success) setError(result?.error ?? "Không thể tải danh sách task");
    else { setTasks(result.tasks ?? []); setMembers(result.members ?? []); setCanCreate(Boolean(result.can_create)); setCurrentUserId(result.current_user_id ?? ""); }
    setLoading(false);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const stats = useMemo(() => ({ total: tasks.length, todo: tasks.filter((task) => task.status === "TODO").length, doing: tasks.filter((task) => task.status === "IN_PROGRESS").length, done: tasks.filter((task) => task.status === "DONE").length }), [tasks]);
  const filtered = useMemo(() => { const text = query.trim().toLocaleLowerCase("vi"); return tasks.filter((task) => !text || `${task.title} ${task.description} ${task.assignee?.full_name} ${task.assignee?.email}`.toLocaleLowerCase("vi").includes(text)); }, [query, tasks]);

  async function createTask(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(null);
    const response = await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, due_at: form.due_at ? new Date(form.due_at).toISOString() : null }) });
    const result = await response.json().catch(() => null) as ApiResponse | null;
    setSaving(false);
    if (!response.ok || !result?.task) return setError(result?.error ?? "Không thể tạo task");
    setTasks((current) => [result.task!, ...current]); setForm(initialForm); setShowForm(false); setSuccess("Đã giao task cho member.");
  }

  async function updateStatus(task: Task, next: TaskStatus) {
    if (task.status === next) return;
    const previous = task;
    setUpdatingId(task.id); setError(null);
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: next } : item));
    const response = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: task.id, status: next }) });
    const result = await response.json().catch(() => null) as ApiResponse | null;
    setUpdatingId(null);
    if (!response.ok || !result?.task) { setTasks((current) => current.map((item) => item.id === task.id ? previous : item)); return setError(result?.error ?? "Không thể cập nhật task"); }
    setTasks((current) => current.map((item) => item.id === task.id ? result.task! : item));
  }

  function dropTask(status: TaskStatus) {
    const task = tasks.find((item) => item.id === draggedId);
    setDraggedId(null); setDragTarget(null);
    if (task && (canCreate || task.assignee_id === currentUserId)) void updateStatus(task, status);
  }

  return <div className="mx-auto max-w-[1600px] space-y-6">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Team execution</p><h1 className="mt-1 text-2xl font-bold text-slate-950">Bảng công việc</h1><p className="mt-1 text-sm text-slate-500">Kéo thả task giữa các cột để cập nhật tiến độ nhanh chóng.</p></div><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCcw size={16} className={loading ? "animate-spin" : undefined} />Làm mới</Button>{canCreate ? <Button type="button" onClick={() => setShowForm(true)} disabled={members.length === 0}><Plus size={16} />Giao task</Button> : null}</div></header>
    {canCreate && members.length === 0 && !loading ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Chưa có tài khoản role Member. Hãy tạo Member trong mục Thành viên trước khi giao task.</p> : null}
    {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}{success ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{success}</p> : null}
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Stat label="Tổng task" value={stats.total} icon={<ClipboardList size={18} />} /><Stat label="Chưa bắt đầu" value={stats.todo} icon={<CircleDot size={18} />} tone="slate" /><Stat label="Đang thực hiện" value={stats.doing} icon={<Clock3 size={18} />} /><Stat label="Hoàn thành" value={stats.done} icon={<CheckCircle2 size={18} />} tone="green" /></section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><label className="relative block w-full sm:max-w-md"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm task hoặc member" /></label><p className="text-xs text-slate-500"><span className="hidden sm:inline">Kéo thả card để cập nhật · </span>{filtered.length} task</p></div><div className="overflow-x-auto bg-slate-50/70 p-4"><div className="grid min-w-[980px] grid-cols-3 items-start gap-4">{columns.map((column) => <BoardColumn key={column.status} column={column} tasks={filtered.filter((task) => task.status === column.status)} renderedAt={renderedAt} loading={loading} draggedId={draggedId} active={dragTarget === column.status} canCreate={canCreate} currentUserId={currentUserId} updatingId={updatingId} onDragStart={setDraggedId} onDragEnd={() => { setDraggedId(null); setDragTarget(null); }} onDragOver={() => setDragTarget(column.status)} onDrop={() => dropTask(column.status)} onStatus={(task, next) => void updateStatus(task, next)} />)}</div></div></section>
    {showForm ? <TaskForm form={form} members={members} saving={saving} onForm={setForm} onClose={() => setShowForm(false)} onSubmit={createTask} /> : null}
  </div>;
}

function BoardColumn({ column, tasks, renderedAt, loading, draggedId, active, canCreate, currentUserId, updatingId, onDragStart, onDragEnd, onDragOver, onDrop, onStatus }: { column: (typeof columns)[number]; tasks: Task[]; renderedAt: number; loading: boolean; draggedId: string | null; active: boolean; canCreate: boolean; currentUserId: string; updatingId: string | null; onDragStart: (id: string) => void; onDragEnd: () => void; onDragOver: () => void; onDrop: () => void; onStatus: (task: Task, status: TaskStatus) => void }) {
  return <div className={cn("min-h-[520px] rounded-2xl border border-transparent p-3 transition", column.surface, active && "border-blue-400 ring-4 ring-blue-100")} onDragOver={(event) => { event.preventDefault(); onDragOver(); }} onDrop={(event) => { event.preventDefault(); onDrop(); }}><div className="mb-3 flex items-center justify-between px-1"><div className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full", column.dot)} /><h2 className="text-sm font-bold text-slate-800">{column.label}</h2></div><span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-500 shadow-sm">{tasks.length}</span></div><div className="space-y-3">{tasks.map((task) => <TaskCard key={task.id} task={task} renderedAt={renderedAt} dragging={draggedId === task.id} updating={updatingId === task.id} canUpdate={canCreate || task.assignee_id === currentUserId} onDragStart={() => onDragStart(task.id)} onDragEnd={onDragEnd} onStatus={(next) => onStatus(task, next)} />)}{loading ? Array.from({ length: 2 }, (_, index) => <div key={index} className="h-44 animate-pulse rounded-xl bg-white/80" />) : null}{!loading && tasks.length === 0 ? <div className={cn("grid h-32 place-items-center rounded-xl border border-dashed text-xs", active ? "border-blue-400 bg-blue-50 text-blue-600" : "border-slate-300 text-slate-400")}>{active ? "Thả task vào đây" : "Chưa có task"}</div> : null}</div></div>;
}

function TaskCard({ task, renderedAt, dragging, updating, canUpdate, onDragStart, onDragEnd, onStatus }: { task: Task; renderedAt: number; dragging: boolean; updating: boolean; canUpdate: boolean; onDragStart: () => void; onDragEnd: () => void; onStatus: (status: TaskStatus) => void }) {
  const overdue = task.status !== "DONE" && task.due_at && new Date(task.due_at).getTime() < renderedAt;
  return <article draggable={canUpdate} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; onDragStart(); }} onDragEnd={onDragEnd} className={cn("flex min-h-48 flex-col rounded-xl border bg-white p-4 shadow-sm transition", canUpdate && "cursor-grab active:cursor-grabbing", dragging && "scale-[0.98] opacity-40", overdue ? "border-red-200" : "border-slate-200", !dragging && "hover:-translate-y-0.5 hover:shadow-md")}><div className="flex items-start justify-between gap-3"><Priority value={task.priority} /><div className="flex items-center gap-2"><span className={cn("text-xs font-semibold", overdue ? "text-red-600" : "text-slate-400")}>{overdue ? "Quá hạn" : formatDue(task.due_at)}</span>{canUpdate ? <GripVertical size={16} className="text-slate-300" /> : null}</div></div><h3 className="mt-3 font-bold leading-6 text-slate-950">{task.title}</h3><p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-500">{task.description || "Không có mô tả."}</p><div className="mt-auto border-t border-slate-100 pt-4"><div className="mb-3 min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{task.assignee?.full_name ?? task.assignee?.email}</p><p className="truncate text-xs text-slate-400">Giao bởi {task.creator?.full_name ?? task.creator?.email}</p></div><Select aria-label={`Trạng thái ${task.title}`} className="h-9" value={task.status} disabled={!canUpdate || updating} onChange={(event) => onStatus(event.target.value as TaskStatus)}><option value="TODO">Chưa bắt đầu</option><option value="IN_PROGRESS">Đang làm</option><option value="DONE">Hoàn thành</option></Select></div></article>;
}

function TaskForm({ form, members, saving, onForm, onClose, onSubmit }: { form: typeof initialForm; members: Person[]; saving: boolean; onForm: React.Dispatch<React.SetStateAction<typeof initialForm>>; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-end bg-slate-950/45 backdrop-blur-sm sm:place-items-center sm:p-4"><button type="button" className="absolute inset-0" aria-label="Đóng" onClick={onClose} /><form onSubmit={onSubmit} className="relative z-10 w-full max-w-xl space-y-4 rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-950">Giao task mới</h2><p className="text-sm text-slate-500">Mô tả rõ đầu ra và deadline.</p></div><Button type="button" variant="ghost" className="size-9 p-0" onClick={onClose}><X size={18} /></Button></div><Field label="Tên công việc"><Input required minLength={2} maxLength={160} value={form.title} onChange={(event) => onForm((current) => ({ ...current, title: event.target.value }))} placeholder="Ví dụ: Đối soát danh sách rider ca sáng" /></Field><Field label="Mô tả / Kết quả mong đợi"><textarea className="min-h-28 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" maxLength={2000} value={form.description} onChange={(event) => onForm((current) => ({ ...current, description: event.target.value }))} placeholder="Nêu yêu cầu, phạm vi và kết quả cần bàn giao..." /></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Giao cho Member"><Select required value={form.assignee_id} onChange={(event) => onForm((current) => ({ ...current, assignee_id: event.target.value }))}><option value="">Chọn member</option>{members.map((member) => <option key={member.id} value={member.id}>{member.full_name ?? member.email}</option>)}</Select></Field><Field label="Mức ưu tiên"><Select value={form.priority} onChange={(event) => onForm((current) => ({ ...current, priority: event.target.value as TaskPriority }))}><option value="LOW">Thấp</option><option value="MEDIUM">Bình thường</option><option value="HIGH">Cao</option></Select></Field></div><Field label="Deadline"><Input type="datetime-local" value={form.due_at} onChange={(event) => onForm((current) => ({ ...current, due_at: event.target.value }))} /></Field><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={onClose}>Hủy</Button><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}{saving ? "Đang giao..." : "Giao task"}</Button></div></form></div>;
}

function Stat({ label, value, icon, tone = "blue" }: { label: string; value: number; icon: React.ReactNode; tone?: "slate" | "blue" | "green" }) { const colors = { slate: "bg-slate-100 text-slate-600", blue: "bg-blue-50 text-blue-700", green: "bg-emerald-50 text-emerald-700" }; return <Card className="min-h-28"><div className="flex items-start justify-between"><div><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-bold tabular-nums">{value}</p></div><span className={cn("grid size-9 place-items-center rounded-xl", colors[tone])}>{icon}</span></div></Card>; }
function Priority({ value }: { value: TaskPriority }) { const styles = value === "HIGH" ? "bg-red-50 text-red-700" : value === "MEDIUM" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"; return <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide", styles)}>{value === "HIGH" ? "Ưu tiên cao" : value === "MEDIUM" ? "Bình thường" : "Ưu tiên thấp"}</span>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>{children}</label>; }
function formatDue(value: string | null) { if (!value) return "Không deadline"; return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value)); }
