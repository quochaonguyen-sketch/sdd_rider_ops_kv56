import { cn } from "@/utils/cn";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "green" | "red" | "amber" | "blue" | "neutral";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-4 ring-1 ring-inset",
        tone === "green" && "bg-emerald-50 text-emerald-700 ring-emerald-200/70",
        tone === "red" && "bg-red-50 text-red-700 ring-red-200/70",
        tone === "amber" && "bg-amber-50 text-amber-700 ring-amber-200/70",
        tone === "blue" && "bg-blue-50 text-blue-700 ring-blue-200/70",
        tone === "neutral" && "bg-slate-50 text-slate-600 ring-slate-200",
      )}
    >
      {children}
    </span>
  );
}
