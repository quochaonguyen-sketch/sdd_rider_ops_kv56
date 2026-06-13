"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Bike, MapPin, Users } from "lucide-react";
import type { Rider } from "@/types";
import { cn } from "@/utils/cn";

type LocationMode = "pickup" | "delivery" | "home";

type DistrictDefinition = {
  id: string;
  name: string;
  shortName: string;
  aliases: string[];
  color: string;
  wards: string[];
};

const LeafletMap = dynamic(
  () => import("@/components/zones/hcm-leaflet-map").then((module) => module.HcmLeafletMap),
  { ssr: false, loading: () => <div className="h-[620px] animate-pulse rounded-2xl bg-slate-100" /> },
);

const districts: DistrictDefinition[] = [
  {
    id: "go-vap",
    name: "Quận Gò Vấp",
    shortName: "Gò Vấp",
    aliases: ["go vap", "quan go vap", "q go vap", "qgv"],
    color: "#2563eb",
    wards: ["1", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17"],
  },
  {
    id: "quan-12",
    name: "Quận 12",
    shortName: "Quận 12",
    aliases: ["12", "quan 12", "q12", "district 12"],
    color: "#7c3aed",
    wards: ["An Phú Đông", "Đông Hưng Thuận", "Hiệp Thành", "Tân Chánh Hiệp", "Tân Hưng Thuận", "Tân Thới Hiệp", "Tân Thới Nhất", "Thạnh Lộc", "Thạnh Xuân", "Thới An", "Trung Mỹ Tây"],
  },
  {
    id: "hoc-mon",
    name: "Huyện Hóc Môn",
    shortName: "Hóc Môn",
    aliases: ["hoc mon", "huyen hoc mon", "hocmon", "hm"],
    color: "#dc2626",
    wards: ["Bà Điểm", "Đông Thạnh", "Hóc Môn", "Nhị Bình", "Tân Hiệp", "Tân Thới Nhì", "Tân Xuân", "Thới Tam Thôn", "Trung Chánh", "Xuân Thới Đông", "Xuân Thới Sơn", "Xuân Thới Thượng"],
  },
  {
    id: "binh-thanh",
    name: "Quận Bình Thạnh",
    shortName: "Bình Thạnh",
    aliases: ["binh thanh", "quan binh thanh", "q binh thanh", "qbt"],
    color: "#0891b2",
    wards: ["1", "2", "3", "5", "6", "7", "11", "12", "13", "14", "15", "17", "19", "21", "22", "24", "25", "26", "27", "28"],
  },
  {
    id: "quan-3",
    name: "Quận 3",
    shortName: "Quận 3",
    aliases: ["3", "quan 3", "q3", "district 3"],
    color: "#f59e0b",
    wards: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"],
  },
  {
    id: "quan-2",
    name: "Quận 2",
    shortName: "Quận 2",
    aliases: ["2", "quan 2", "q2", "district 2", "thu duc quan 2"],
    color: "#10b981",
    wards: ["An Khánh", "An Lợi Đông", "An Phú", "Bình An", "Bình Khánh", "Bình Trưng Đông", "Bình Trưng Tây", "Cát Lái", "Thạnh Mỹ Lợi", "Thảo Điền", "Thủ Thiêm"],
  },
];

const modeOptions: Array<{ value: LocationMode; label: string }> = [
  { value: "pickup", label: "Khu vực lấy" },
  { value: "delivery", label: "Khu vực giao" },
  { value: "home", label: "Nơi ở" },
];

export function HcmZoneMap({ riders }: { riders: Rider[] }) {
  const [mode, setMode] = useState<LocationMode>("pickup");
  const [selectedId, setSelectedId] = useState(districts[0].id);
  const [zoomed, setZoomed] = useState(false);
  const selectedDistrict = districts.find((district) => district.id === selectedId) ?? districts[0];

  const selectedRiders = useMemo(
    () => riders.filter((rider) => matchesDistrict(districtValue(rider, mode), selectedDistrict)),
    [mode, riders, selectedDistrict],
  );

  const wardCounts = useMemo(
    () =>
      selectedDistrict.wards.map((ward) => {
        const wardRiders = selectedRiders
          .filter((rider) => normalize(wardValue(rider, mode)) === normalize(ward))
          .sort((a, b) => {
            const codeCompare = a.rider_code.localeCompare(b.rider_code, "vi");
            return codeCompare || (a.full_name ?? "").localeCompare(b.full_name ?? "", "vi");
          });
        return {
          ward,
          count: wardRiders.length,
          cotCounts: summarizeCot(wardRiders),
          riders: wardRiders.map((rider) => ({
            id: rider.id,
            rider_code: rider.rider_code,
            full_name: rider.full_name,
            cot: rider.cot,
          })),
        };
      }),
    [mode, selectedDistrict, selectedRiders],
  );

  const cotCounts = useMemo(() => summarizeCot(selectedRiders), [selectedRiders]);
  const sortedWardCounts = useMemo(
    () => [...wardCounts].sort((a, b) => b.count - a.count || a.ward.localeCompare(b.ward, "vi")),
    [wardCounts],
  );
  const maxWardCount = Math.max(1, ...wardCounts.map(({ count }) => count));
  const maxCotCount = Math.max(1, ...cotCounts.map(({ count }) => count));

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <MapPin size={20} />
          </span>
          <div>
            <h2 className="font-bold text-slate-950">Bản đồ rider TP. Hồ Chí Minh</h2>
            <p className="text-sm text-slate-500">Bấm quận/huyện để xem màu từng phường, xã và số rider</p>
          </div>
        </div>
        <div className="flex w-full rounded-xl bg-slate-100 p-1 lg:w-auto">
          {modeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              className={cn(
                "flex-1 rounded-lg px-4 py-2 text-xs font-semibold transition sm:text-sm lg:flex-none",
                mode === option.value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <LeafletMap
        selectedId={selectedId}
        zoomed={zoomed}
        wardCounts={wardCounts}
        showWards={mode !== "home"}
        onSelect={(id) => {
          setSelectedId(id);
          setZoomed(true);
        }}
        onZoomOut={() => setZoomed(false)}
      />

      <div className="flex flex-wrap gap-2">
        {districts.map((district) => (
          <button
            key={district.id}
            type="button"
            onClick={() => {
              setSelectedId(district.id);
              setZoomed(true);
            }}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition",
              selectedId === district.id
                ? "border-slate-300 bg-white text-slate-950 shadow-sm"
                : "border-transparent bg-slate-100 text-slate-500 hover:bg-white",
            )}
          >
            <span className="size-2.5 rounded-full" style={{ backgroundColor: district.color }} />
            {district.shortName}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider" style={{ color: selectedDistrict.color }}>
                Chi tiết khu vực
              </p>
              <h3 className="mt-1 text-xl font-black text-slate-950">{selectedDistrict.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{selectedDistrict.wards.length} phường/xã</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-2 text-center">
              <Users size={17} className="mx-auto" style={{ color: selectedDistrict.color }} />
              <p className="mt-1 text-xl font-black text-slate-950">{selectedRiders.length}</p>
              <p className="text-[10px] font-bold uppercase text-slate-400">rider</p>
            </div>
          </div>

          <h4 className="mt-5 text-sm font-bold text-slate-900">Chia theo COT</h4>
          <div className="mt-3 space-y-2">
            {cotCounts.map(({ cot, count }) => (
              <div key={cot} className="rounded-xl bg-slate-50 p-3">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-700">{cot}</span>
                  <strong>{count} rider</strong>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(8, (count / maxCotCount) * 100)}%`, backgroundColor: selectedDistrict.color }} />
                </div>
              </div>
            ))}
            {cotCounts.length === 0 ? <p className="text-sm text-slate-500">Chưa có rider trong khu vực.</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-950">Rider theo phường/xã</h4>
            <span className="text-xs font-semibold text-slate-500">{sortedWardCounts.length} khu vực</span>
          </div>
          {mode === "home" ? (
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
              Dữ liệu hiện chỉ có quận nơi ở, chưa có phường nơi ở của rider.
            </p>
          ) : (
            <div className="mt-4 grid max-h-[430px] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
              {sortedWardCounts.map(({ ward, count, cotCounts: wardCots }) => (
                <div key={ward} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800">
                      <Bike size={15} style={{ color: selectedDistrict.color }} />
                      <span className="truncate">{/^\d+$/.test(ward) ? `Phường ${ward}` : ward}</span>
                    </span>
                    <strong className="shrink-0 text-sm">{count}</strong>
                  </div>
                  {wardCots.length > 0 ? (
                    <p className="mt-1 truncate text-[11px] text-slate-500">
                      {wardCots.map(({ cot, count: cotCount }) => `${cot}: ${cotCount}`).join(" · ")}
                    </p>
                  ) : null}
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${count ? Math.max(8, (count / maxWardCount) * 100) : 0}%`, backgroundColor: selectedDistrict.color }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\b(phuong|p\.?|ward|xa|thi tran|tt\.?)\b/g, "")
    .replace(/[.,/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function districtValue(rider: Rider, mode: LocationMode) {
  if (mode === "pickup") return rider.pickup_district;
  if (mode === "delivery") return rider.delivery_district;
  return rider.home_district;
}

function wardValue(rider: Rider, mode: LocationMode) {
  if (mode === "pickup") return rider.pickup_ward;
  if (mode === "delivery") return rider.delivery_ward;
  return null;
}

function matchesDistrict(value: string | null, district: DistrictDefinition) {
  const normalized = normalize(value);
  return district.aliases.some((alias) => {
    const normalizedAlias = normalize(alias);
    return normalized === normalizedAlias || normalized.startsWith(`${normalizedAlias} `);
  });
}

function summarizeCot(riders: Rider[]) {
  const counts = new Map<string, number>();
  for (const rider of riders) {
    const cot = rider.cot?.trim() || "Chưa có COT";
    counts.set(cot, (counts.get(cot) ?? 0) + 1);
  }
  return Array.from(counts, ([cot, count]) => ({ cot, count })).sort(
    (a, b) => b.count - a.count || a.cot.localeCompare(b.cot, "vi"),
  );
}
