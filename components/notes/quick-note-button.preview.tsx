/* Hallmark · component preview: quick-note · states: default · hover · focus · active · disabled · loading · error · success */
"use client";

import { Check, LoaderCircle, NotebookPen, Plus } from "lucide-react";

const rows = [
  { label: "default", content: <><NotebookPen size={18} /> Note nhanh</>, className: "bg-slate-950 text-white" },
  { label: "hover", content: <><NotebookPen size={18} /> Note nhanh</>, className: "bg-slate-800 text-white -translate-y-0.5" },
  { label: "focus", content: <><NotebookPen size={18} /> Note nhanh</>, className: "bg-slate-950 text-white ring-2 ring-blue-500 ring-offset-2" },
  { label: "active", content: <><NotebookPen size={18} /> Note nhanh</>, className: "bg-slate-950 text-white translate-y-px" },
  { label: "disabled", content: <><NotebookPen size={18} /> Note nhanh</>, className: "bg-slate-950 text-white opacity-55 cursor-not-allowed" },
  { label: "loading", content: <><LoaderCircle size={18} className="animate-spin" /> Đang lưu</>, className: "bg-slate-950 text-white" },
  { label: "error", content: <><Plus size={18} /> Lưu lại</>, className: "bg-red-50 text-red-700 ring-1 ring-red-300" },
  { label: "success", content: <><Check size={18} /> Đã lưu</>, className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300" },
];

export function QuickNoteButtonPreview() {
  return (
    <div className="mx-auto max-w-xl space-y-3 rounded-3xl bg-white p-6 text-slate-950 shadow-sm">
      <h2 className="text-lg font-semibold">QuickNoteButton · 8 states</h2>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-4">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{row.label}</span>
          <button type="button" disabled={row.label === "disabled"} className={`inline-flex h-11 w-fit items-center gap-2 rounded-full px-4 text-sm font-semibold outline-none transition-[background-color,transform] ${row.className}`}>
            {row.content}
          </button>
        </div>
      ))}
    </div>
  );
}
