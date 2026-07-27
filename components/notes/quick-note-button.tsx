/* Hallmark · component: quick-note · genre: modern-minimal · theme: existing Rider Ops
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (40–41)
 */
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, FileText, LoaderCircle, NotebookPen, Pin, Plus, X } from "lucide-react";
import { cn } from "@/utils/cn";

type NoteStatus = "ACTIVE" | "ARCHIVED";
type QuickNote = {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  status: NoteStatus;
  created_at: string;
  updated_at: string;
};
type ApiResponse = { success: boolean; notes?: QuickNote[]; note?: QuickNote; error?: string };
type SaveState = "idle" | "loading" | "success" | "error";

const emptyDraft = { title: "", content: "", is_pinned: false };

export function QuickNoteButton() {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const activeNotes = useMemo(() => notes.filter((note) => note.status === "ACTIVE").slice(0, 5), [notes]);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const response = await fetch("/api/notes", { cache: "no-store" });
    const result = (await response.json().catch(() => null)) as ApiResponse | null;
    if (!response.ok || !result?.success) {
      setMessage(result?.error ?? "Không thể tải note nhanh.");
    } else {
      setNotes(result.notes ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (panelRef.current && event.target instanceof Node && !panelRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  async function saveNote() {
    const title = draft.title.trim();
    const content = draft.content.trim();
    if (!title && !content) {
      setSaveState("error");
      setMessage("Nhập tiêu đề hoặc nội dung trước khi lưu.");
      return;
    }
    setSaveState("loading");
    setMessage(null);
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title || content.split(/\s+/).slice(0, 8).join(" "),
        content,
        is_pinned: draft.is_pinned,
      }),
    });
    const result = (await response.json().catch(() => null)) as ApiResponse | null;
    if (!response.ok || !result?.note) {
      setSaveState("error");
      setMessage(result?.error ?? "Không thể lưu note.");
      return;
    }
    setNotes((current) => [result.note!, ...current.filter((note) => note.id !== result.note!.id)].sort(sortNotes));
    setDraft(emptyDraft);
    setSaveState("success");
    setMessage("Đã lưu note nhanh.");
    window.setTimeout(() => setSaveState("idle"), 1800);
  }

  function togglePanel() {
    if (!open) {
      void loadNotes();
      window.setTimeout(() => firstFieldRef.current?.focus(), 0);
    }
    setOpen((current) => !current);
  }

  return (
    <div ref={panelRef} className="fixed bottom-24 right-4 z-[80] sm:bottom-6 sm:right-6">
      {open ? (
        <section className="mb-3 w-[min(calc(100vw-2rem),24rem)] overflow-hidden rounded-[1.4rem] border border-slate-200/80 bg-white/95 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,0.20)] backdrop-blur dark:border-slate-700/70 dark:bg-slate-950/95 dark:text-slate-50" aria-label="Note nhanh">
          <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-300">Note nhanh</p>
              <h2 className="mt-1 text-base font-semibold leading-6">Ghi lại trước khi trôi mất</h2>
            </div>
            <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full text-slate-500 outline-none transition-[background-color,color,transform] duration-150 hover:bg-slate-100 hover:text-slate-950 active:translate-y-px focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:focus-visible:ring-offset-slate-950" aria-label="Đóng note nhanh" onClick={() => setOpen(false)}>
              <X size={17} aria-hidden="true" />
            </button>
          </header>

          <div className="space-y-3 px-4 py-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300" htmlFor="quick-note-title">Tiêu đề</label>
              <input
                ref={firstFieldRef}
                id="quick-note-title"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="Việc cần nhớ"
                maxLength={160}
                className={cn("h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none transition-[background-color,border-color] placeholder:text-slate-400 hover:bg-slate-50 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500 dark:hover:bg-slate-900/70", saveState === "error" && "border-red-400 focus-visible:ring-red-500", saveState === "success" && "border-emerald-400")}
                aria-invalid={saveState === "error"}
                aria-describedby={message ? "quick-note-status" : undefined}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300" htmlFor="quick-note-content">Nội dung</label>
              <textarea
                id="quick-note-content"
                value={draft.content}
                onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))}
                placeholder="Ca trực, rider cần follow, quyết định vừa chốt..."
                maxLength={10000}
                className={cn("min-h-28 w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 outline-none transition-[background-color,border-color] placeholder:text-slate-400 hover:bg-slate-50 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:placeholder:text-slate-500 dark:hover:bg-slate-900/70", saveState === "error" && "border-red-400 focus-visible:ring-red-500", saveState === "success" && "border-emerald-400")}
                aria-invalid={saveState === "error"}
                aria-describedby={message ? "quick-note-status" : undefined}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <button type="button" aria-pressed={draft.is_pinned} onClick={() => setDraft((current) => ({ ...current, is_pinned: !current.is_pinned }))} className={cn("inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 px-3 text-sm font-medium text-slate-600 outline-none transition-[background-color,color,transform] duration-150 hover:bg-slate-50 active:translate-y-px focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900", draft.is_pinned && "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200")}>
                <Pin size={15} aria-hidden="true" />
                Ghim
              </button>
              <button type="button" disabled={saveState === "loading"} onClick={() => void saveNote()} className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white outline-none transition-[background-color,transform] duration-150 hover:bg-slate-800 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:focus-visible:ring-offset-slate-950">
                {saveState === "loading" ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : saveState === "success" ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
                {saveState === "loading" ? "Đang lưu" : saveState === "success" ? "Đã lưu" : "Lưu nhanh"}
              </button>
            </div>

            {message ? <p id="quick-note-status" role={saveState === "error" ? "alert" : "status"} className={cn("rounded-2xl px-3 py-2 text-sm", saveState === "error" ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200")}>{message}</p> : null}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>Note gần đây</span>
              <Link href="/notes" className="whitespace-nowrap rounded-full px-2 py-1 text-blue-700 outline-none transition-[background-color,color] hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-300 dark:hover:bg-blue-950/50">Mở Notes</Link>
            </div>
            <div className="space-y-2">
              {loading ? <QuickNoteSkeleton /> : null}
              {!loading && activeNotes.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">Chưa có note nào. Lưu nhanh một note ở trên để bắt đầu.</p> : null}
              {!loading && activeNotes.map((note) => <QuickNoteItem key={note.id} note={note} />)}
            </div>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        aria-expanded={open}
        aria-controls="quick-note-title"
        title="Note nhanh"
        onClick={togglePanel}
        className="group relative grid size-14 place-items-center rounded-2xl border border-white/70 bg-slate-950 text-white shadow-[0_16px_40px_rgba(15,23,42,0.28)] outline-none transition-[background-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:bg-slate-800 active:translate-y-px focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:focus-visible:ring-offset-slate-950"
      >
        <NotebookPen size={22} aria-hidden="true" />
        <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-blue-600 text-[0.65rem] font-bold text-white ring-2 ring-white dark:ring-slate-950">{activeNotes.length}</span>
        <span className="sr-only">Mở note nhanh</span>
      </button>
    </div>
  );
}

function QuickNoteItem({ note }: { note: QuickNote }) {
  return (
    <Link href="/notes" className="group block rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 active:translate-y-px focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-900">
      <span className="mb-1 flex items-center justify-between gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-slate-400">
        <span className="inline-flex items-center gap-1">{note.is_pinned ? <Pin size={11} aria-hidden="true" /> : <FileText size={11} aria-hidden="true" />}Note</span>
        <time>{formatDate(note.updated_at)}</time>
      </span>
      <strong className="block truncate text-sm text-slate-900 dark:text-slate-50">{note.title}</strong>
      <span className="mt-1 block line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{preview(note.content)}</span>
    </Link>
  );
}

function QuickNoteSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-slate-800" />)}
    </div>
  );
}

function preview(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || "Chưa có nội dung";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(value));
}

function sortNotes(a: QuickNote, b: QuickNote) {
  return Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}
