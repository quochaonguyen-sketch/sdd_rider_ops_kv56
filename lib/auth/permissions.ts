export type AppRole = "admin" | "leader" | "viewer" | "member";

export type PermissionKey =
  | "manage_riders"
  | "approve_off"
  | "manage_attendance"
  | "manage_return"
  | "manage_pickup"
  | "manage_zones"
  | "manage_morning"
  | "manage_volume"
  | "manage_imports"
  | "manage_performance";

export type MemberPermissions = Record<PermissionKey, boolean>;

export const PERMISSION_OPTIONS: Array<{ key: PermissionKey; label: string; hint: string }> = [
  { key: "manage_riders", label: "Thêm / sửa Rider", hint: "Tạo và chỉnh sửa hồ sơ rider" },
  { key: "approve_off", label: "Duyệt OFF", hint: "Duyệt hoặc từ chối yêu cầu OFF" },
  { key: "manage_attendance", label: "Attendance", hint: "Sửa lịch chấm công" },
  { key: "manage_return", label: "Return", hint: "Tra cứu và điều phối hàng trả" },
  { key: "manage_pickup", label: "Pickup", hint: "Pickup realtime và phân công" },
  { key: "manage_zones", label: "Zones / Zone Builder", hint: "Xem và sửa vùng giao" },
  { key: "manage_morning", label: "Morning Dispatch", hint: "Điều phối sáng" },
  { key: "manage_volume", label: "Volume", hint: "Sản lượng delivery / pickup" },
  { key: "manage_imports", label: "Imports", hint: "Nhập dữ liệu" },
  { key: "manage_performance", label: "Performance", hint: "Xem và xử lý hiệu suất" },
];

const EMPTY_PERMISSIONS = Object.fromEntries(PERMISSION_OPTIONS.map((item) => [item.key, false])) as MemberPermissions;
const ALL_PERMISSIONS = Object.fromEntries(PERMISSION_OPTIONS.map((item) => [item.key, true])) as MemberPermissions;

export function defaultPermissionsForRole(role: string | null | undefined): MemberPermissions {
  if (role === "admin" || role === "leader") return { ...ALL_PERMISSIONS };
  return { ...EMPTY_PERMISSIONS };
}

export function normalizePermissions(value: unknown, role?: string | null): MemberPermissions {
  const fallback = defaultPermissionsForRole(role);
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const next = { ...fallback };
  for (const item of PERMISSION_OPTIONS) {
    if (typeof raw[item.key] === "boolean") next[item.key] = raw[item.key] as boolean;
  }
  return next;
}

export function selectedPermissionKeys(permissions: MemberPermissions) {
  return PERMISSION_OPTIONS.filter((item) => permissions[item.key]).map((item) => item.key);
}

export function canManageOperations(role: string | null | undefined) {
  return role === "admin" || role === "leader" || role === "member";
}

export function canManageRiders(role: string | null | undefined, permissions?: MemberPermissions | null) {
  if (role === "admin") return true;
  return Boolean(permissions?.manage_riders);
}

export function canAccessPickupManagement(role: string | null | undefined, permissions?: MemberPermissions | null) {
  if (role === "admin") return true;
  return Boolean(permissions?.manage_pickup);
}

export function canApproveOff(role: string | null | undefined, permissions?: MemberPermissions | null) {
  if (role === "admin") return true;
  return Boolean(permissions?.approve_off);
}

export function canManageReturn(role: string | null | undefined, permissions?: MemberPermissions | null) {
  if (role === "admin") return true;
  return Boolean(permissions?.manage_return);
}
