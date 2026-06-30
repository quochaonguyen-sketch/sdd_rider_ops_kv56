"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bike,
  CalendarDays,
  ClipboardCheck,
  Database,
  ListChecks,
  LogOut,
  MapPinned,
  Menu,
  PackageOpen,
  PackagePlus,
  PencilRuler,
  Settings,
  Truck,
  Upload,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/riders", label: "Riders", icon: Bike },
  { href: "/attendance", label: "Attendance", icon: CalendarDays },
  { href: "/morning-delivery", label: "Morning Dispatch", icon: ClipboardCheck },
  { href: "/zones", label: "Zones", icon: MapPinned },
  { href: "/zone-builder", label: "Zone Builder", icon: PencilRuler },
  { href: "/pickup-management", label: "Pickup Management", icon: ListChecks },
  { href: "/imports", label: "Imports", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

const mobileNavItems = navItems.slice(0, 4);
const volumeItems = [
  { href: "/volume/delivery", label: "Delivery", icon: Truck },
  { href: "/volume/pickup", label: "Pickup", icon: PackagePlus },
];
const moreNavItems = [...volumeItems, ...navItems.slice(4)];

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { email: string; fullName: string | null; role: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white md:block">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <div className="flex size-10 items-center justify-center rounded-md bg-slate-950 text-white">
            <Database size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950">Rider Ops</p>
            <p className="text-xs text-slate-500">Realtime workforce</p>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {navItems.slice(0, 6).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950",
                  active && "bg-slate-950 text-white hover:bg-slate-950 hover:text-white",
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
          <div className="pt-1">
            <div
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold",
                pathname.startsWith("/volume") ? "text-slate-950" : "text-slate-500",
              )}
            >
              <PackageOpen size={18} />
              Volume
            </div>
            <div className="ml-6 space-y-1 border-l border-slate-200 pl-3">
              {volumeItems.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-950",
                      active && "bg-slate-950 text-white hover:bg-slate-950 hover:text-white",
                    )}
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          {navItems.slice(6).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950",
                  active && "bg-slate-950 text-white hover:bg-slate-950 hover:text-white",
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="md:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white md:hidden">
              <Database size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950 md:hidden">Rider Ops</p>
              <p className="truncate text-xs text-slate-500 md:hidden">{user.fullName ?? user.email}</p>
              <p className="hidden text-sm font-semibold text-slate-950 md:block">{user.fullName ?? user.email}</p>
              <p className="hidden text-xs uppercase tracking-wide text-slate-500 md:block">{user.role}</p>
            </div>
          </div>
          <BadgeRole role={user.role} />
          <Button type="button" variant="secondary" className="hidden md:inline-flex" onClick={signOut}>
            <LogOut size={16} />
            Sign out
          </Button>
        </header>
        <main className="px-3 py-4 pb-28 sm:px-4 md:px-6 md:py-6 md:pb-6">{children}</main>
      </div>

      {moreOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-30 bg-slate-950/30 backdrop-blur-[1px] md:hidden"
          onClick={() => setMoreOpen(false)}
        />
      ) : null}

      <div
        className={cn(
          "fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl transition md:hidden",
          moreOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
        )}
      >
        <div className="grid grid-cols-2 gap-2">
          {moreNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3 text-sm font-medium text-slate-700"
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => void signOut()}
            className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-red-50 px-3 py-3 text-sm font-medium text-red-700"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className="grid h-20 grid-cols-5">
          {mobileNavItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition",
                  active ? "text-slate-950" : "text-slate-400",
                )}
              >
                <span className={cn("grid size-9 place-items-center rounded-xl", active && "bg-slate-950 text-white")}>
                  <Icon size={19} />
                </span>
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((current) => !current)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium",
              moreOpen || ["/zone-builder", "/pickup-management", "/volume", "/imports", "/settings"].some((path) => pathname.startsWith(path))
                ? "text-slate-950"
                : "text-slate-400",
            )}
          >
            <span
              className={cn(
                "grid size-9 place-items-center rounded-xl",
                (moreOpen || ["/zone-builder", "/pickup-management", "/volume", "/imports", "/settings"].some((path) => pathname.startsWith(path))) &&
                  "bg-slate-950 text-white",
              )}
            >
              {moreOpen ? <X size={19} /> : <Menu size={19} />}
            </span>
            Thêm
          </button>
        </div>
      </nav>
    </div>
  );
}

function BadgeRole({ role }: { role: string }) {
  return (
    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700 md:hidden">
      {role}
    </span>
  );
}
