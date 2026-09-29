"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, BarChart3, Bike, CalendarDays, CalendarOff, ChevronDown, ClipboardCheck, Columns2, ListChecks, LogOut, MapPinned, Menu, Moon, NotebookPen, PackageOpen, PackagePlus, PackageSearch, PanelLeftClose, PanelLeftOpen, PencilRuler, Radio, Repeat2, Sun, Truck, Upload, UsersRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/utils/cn";
import { AppBrand, AppCopyright } from "@/components/layout/app-brand";
import { AppLoadingOverlay } from "@/components/layout/app-loading-overlay";
import { NavigationPendingIndicator } from "@/components/layout/navigation-pending-indicator";
import { RouteReveal } from "@/components/layout/route-reveal";
import { QuickNoteButton } from "@/components/notes/quick-note-button";
import { OllamaChatbox } from "@/components/ai/ollama-chatbox";
import { OffRequestNotifications } from "@/components/layout/off-request-notifications";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/realtime-dashboard", label: "Realtime Dashboard", icon: Activity },
  { href: "/notes", label: "My Notes", icon: NotebookPen },
  { href: "/riders", label: "Riders", icon: Bike },
  { href: "/performance", label: "Performance", icon: BarChart3 },
  { href: "/attendance", label: "Attendance", icon: CalendarDays },
  { href: "/off-schedule", label: "Off Schedule", icon: CalendarOff },
  { href: "/morning-delivery", label: "Morning Dispatch", icon: ClipboardCheck },
  { href: "/return-orders", label: "Return Lookup", icon: PackageSearch },
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
const pickupItems = [
  { href: "/pickup-realtime", view: null, label: "Pickup Realtime", icon: Radio },
  { href: "/lmhub-inventory", view: null, label: "Tồn pickup", icon: PackageOpen },
  { href: "/inventory-delivery", view: null, label: "Tồn delivery", icon: Truck },
  { href: "/pickup-management", view: null, label: "Quản lý PUP", icon: ListChecks },
  { href: "/pickup-management?view=replacement", view: "replacement", label: "Thế pick", icon: Repeat2 },
];
const returnItems = [
  { href: "/return-orders?view=dashboard", view: "dashboard", label: "Tổng quan", icon: BarChart3 },
  { href: "/return-orders", view: null, label: "Tra cứu", icon: PackageSearch },
  { href: "/return-orders?view=rider", view: "rider", label: "Rider trả", icon: Truck },
  { href: "/return-orders?view=pivot", view: "pivot", label: "Phân công COT", icon: ListChecks },
];
const toolItems = [
  { href: "/zone-builder", label: "Zone Builder", icon: PencilRuler },
];
const memberHiddenItems = new Set(["/zone-builder", "/pickup-management"]);
const morePaths = ["/notes", "/performance", "/attendance", "/off-schedule", "/morning-delivery", "/return-orders", "/zones", "/zone-builder", "/pickup-management", "/pickup-realtime", "/lmhub-inventory", "/inventory-delivery", "/volume", "/imports", "/settings"];
type ThemeMode = "light" | "dark";
const subscribeToFrameContext = () => () => {};
