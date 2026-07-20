"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Activity, BarChart3, Bike, CalendarDays, CalendarOff, ChevronDown, ClipboardCheck, ListChecks, ListTodo, LogOut, MapPinned, Menu, Moon, PackageOpen, PackagePlus, PanelLeftClose, PanelLeftOpen, PencilRuler, Sun, Truck, Upload, UsersRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/utils/cn";
import { AppBrand, AppCopyright } from "@/components/layout/app-brand";
import { RouteReveal } from "@/components/layout/route-reveal";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/realtime-dashboard", label: "Realtime Dashboard", icon: Activity },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/riders", label: "Riders", icon: Bike },
  { href: "/performance", label: "Performance", icon: BarChart3 },
  { href: "/attendance", label: "Attendance", icon: CalendarDays },
  { href: "/off-schedule", label: "Off Schedule", icon: CalendarOff },
  { href: "/morning-delivery", label: "Morning Dispatch", icon: ClipboardCheck },
  { href: "/zones", label: "Zones", icon: MapPinned },
  { href: "/zone-builder", label: "Zone Builder", icon: PencilRuler },
  { href: "/pickup-management", label: "Pickup Management", icon: ListChecks },
  { href: "/imports", label: "Imports", icon: Upload },
  { href: "/settings", label: "Thành viên", icon: UsersRound },
];

const mobileNavItems = navItems.slice(0, 4);
const volumeItems = [
  { href: "/volume/delivery", label: "Delivery", icon: Truck },
  { href: "/volume/pickup", label: "Pickup", icon: PackagePlus },
];
const toolItems = [
  { href: "/zone-builder", label: "Zone Builder", icon: PencilRuler },
  { href: "/pickup-management", label: "Pickup Management", icon: ListChecks },
];
const memberHiddenItems = new Set(["/zone-builder", "/pickup-management"]);
const morePaths = ["/performance", "/attendance", "/off-schedule", "/morning-delivery", "/zones", "/zone-builder", "/pickup-management", "/volume", "/imports", "/settings"];
type ThemeMode = "light" | "dark";

