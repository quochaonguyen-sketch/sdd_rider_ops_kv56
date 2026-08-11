"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ListChecks, Repeat2 } from "lucide-react";
import { PickupManagementView } from "@/components/pickup/pickup-management-view";
import { PickupReplacementView } from "@/components/pickup/pickup-replacement-view";
import { cn } from "@/utils/cn";
import styles from "./pickup-tools-view.module.css";

export function PickupToolsView() {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "replacement" ? "replacement" : "assignments";

  return (
    <div className={styles.layout}>
      <nav className={styles.mobileSwitcher} aria-label="Chức năng Pickup">
        <ToolLink href="/pickup-management" active={view === "assignments"} icon={<ListChecks size={16} />} label="Quản lý PUP" />
        <ToolLink href="/pickup-management?view=replacement" active={view === "replacement"} icon={<Repeat2 size={16} />} label="Thế pick" />
      </nav>
      {view === "assignments" ? <PickupManagementView /> : <PickupReplacementView />}
    </div>
  );
}

function ToolLink({ href, active, icon, label }: { href: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "page" : undefined} className={cn(styles.toolLink, active && styles.activeToolLink)}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
