export type WardSourceRider = {
  cot?: string | null;
  delivery_district?: string | null;
  delivery_ward?: string | null;
  pickup_district?: string | null;
  pickup_ward?: string | null;
};

export type OperatingArea = {
  district: string | null;
  ward: string | null;
  source: "pickup" | "delivery" | "pickup_fallback" | "delivery_fallback";
};

/**
 * Ward a rider operates in. COT1 riders primarily run pickup, everyone else
 * primarily runs delivery; falls back to the other field when empty.
 */
export function operatingArea(rider: WardSourceRider): OperatingArea {
  if (isCotOne(rider.cot)) {
    return {
      district: rider.pickup_district ?? rider.delivery_district ?? null,
      ward: rider.pickup_ward ?? rider.delivery_ward ?? null,
      source: rider.pickup_district || rider.pickup_ward ? "pickup" : "delivery_fallback",
    };
  }
  return {
    district: rider.delivery_district ?? rider.pickup_district ?? null,
    ward: rider.delivery_ward ?? rider.pickup_ward ?? null,
    source: rider.delivery_district || rider.delivery_ward ? "delivery" : "pickup_fallback",
  };
}

/**
 * Area used for OFF scheduling decisions: always the DELIVERY (giao) ward when
 * available, falling back to pickup. Riders are grouped by the ward they
 * deliver to, not the ward they pick up from.
 */
export function offArea(rider: WardSourceRider): OperatingArea {
  return {
    district: rider.delivery_district ?? rider.pickup_district ?? null,
    ward: rider.delivery_ward ?? rider.pickup_ward ?? null,
    source: rider.delivery_district || rider.delivery_ward ? "delivery" : "pickup_fallback",
  };
}

export function normalizeWard(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("vi");
}

export function normalizeDistrict(value: string | null | undefined) {
  const normalized = normalizeWard(value).replace(/[^a-z0-9]/g, "");
  const districtNumber = normalized.match(/^(?:quan|q)0*(\d{1,2})$/)?.[1];
  return districtNumber ? `quan${Number(districtNumber)}` : normalized;
}

export function isDistrict12(value: string | null | undefined) {
  return normalizeDistrict(value) === "quan12";
}

/**
 * Normalize a rider COT to a stable label. Returns "COT1"/"COT2" or "" when the
 * rider has no COT. Used to keep COT1 and COT2 separate: two riders are only
 * "same group" when both have the same COT (both COT1, both COT2, or both none).
 */
export function normalizeCot(value: string | null | undefined) {
  const normalized = normalizeWard(value).replace(/[^a-z0-9]/g, "");
  if (normalized === "cot1" || normalized === "1") return "COT1";
  if (normalized === "cot2" || normalized === "2") return "COT2";
  return "";
}

function isCotOne(value: string | null | undefined) {
  const normalized = normalizeWard(value).replace(/[^a-z0-9]/g, "");
  return normalized === "cot1" || normalized === "1";
}