export function AppShell({ children, user }: { children: React.ReactNode; user: { email: string; fullName: string | null; role: string } }) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const memberToolRestricted = user.role === "member";
  const visibleToolItems = memberToolRestricted ? [] : toolItems;
  const moreNavItems = [...volumeItems, ...navItems.slice(4).filter((item) => !memberToolRestricted || !memberHiddenItems.has(item.href))];
  const volumeActive = pathname.startsWith("/volume");
  const [volumeOpen, setVolumeOpen] = useState(volumeActive);
  const toolsActive = visibleToolItems.some((item) => pathname.startsWith(item.href));
  const [toolsOpen, setToolsOpen] = useState(toolsActive);
  const moreRouteActive = morePaths.some((path) => pathname.startsWith(path));
  const currentPage = [...navItems, ...volumeItems].find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  useEffect(() => {
    // The root boot script applies the saved mode before paint; this only syncs the control label.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem("rider-ops-theme", nextTheme);
    setTheme(nextTheme);
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
  }

  return (
    <div className={cn("app-shell-technical", !sidebarOpen && "is-sidebar-collapsed")}>
      <aside id="operations-sidebar" className="app-sidebar">
        <div className="app-sidebar-brand"><AppBrand inverse /></div>
        <div className="app-sidebar-context"><span className="app-live-dot" aria-hidden="true" /><span>Operations workspace</span></div>
        <nav className="app-sidebar-nav" aria-label="Điều hướng chính">
          <p className="app-nav-eyebrow">Workspace</p>
          {navItems.slice(0, 9).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("app-nav-link", active && "is-active")}><Icon size={17} aria-hidden="true" /><span>{item.label}</span></Link>;
          })}
          <SidebarDisclosure label="Volume" icon={PackageOpen} open={volumeOpen} active={volumeActive} onToggle={() => setVolumeOpen((current) => !current)}>
            {volumeItems.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("app-nav-sub-link", active && "is-active")}><Icon size={15} aria-hidden="true" /><span>{item.label}</span></Link>;
            })}
          </SidebarDisclosure>
          {visibleToolItems.length > 0 ? <SidebarDisclosure label="Tools" icon={PencilRuler} open={toolsOpen} active={toolsActive} onToggle={() => setToolsOpen((current) => !current)}>
            {visibleToolItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("app-nav-sub-link", active && "is-active")}><Icon size={15} aria-hidden="true" /><span>{item.label}</span></Link>;
            })}
          </SidebarDisclosure> : null}
          <p className="app-nav-eyebrow app-nav-eyebrow-secondary">System</p>
          {navItems.slice(11).map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("app-nav-link", active && "is-active")}><Icon size={17} aria-hidden="true" /><span>{item.label}</span></Link>;
          })}
        </nav>
        <div className="app-sidebar-foot"><span>SDD · KV5 + KV6</span><span>Internal operations</span></div>
      </aside>

      <div className="app-shell-content">
        <header className="app-header">
          <div className="app-header-mobile-brand"><AppBrand compact /></div>
          <div className="app-header-leading">
            <button type="button" className="app-sidebar-toggle" aria-controls="operations-sidebar" aria-expanded={sidebarOpen} aria-label={sidebarOpen ? "Ẩn thanh điều hướng" : "Hiện thanh điều hướng"} title={sidebarOpen ? "Ẩn thanh điều hướng" : "Hiện thanh điều hướng"} onClick={() => setSidebarOpen((current) => !current)}>
              {sidebarOpen ? <PanelLeftClose size={18} aria-hidden="true" /> : <PanelLeftOpen size={18} aria-hidden="true" />}
            </button>
            <div className="app-header-context">
              <p className="app-header-kicker">Rider Operations / Workspace</p>
              <div className="app-header-title-row"><h1>{currentPage?.label ?? "Operations"}</h1><span className="app-header-status"><span className="app-live-dot" aria-hidden="true" />System ready</span></div>
            </div>
          </div>
          <div className="app-header-account">
            <button type="button" className="app-theme-toggle" aria-label={theme === "dark" ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"} title={theme === "dark" ? "Giao diện sáng" : "Giao diện tối"} onClick={toggleTheme}>
              {theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            </button>
            <div className="app-account-copy"><strong>{user.fullName ?? user.email}</strong><span>{user.role}</span></div>
            <RoleBadge role={user.role} />
            <button type="button" className="app-signout" onClick={() => void signOut()}><LogOut size={15} aria-hidden="true" /><span>Sign out</span></button>
          </div>
        </header>
        <main className="app-main"><RouteReveal key={pathname}>{children}</RouteReveal></main>
        <footer className="app-footer"><AppCopyright /><p>Rider Ops Console · {currentPage?.label ?? "Operations"}</p></footer>
      </div>

      {moreOpen ? <button type="button" aria-label="Đóng menu" className="app-mobile-scrim" onClick={() => setMoreOpen(false)} /> : null}
      <section className={cn("app-more-sheet", moreOpen && "is-open")} aria-label="Menu chức năng khác" aria-hidden={!moreOpen}>
        <div className="app-more-heading"><div><span>Navigation index</span><h2>Operations menu</h2></div><button type="button" aria-label="Đóng menu" onClick={() => setMoreOpen(false)}><X size={18} /></button></div>
        <div className="app-more-grid">
          {moreNavItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} aria-current={active ? "page" : undefined} className={cn("app-more-link", active && "is-active")}><Icon size={17} aria-hidden="true" /><span>{item.label}</span></Link>;
          })}
        </div>
        <button type="button" onClick={() => void signOut()} className="app-more-signout"><LogOut size={17} />Sign out</button>
      </section>

      <nav className="app-taskbar" aria-label="Điều hướng nhanh">
        {mobileNavItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={cn("app-taskbar-link", active && "is-active")}><Icon size={19} aria-hidden="true" /><span>{item.label}</span></Link>;
        })}
        <button type="button" aria-expanded={moreOpen} onClick={() => setMoreOpen((current) => !current)} className={cn("app-taskbar-link", (moreOpen || moreRouteActive) && "is-active")}>
          {moreOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}<span>Thêm</span>
        </button>
      </nav>
    </div>
  );
}

function SidebarDisclosure({ label, icon: Icon, open, active, onToggle, children }: { label: string; icon: typeof PackageOpen; open: boolean; active: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <div className="app-nav-disclosure">
    <button type="button" aria-expanded={open} onClick={onToggle} className={cn("app-nav-link app-nav-toggle", active && "has-active-child")}><Icon size={17} aria-hidden="true" /><span>{label}</span><ChevronDown size={14} className={cn("app-nav-chevron", open && "is-open")} aria-hidden="true" /></button>
    {open ? <div className="app-nav-sublist">{children}</div> : null}
  </div>;
}

function RoleBadge({ role }: { role: string }) {
  return <span className="app-role-badge">{role}</span>;
}
