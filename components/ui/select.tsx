import type { SelectHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium leading-5 text-slate-700 shadow-sm outline-none transition duration-150 hover:border-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400",
        className,
      )}
      {...props}
    />
  );
}
