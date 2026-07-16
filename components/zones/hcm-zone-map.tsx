"use client";

import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Bike, MapPin, Users } from "lucide-react";
import { canonicalWardNames, splitLocationParts } from "@/lib/locations/hcm";
import { cn } from "@/utils/cn";
import { ZoneFilterPanel } from "@/components/zones/zone-filter-panel";
import { ZoneLegend } from "@/components/zones/zone-legend";
import { ZoneAddressSearch } from "@/components/zones/zone-address-search";
import {
  MAP_DISTRICTS,
  ZONE_COLORS,
  compactZoneName,
  wardLabel,
  zoneId,
  type LocationMode,
  type AddressPin,
  type OperationalZone,
  type ZoneFilters,
  type ZoneStatus,
  type ZoneRider,
} from "@/components/zones/zone-map-types";

const LeafletMap = dynamic(
  () => import("@/components/zones/hcm-leaflet-map").then((module) => module.HcmLeafletMap),
  { ssr: false, loading: () => <div className="h-[560px] animate-pulse rounded-2xl bg-slate-100 lg:h-[680px]" /> },
);

const modeOptions: Array<{ value: LocationMode; label: string }> = [
  { value: "pickup", label: "Khu vực lấy" },
  { value: "delivery", label: "Khu vực giao" },
  { value: "home", label: "Nơi ở" },
];

const initialFilters: ZoneFilters = { query: "", area: "all", districtId: "all", wardId: "all", status: "all" };

