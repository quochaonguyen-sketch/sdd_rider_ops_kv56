/**
 * Recommend replacement riders for a rider who is OFF on a pickup shift.
 *
 * Priority (top first):
 *   1. Assignment history  – riders previously assigned as the replacement for
 *      this rider within the last N weeks (historyCount > 0).
 *   2. Same ward           – candidates operating in the same pickup ward.
 *   3. Nearby wards        – candidates in the same pickup district but a
 *      different ward.
 *
 * Constraints:
 *   - COT families are kept separate: a COT2 rider is never recommended to
 *     replace a COT1 rider and vice versa (applies when the replaced rider has
 *     a COT family; riders without a COT accept any candidate).
 *   - Within each tier, candidates are ordered by the pickup volume of their
 *     ward, low volume first (wards with no volume data sort last).
 */

import type { Rider } from "../../types.ts";

export type RecommendReason = "history" | "ward" | "nearby";

export type RecommendedRider = {
  rider: Rider;
  reason: RecommendReason;
  historyCount: number;
  volume: number;
  /** 1-based display order of this recommendation. */
  priority: number;
};

export type RecommendationContext = {
  /** History counts keyed by `${rider_code}|${replacement_rider_code}`. */
  history?: Map<string, number>;
  /** Pickup volume per ward keyed by `${districtKey}|${wardKey}`. */
  wardVolume?: Map<string, number>;
};

/**
 * Build the sorted list of recommended replacement riders for a rider.
 * `candidates` must already be filtered to riders who can actually replace
 * (active, not OFF on the date, excluding the rider themselves).
 */
export function recommendReplacementRiders({
  rider,
  candidates,
  history = new Map(),
  wardVolume = new Map(),
  limit = 5,
}: {
  rider: Rider;
  candidates: Rider[];
  history?: Map<string, number>;
  wardVolume?: Map<string, number>;
  limit?: number;
}): RecommendedRider[] {
  const riderCot = cotFamily(rider.cot);
  const riderWardKey = wardKey(rider.pickup_district, rider.pickup_ward);
  const riderDistrictKey = districtKey(rider.pickup_district);

  const scored = candidates
    .filter((candidate) => candidate.id !== rider.id)
    .filter((candidate) => !riderCot || cotFamily(candidate.cot) === riderCot)
    .map((candidate) => {
      const historyCount =
        history.get(`${rider.rider_code}|${candidate.rider_code}`) ?? 0;
      const candidateWardKey = wardKey(
        candidate.pickup_district,
        candidate.pickup_ward,
      );
      const candidateDistrictKey = districtKey(candidate.pickup_district);
      const sameWard =
        Boolean(riderWardKey) && riderWardKey === candidateWardKey;
      const sameDistrict =
        !sameWard &&
        Boolean(riderDistrictKey) &&
        riderDistrictKey === candidateDistrictKey;
      const tier =
        historyCount > 0
          ? 0
          : sameWard
            ? 1
            : sameDistrict
              ? 2
              : Number.POSITIVE_INFINITY;
      const volume = wardVolume.get(candidateWardKey) ?? Number.POSITIVE_INFINITY;
      return { candidate, tier, historyCount, volume };
    })
    .filter((entry) => Number.isFinite(entry.tier));

  scored.sort(
    (a, b) =>
      a.tier - b.tier ||
      b.historyCount - a.historyCount ||
      a.volume - b.volume ||
      (a.candidate.pickup_district ?? "").localeCompare(
        b.candidate.pickup_district ?? "",
        "vi",
        { numeric: true },
      ) ||
      (a.candidate.pickup_ward ?? "").localeCompare(
        b.candidate.pickup_ward ?? "",
        "vi",
        { numeric: true },
      ) ||
      a.candidate.rider_code.localeCompare(b.candidate.rider_code, "vi", {
        numeric: true,
      }),
  );

  return scored.slice(0, Math.max(1, limit)).map((entry, index) => ({
    rider: entry.candidate,
    reason:
      entry.tier === 0 ? "history" : entry.tier === 1 ? "ward" : "nearby",
    historyCount: entry.historyCount,
    volume: Number.isFinite(entry.volume) ? entry.volume : 0,
    priority: index + 1,
  }));
}

/** Normalized key for a pickup ward, tolerant of prefixes ("Phường 12" == "12" == "P12"). */
export function wardKey(
  district: string | null | undefined,
  ward: string | null | undefined,
): string {
  return `${districtKey(district)}|${normalizeWardText(ward)}`;
}

/** Normalized key for a pickup district, tolerant of prefixes ("Quận 12" == "Q12" == "12"). */
export function districtKey(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/^(?:quan|huyen|district|q)(?=\s|\d|$)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** COT family: "COT1" | "COT2" | "" (empty when the value has no COT family). */
export function cotFamily(value: string | null | undefined): "COT1" | "COT2" | "" {
  const normalized = normalizeText(value).replace(/[^a-z0-9]/g, "");
  if (/^cot?1/.test(normalized) || normalized === "1") return "COT1";
  if (/^cot?2/.test(normalized) || normalized === "2") return "COT2";
  return "";
}

function normalizeWardText(value: string | null | undefined): string {
  return normalizeText(value)
    .replace(/^(?:phuong|ward|xa|thi tran|tt|p)(?=\s|\d|$)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[.,/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}