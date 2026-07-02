"use client";

import { useState } from "react";
import { ListChecks, Repeat2 } from "lucide-react";
import { PickupManagementView } from "@/components/pickup/pickup-management-view";
import { PickupReplacementView } from "@/components/pickup/pickup-replacement-view";
import { cn } from "@/utils/cn";

export function PickupToolsView() { const [tab, setTab] = useState<"assignments" | "replacement">("assignments"); return <div className="space-y-5"><div className="inline-flex rounded-xl border border-slate-200 bg-white p-1"><Tab active={tab === "assignments"} onClick={() => setTab("assignments")} icon={<ListChecks size={16} />} label="Quản lý PUP" /><Tab active={tab === "replacement"} onClick={() => setTab("replacement")} icon={<Repeat2 size={16} />} label="Thế pick" /></div>{tab === "assignments" ? <PickupManagementView /> : <PickupReplacementView />}</div>; }
function Tab({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button type="button" onClick={onClick} className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition", active ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100")}>{icon}{label}</button>; }
