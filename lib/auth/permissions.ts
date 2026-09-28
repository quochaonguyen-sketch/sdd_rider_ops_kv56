export type AppRole = "admin" | "leader" | "viewer" | "member";

export type MemberPermissions = {
  approve_off: boolean;
  manage_attendance: boolean;
  manage_pickup: boolean;
  manage_zones: boolean;
};

export const PERMISSION_OPTIONS: Array<{ key: keyof MemberPermissions; label: string; hint: string }> = [
  { key: "approve_off", label: "Duyệt OFF", hint: "Duyệt / từ chối yêu cầu OFF của rider" },
  { key: "manage_attendance", label: "Quản lý Attendance", hint: "Sửa lịch chấm công" },
  { key: "manage_pickup", label: "Quản lý Pickup", hint: "Pickup realtime và phân công" },
  { key: "manage_zones", label: "Zone Builder", hint: "Chỉnh sửa vùng giao" },
];

const EMPTY_PERMISSIONS: MemberPermissions = {
  approve_off: false,
  manage_attendance: false,
  manage_pickup: false,
  manage_zones: false,
};

export function defaultPermissionsForRole(role: string | null | undefined): MemberPermissions {
  if (role === "admin") {
    return { approve_off: true, manage_attendance: true, manage_pickup: true, manage_zones: true };
  }
  if (role === "leader") {
    return { approve_off: true, manage_attendance: true, manage_pickup: true, manage_zones: true };
  }
  if (role === "member") {
    return { approve_off: false, manage_attendance: false, manage_pickup: false, manage_zones: false };
  }
  return { ...EMPTY_PERMISSIONS };
}

export function normalizePermissions(value: unknown, role?: string | null): MemberPermissions {
  const fallback = defaultPermissionsForRole(role);
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  return {
    approve_off: typeof raw.approve_off === "boolean" ? raw.approve_off : fallback.approve_off,
    manage_attendance: typeof raw.manage_attendance === "boolean" ? raw.manage_attendance : fallback.manage_attendance,
    manage_pickup: typeof raw.manage_pickup === "boolean" ? raw.manage_pickup : fallback.manage_pickup,
    manage_zones: typeof raw.manage_zones === "boolean" ? raw.manage_zones : fallback.manage_zones,
  };
}

export function canManageOperations(role: string | null | undefined) {
  return role === "admin" || role === "leader" || role === "member";
}

export function canManageRiders(role: string | null | undefined) {
  return role === "admin" || role === "leader";
}

export function canAccessPickupManagement(role: string | null | undefined, permissions?: MemberPermissions | null) {
  if (role === "admin" || role === "leader") return true;
  return Boolean(permissions?.manage_pickup);
}

export function canApproveOff(role: string | null | undefined, permissions?: MemberPermissions | null) {
  if (role === "admin") return true;
  return Boolean(permissions?.approve_off);
}
