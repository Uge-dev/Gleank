import { HttpError } from "./http-error.js";

export const USER_ROLES = Object.freeze(["buyer", "seller", "rider", "admin"]);
export const USER_ROLE_SET = new Set(USER_ROLES);

export function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return USER_ROLE_SET.has(role) ? role : "";
}

export function assertKnownRole(value, label = "Account role") {
  const role = normalizeRole(value);

  if (!role) {
    throw new HttpError(422, `${label} is not supported.`);
  }

  return role;
}

export function assertRole(user, allowedRoles, message = "You do not have access to this area.") {
  const currentRole = normalizeRole(user?.role);
  const allowed = new Set((allowedRoles || []).map(normalizeRole).filter(Boolean));

  if (!currentRole || !allowed.has(currentRole)) {
    throw new HttpError(403, message);
  }

  return currentRole;
}
