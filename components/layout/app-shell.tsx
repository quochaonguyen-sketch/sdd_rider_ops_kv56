"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Bike,
  CalendarDays,
  Database,
  LogOut,
  MapPinned,
  Settings,
  Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/riders", label: "Riders", icon: Bike },
  { href: "/attendance", label: "Attendance", icon: CalendarDays },
  { href: "/zones", label: "Zones", icon: MapPinned },
  { href: "/imports", label: "Imports", icon: Upload },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { email: string; fullName: string | null; role: string };
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white md:block">
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
          {navItems.map((item) => {
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
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:px-6">
          <div>
            <p className="text-sm font-semibold text-slate-950">{user.fullName ?? user.email}</p>
            <p className="text-xs uppercase tracking-wide text-slate-500">{user.role}</p>
          </div>
          <Button type="button" variant="secondary" onClick={signOut}>
            <LogOut size={16} />
            Sign out
          </Button>
        </header>
        <main className="px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
