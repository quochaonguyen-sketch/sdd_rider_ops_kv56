"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PackageSearch, Truck, ListChecks } from "lucide-react";
import { cn } from "@/utils/cn";
import { returnViewFrom, type ReturnView } from "@/lib/return-orders/return-orders";

const VIEWS: Array<{ id: ReturnView; href: string; label: string; icon: typeof PackageSearch }> = [
  { id: "ledger", href: "/return-orders", label: "Tra cứu", icon: PackageSearch },
  { id: "rider", href: "/return-orders?view=rider", label: "Rider trả", icon: Truck },
  { id: "pivot", href: "/return-orders?view=pivot", label: "Phân công COT", icon: ListChecks },
];

export function ReturnOrdersSwitcher() {
  const searchParams = useSearchParams();
  const active = returnViewFrom(searchParams.get("view"));

  return (
    <nav className="return-orders-tabs" aria-label="Phân trang hàng trả">
      {VIEWS.map((viewItem) => {
        const Icon = viewItem.icon;
        return (
          <Link
            key={viewItem.id}
            href={viewItem.href}
            scroll={false}
            aria-current={active === viewItem.id ? "page" : undefined}
            className={cn("return-orders-tab", active === viewItem.id && "is-active")}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{viewItem.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
