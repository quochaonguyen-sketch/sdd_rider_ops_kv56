import { cn } from "@/utils/cn";

export const APP_NAME = "Rider Operations";
export const APP_UNIT = "Khu vực 5 & 6 · SDD";

export function AppBrand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div
        className={cn(
          "relative grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 text-white shadow-[0_8px_24px_rgba(37,99,235,0.28)] ring-1 ring-white/20",
          compact ? "size-9 rounded-xl" : "size-11",
        )}
        aria-hidden="true"
      >
        <svg viewBox="0 0 48 48" className={compact ? "size-6" : "size-7"} fill="none">
          <path d="M13 31.5h4.5l5-14h9.75" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="m27.5 17.5 6 14H39" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="13" cy="33" r="6" stroke="currentColor" strokeWidth="3" />
          <circle cx="37" cy="33" r="6" stroke="currentColor" strokeWidth="3" />
          <path d="M19.5 25h11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          <path d="M20 12h8" stroke="#93c5fd" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-emerald-300 shadow-[0_0_0_3px_rgba(255,255,255,0.14)]" />
      </div>
      <div className="min-w-0">
        <p className={cn("truncate font-bold tracking-[-0.02em] text-slate-950", compact ? "text-sm" : "text-[15px]")}>{APP_NAME}</p>
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{APP_UNIT}</p>
      </div>
    </div>
  );
}

export function AppCopyright({ className }: { className?: string }) {
  return (
    <p className={cn("text-center text-xs text-slate-400", className)}>
      © {new Date().getFullYear()} Khu vực 5 & 6 SDD. Bảo lưu mọi quyền.
    </p>
  );
}
