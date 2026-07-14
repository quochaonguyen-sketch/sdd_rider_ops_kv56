"use client";

import { useState } from "react";
import { LoaderCircle, LocateFixed, MapPin, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AddressPin } from "@/components/zones/zone-map-types";

type GeocodeResponse = {
  success: boolean;
  result?: {
    lat: number;
    lng: number;
    display_name: string;
    ward: string | null;
    district: string | null;
  };
  error?: string;
};

type ZoneAddressSearchProps = {
  pin: AddressPin | null;
  matchedZoneName: string | null;
  onResult: (pin: AddressPin) => void;
  onClear: () => void;
};

export function ZoneAddressSearch({ pin, matchedZoneName, onResult, onClear }: ZoneAddressSearchProps) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function searchAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (cleanQuery.length < 3) return setError("Nhập địa chỉ cụ thể hơn.");
    setSearching(true);
    setError(null);
    const response = await fetch(`/api/geocode?q=${encodeURIComponent(cleanQuery)}`, { cache: "no-store" });
    const body = await response.json().catch(() => null) as GeocodeResponse | null;
    setSearching(false);
    if (!response.ok || !body?.success || !body.result) return setError(body?.error ?? "Không tìm thấy địa chỉ");
    onResult({ lat: body.result.lat, lng: body.result.lng, displayName: body.result.display_name, sourceWard: body.result.ward, sourceDistrict: body.result.district });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 font-bold text-slate-950"><LocateFixed size={17} className="text-rose-600" /> Tìm địa chỉ</div>
      <form className="mt-3 space-y-2" onSubmit={searchAddress}>
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Số nhà, đường, quận..." maxLength={200} /></div>
        <Button type="submit" className="w-full" disabled={searching || query.trim().length < 3}>{searching ? <LoaderCircle className="animate-spin" size={16} /> : <MapPin size={16} />}{searching ? "Đang tìm..." : "Hiện vị trí trên map"}</Button>
      </form>
      {error ? <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-2 text-xs text-red-700">{error}</p> : null}
      {pin ? <div className="mt-3 rounded-xl bg-blue-50 p-3"><div className="flex items-start gap-2"><span className="mt-0.5 size-2.5 shrink-0 rounded-full bg-rose-500 ring-4 ring-rose-100" /><div className="min-w-0"><p className="text-xs font-bold text-blue-950">{matchedZoneName ?? "Ngoài phạm vi zone hiện có"}</p><p className="mt-1 line-clamp-2 text-[11px] leading-4 text-blue-700">{pin.displayName}</p></div><button type="button" aria-label="Xóa vị trí" className="ml-auto grid size-7 shrink-0 place-items-center rounded-lg text-blue-500 hover:bg-blue-100" onClick={onClear}><X size={14} /></button></div></div> : null}
      <p className="mt-3 text-[10px] leading-4 text-slate-400">Tìm kiếm khi bấm nút · Dữ liệu địa chỉ © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="font-semibold underline hover:text-slate-600">OpenStreetMap contributors</a></p>
    </section>
  );
}
