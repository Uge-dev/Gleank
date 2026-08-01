import {
  sessionCookieNameForPortal,
  verifySessionToken,
} from "../lib/session.js";
import { HttpError } from "../lib/http-error.js";
import { assertRole, normalizeRole } from "../lib/roles.js";
import { assertSellerSubscriptionActive } from "../services/subscription.service.js";
import { assertSellerVerified } from "../services/seller-verification.service.js";

export function optionalAuth(req, _res, next) {
  const requestedPortal = String(
    req.get("x-gleenc-portal") || req.query?.portal || "",
  ).toLowerCase();
  const requestPath = String(req.originalUrl || req.path || "").split("?")[0];
  const sharedRiderPath = [
    "/api/location",
    "/api/verification",
    "/api/notifications",
    "/api/messages",
    "/api/security",
    "/api/kyc",
  ].some((prefix) => requestPath.startsWith(prefix));
  const sharedAdminPath =
    requestPath === "/api/zones" ||
    requestPath.startsWith("/api/zones/") ||
    requestPath === "/api/package-rules" ||
    requestPath.startsWith("/api/package-rules/") ||
    requestPath.startsWith("/api/verification/admin/") ||
    requestPath === "/api/verification/admin/queues" ||
    requestPath.startsWith("/api/notifications") ||
    requestPath.startsWith("/api/messages");
  const riderPath = requestPath.startsWith("/api/rider") || sharedRiderPath;
  const adminPath = requestPath.startsWith("/api/admin") || sharedAdminPath;
  const sharedAccountPath =
    requestPath.startsWith("/api/notifications") ||
    requestPath.startsWith("/api/messages");
  let portal = sharedAccountPath
    ? "user"
    : adminPath
    ? "admin"
    : requestPath.startsWith("/api/rider")
      ? "rider"
      : "user";

  // A portal header can select only APIs explicitly owned or shared by that
  // portal. It cannot turn a rider/admin cookie into a general shopping
  // session, even if a request is crafted outside the frontend.
  if (requestedPortal === "rider" && riderPath) portal = "rider";
  if (requestedPortal === "admin" && adminPath) portal = "admin";
  if (requestedPortal === "user" && !requestPath.startsWith("/api/admin") && !requestPath.startsWith("/api/rider")) {
    portal = "user";
  }

  // A few shared APIs are legitimately used by the rider portal. Allow a
  // rider-only browser session to use them without ever treating that rider as
  // a buyer/seller on /auth, /orders, /seller, or other general-account APIs.
  if (
    portal === "user" &&
    sharedRiderPath &&
    !req.cookies?.[sessionCookieNameForPortal("user")] &&
    req.cookies?.[sessionCookieNameForPortal("rider")]
  ) {
    portal = "rider";
  }

  const token = req.cookies?.[sessionCookieNameForPortal(portal)];
  try {
    req.auth = token ? verifySessionToken(token, portal) : null;
    req.authPortal = req.auth ? portal : null;
  } catch {
    req.auth = null;
    req.authPortal = null;
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.auth) {
    throw new HttpError(401, "Please log in to continue.");
  }

  next();
}

export function requireEmailVerified(req, _res, next) {
  if (!req.auth) {
    throw new HttpError(401, "Please log in to continue.");
  }

  if (!req.auth.email_verified) {
    throw new HttpError(403, "Please verify your email before continuing.");
  }

  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) {
      throw new HttpError(401, "Please log in to continue.");
    }

    assertRole(req.auth, roles);

    next();
  };
}

export const requireBuyer = requireRole("buyer");
export const requireSeller = requireRole("seller");
export const requireRider = requireRole("rider");
export const requireAdminRole = requireRole("admin");

export function requireVerifiedSellerAccess(req, _res, next) {
  if (!req.auth) {
    throw new HttpError(401, "Please log in to continue.");
  }

  if (!["seller", "admin"].includes(normalizeRole(req.auth.role))) {
    throw new HttpError(403, "Seller tools require a seller account.");
  }

  if (normalizeRole(req.auth.role) === "admin") {
    next();
    return;
  }

  assertSellerVerified(req.auth);
  assertSellerSubscriptionActive(req.auth.user_id);
  next();
}
