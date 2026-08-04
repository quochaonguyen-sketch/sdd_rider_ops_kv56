export type PickupZonePoint = {
  label: string;
  address: string;
  lat: number;
  lng: number;
  count: number;
};

export type PickupZoneRoute = {
  route: string;
  total: number;
  pointCount: number;
  points: Array<{ label: string; address: string; lat: number; lng: number; count: number }>;
  polygon: Array<[number, number]>;
  centroid: [number, number];
};

export type PickupGovapZonePayload = {
  success: true;
  work_date: string;
  total_rows: number;
  unique_addresses: number;
  routes: PickupZoneRoute[];
  points: PickupZonePoint[];
};

export function normalizePickupLabel(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\b(phuong|p\.?|ward|xa|quan|q\.?|district|thanh pho|tp\.?|hcm|ho chi minh|city)\b/g, "")
    .replace(/[.,/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildConvexHull(points: Array<[number, number]>) {
  const unique = Array.from(new Map(points.map((point) => [`${point[0].toFixed(6)}:${point[1].toFixed(6)}`, point])).values());
  if (unique.length === 0) return [];
  if (unique.length === 1) return makeBox(unique[0], 0.01);
  if (unique.length === 2) return makeDiamond(unique);

  const sorted = unique.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower: Array<[number, number]> = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: Array<[number, number]> = [];
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  const hull = [...lower, ...upper];
  return hull.length >= 3 ? closePolygon(hull) : makeBox(centerOf(unique), 0.008);
}

export function centroidOf(points: Array<[number, number]>) {
  if (points.length === 0) return [106.68, 10.84] as [number, number];
  const total = points.reduce(
    (acc, point) => ({
      lng: acc.lng + point[0],
      lat: acc.lat + point[1],
    }),
    { lng: 0, lat: 0 },
  );
  return [total.lng / points.length, total.lat / points.length] as [number, number];
}

function centerOf(points: Array<[number, number]>) {
  return centroidOf(points);
}

function makeBox(center: [number, number], delta: number) {
  const [lng, lat] = center;
  return closePolygon([
    [lng - delta, lat - delta],
    [lng + delta, lat - delta],
    [lng + delta, lat + delta],
    [lng - delta, lat + delta],
  ]);
}

function makeDiamond(points: Array<[number, number]>) {
  const [a, b] = points;
  const center = centroidOf(points);
  const spread = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), 0.006);
  return closePolygon([
    [center[0], center[1] - spread],
    [center[0] + spread, center[1]],
    [center[0], center[1] + spread],
    [center[0] - spread, center[1]],
  ]);
}

function closePolygon(points: Array<[number, number]>) {
  if (points.length === 0) return [];
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
}

function cross(origin: [number, number], a: [number, number], b: [number, number]) {
  return (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);
}
