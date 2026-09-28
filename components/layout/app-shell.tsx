"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Activity, BarChart3, Bike, CalendarDays, CalendarOff, ChevronDown, ClipboardCheck, Columns2, ListChecks, ListTodo, LogOut, MapPinned, Menu, Moon, NotebookPen, PackageOpen, PackagePlus, PackageSearch, PanelLeftClose, PanelLeftOpen, PencilRuler, Radio, Repeat2, Sun, Truck, Upload, UsersRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/utils/cn";
import { AppBrand, AppCopyright } from "@/components/layout/app-brand";
import { AppLoadingOverlay } from "@/components/layout/app-loading-overlay";
import { NavigationPendingIndicator } from "@/components/layout/navigation-pending-indicator";
import { RouteReveal } from "@/components/layout/route-reveal";
import { QuickNoteButton } from "@/components/notes/quick-note-button";
import { OllamaChatbox } from "@/components/ai/ollama-chatbox";
import { OffRequestNotifications } from "@/components/layout/off-request-notifications";
