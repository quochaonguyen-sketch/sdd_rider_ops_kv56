import { normalizeCot, normalizeWard, offArea, type WardSourceRider } from "./ward.ts";

export type ConflictRequest = {
  id: string;
  rider_id: string;
  rider_code: string;
  off_date: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
};

export type ConflictRiderInfo = WardSourceRider & {
  full_name?: string | null;
};

export type WardConflict = {
  ward: string;
  cot: string | null;
  count: number;
  has_approved: boolean;
  riders: Array<{
    rider_code: string;
    full_name: string | null;
    status: "PENDING" | "APPROVED";
  }>;
};

/**
 * Pure helper: for every request, find other non-rejected requests of the SAME
 * ward, SAME COT and SAME date. Used to warn a coordinator that a ward would
 * have more than one rider off on one day. COT1 and COT2 are kept separate:
 * a COT1 rider off next to a COT2 rider of the same ward is NOT a conflict.
 */
export function computeWardOffConflicts(
  requests: ConflictRequest[],
  riderById: Map<string, ConflictRiderInfo>,
): Map<string, WardConflict> {
  const groups = new Map<string, ConflictRequest[]>();
  for (const item of requests) {
    if (item.status === "REJECTED") continue;
    const rider = riderById.get(item.rider_id);
    if (!rider) continue;
    const ward = normalizeWard(offArea(rider).ward);
    if (!ward) continue;
    const cot = normalizeCot(rider.cot) || null;
    const key = `${ward}|${cot ?? ""}|${item.off_date}`;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const conflicts = new Map<string, WardConflict>();
  for (const [key, items] of groups) {
    if (items.length < 2) continue;
    const parts = key.split("|");
    const ward = parts[0];
    const cot = parts[1] || null;
    for (const item of items) {
      const others = items.filter(
        (other) => other.id !== item.id && other.status !== "REJECTED",
      );
      if (!others.length) continue;
      const displayWard = originalWard(riderById.get(item.rider_id));
      conflicts.set(item.id, {
        ward: displayWard || ward,
        cot,
        count: others.length,
        has_approved: others.some((other) => other.status === "APPROVED"),
        riders: others.map((other) => ({
          rider_code: other.rider_code,
          full_name: riderById.get(other.rider_id)?.full_name ?? null,
          status: other.status as "PENDING" | "APPROVED",
        })),
      });
    }
  }
  return conflicts;
}

function originalWard(rider: ConflictRiderInfo | undefined) {
  return rider ? offArea(rider).ward : null;
}
