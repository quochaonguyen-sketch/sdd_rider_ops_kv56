export type AppRole = "admin" | "leader" | "viewer" | "member";

export function canManageOperations(role: string | null | undefined) {
  return role === "admin" || role === "leader" || role === "member";
}

export function canManageRiders(role: string | null | undefined) {
  return role === "admin" || role === "leader";
}

export function canAccessPickupManagement(role: string | null | undefined) {
  return role === "admin" || role === "leader" || role === "viewer";
}