export function HcmZoneMap({ riders }: { riders: ZoneRider[] }) {
  const [mode, setMode] = useState<LocationMode>("delivery");
  const [filters, setFilters] = useState<ZoneFilters>(initialFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [addressPin, setAddressPin] = useState<AddressPin | null>(null);

  const deferredFilters = useDeferredValue(filters);
  const ridersByZone = useMemo(() => indexRidersByZone(riders, mode), [mode, riders]);
  const zones = useMemo(() => buildOperationalZones(ridersByZone), [ridersByZone]);
  const filteredZones = useMemo(() => zones.filter((zone) => matchesFilters(zone, deferredFilters)), [deferredFilters, zones]);
  const visibleZoneIds = useMemo(() => filteredZones.map((zone) => zone.id), [filteredZones]);
  const visibleSelectedZoneId = selectedZoneId && visibleZoneIds.includes(selectedZoneId) ? selectedZoneId : null;
  const singleSearchMatchId = deferredFilters.query.trim() && filteredZones.length === 1 ? filteredZones[0]?.id ?? null : null;
  const activeSelectedZoneId = visibleSelectedZoneId ?? singleSearchMatchId;
  const selectedZone = zones.find((zone) => zone.id === activeSelectedZoneId) ?? null;
  const selectedZoneRiders = activeSelectedZoneId ? ridersByZone.get(activeSelectedZoneId) ?? [] : [];

  const selectZone = useCallback((id: string) => {
    setAddressPin(null);
    setSelectedZoneId(id);
  }, []);
  const showAddress = useCallback((pin: AddressPin) => {
    setFilters(initialFilters);
    setSelectedZoneId(null);
    setAddressPin(pin);
  }, []);
  const clearAddress = useCallback(() => {
    setAddressPin(null);
    setSelectedZoneId(null);
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><MapPin size={20} /></span><div><h2 className="font-bold text-slate-950">Bản đồ zone KV5 & KV6</h2><p className="text-sm text-slate-500">Tìm, lọc và chọn phường/xã để xem quân số vận hành</p></div></div>
        <div className="flex w-full rounded-xl bg-slate-100 p-1 lg:w-auto">{modeOptions.map((option) => <button key={option.value} type="button" onClick={() => setMode(option.value)} className={cn("flex-1 rounded-lg px-4 py-2 text-xs font-semibold transition sm:text-sm lg:flex-none", mode === option.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800")}>{option.label}</button>)}</div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
        <div className="space-y-4">
          <ZoneAddressSearch pin={addressPin} matchedZoneName={addressPin ? selectedZone?.name ?? null : null} onResult={showAddress} onClear={clearAddress} />
          <ZoneFilterPanel filters={filters} districts={MAP_DISTRICTS} zones={zones} matchingZones={filteredZones} resultCount={filteredZones.length} open={filtersOpen} onOpenChange={setFiltersOpen} onChange={setFilters} onSelectZone={selectZone} />
        </div>
        <LeafletMap zones={zones} visibleZoneIds={visibleZoneIds} selectedZoneId={activeSelectedZoneId} addressPin={addressPin} onAddressZoneMatch={setSelectedZoneId} onSelectZone={selectZone} />
      </div>

      <ZoneLegend capacityConfigured={zones.some((zone) => zone.capacity !== null)} />

      {selectedZone ? (
        <div className="grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold uppercase tracking-wider text-blue-600">{selectedZone.code}</p><h3 className="mt-1 text-xl font-black text-slate-950">{selectedZone.name}</h3><p className="mt-1 text-sm text-slate-500">{selectedZone.area} · {statusLabel(selectedZone.status)}</p></div><span className="grid size-12 place-items-center rounded-xl text-white shadow-sm" style={{ backgroundColor: selectedZone.color }}><MapPin size={20} /></span></div>
            <div className="mt-5 grid grid-cols-2 gap-3"><Metric icon={<Users size={16} />} label="Tổng rider" value={selectedZone.riderCount} /><Metric icon={<Bike size={16} />} label="Đang active" value={selectedZone.activeRiderCount} /></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h4 className="font-bold text-slate-950">Rider trong zone</h4><span className="text-xs font-semibold text-slate-500">{selectedZoneRiders.length} rider</span></div><div className="mt-3 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">{selectedZoneRiders.map((rider) => <div key={rider.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-50 p-2.5"><span className="shrink-0 rounded-lg bg-white px-2 py-1 font-mono text-xs font-bold text-slate-700 shadow-sm">{rider.rider_code}</span><span className="min-w-0 truncate text-sm font-semibold text-slate-800">{rider.full_name || "Chưa có tên"}</span></div>)}{selectedZoneRiders.length === 0 ? <p className="text-sm text-slate-500">Zone chưa có rider theo chế độ đang xem.</p> : null}</div></div>
        </div>
      ) : null}
    </section>
  );
}

function buildOperationalZones(ridersByZone: Map<string, ZoneRider[]>) {
  let colorIndex = 0;
  return MAP_DISTRICTS.flatMap((district) => district.wards.map((ward) => {
    const zoneRiders = ridersByZone.get(zoneId(district.id, ward)) ?? [];
    const activeRiders = zoneRiders.filter((rider) => rider.status !== "inactive").length;
    const capacity: number | null = null;
    const status: ZoneStatus = capacity !== null && activeRiders >= capacity ? "full" : activeRiders > 0 ? "active" : "inactive";
    const color = ZONE_COLORS[colorIndex++ % ZONE_COLORS.length];
    return { id: zoneId(district.id, ward), code: `${district.area}-${district.code}-${compactZoneName(ward).toUpperCase()}`, name: `${wardLabel(ward)} · ${district.shortName}`, districtId: district.id, districtName: district.name, ward, area: district.area, color, status, riderCount: zoneRiders.length, activeRiderCount: activeRiders, capacity } satisfies OperationalZone;
  }));
}

function indexRidersByZone(riders: ZoneRider[], mode: LocationMode) {
  const index = new Map<string, ZoneRider[]>();
  if (mode === "home") return index;

  for (const rider of riders) {
    const districtValueForRider = districtValue(rider, mode);
    const district = MAP_DISTRICTS.find((candidate) => matchesDistrict(districtValueForRider, candidate));
    if (!district) continue;
    const rawWard = wardValue(rider, mode);
    const canonicalWards = canonicalWardNames(districtValueForRider, rawWard);
    const wardParts = canonicalWards.length > 0 ? canonicalWards : splitLocationParts(rawWard);
    const uniqueZoneIds = new Set(wardParts.map((ward) => zoneId(district.id, ward)));
    for (const id of uniqueZoneIds) {
      const zoneRiders = index.get(id);
      if (zoneRiders) zoneRiders.push(rider);
      else index.set(id, [rider]);
    }
  }
  return index;
}

function matchesFilters(zone: OperationalZone, filters: ZoneFilters) {
  const query = normalize(filters.query);
  return (!query || normalize(`${zone.name} ${zone.code}`).includes(query)) && (filters.area === "all" || zone.area === filters.area) && (filters.districtId === "all" || zone.districtId === filters.districtId) && (filters.wardId === "all" || zone.id === filters.wardId) && (filters.status === "all" || zone.status === filters.status);
}

function normalize(value: string | null | undefined) { return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/\b(phuong|p\.?|ward|xa|thi tran|tt\.?)\b/g, "").replace(/[.,/_-]+/g, " ").replace(/\s+/g, " ").trim(); }
function districtValue(rider: ZoneRider, mode: LocationMode) { return mode === "pickup" ? rider.pickup_district : mode === "delivery" ? rider.delivery_district : rider.home_district; }
function wardValue(rider: ZoneRider, mode: LocationMode) { return mode === "pickup" ? rider.pickup_ward : mode === "delivery" ? rider.delivery_ward : null; }
function matchesDistrict(value: string | null, district: (typeof MAP_DISTRICTS)[number]) { const normalized = normalize(value); return district.aliases.some((alias) => normalized === normalize(alias) || normalized.startsWith(`${normalize(alias)} `)); }
function statusLabel(status: ZoneStatus) { return status === "full" ? "Đầy tải" : status === "active" ? "Đang hoạt động" : "Không hoạt động"; }
function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) { return <div className="rounded-xl bg-slate-50 p-3"><span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">{icon}{label}</span><p className="mt-2 text-2xl font-black text-slate-950">{value}</p></div>; }
