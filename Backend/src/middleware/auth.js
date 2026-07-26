import { sessionCookieName, verifySessionToken } from "../lib/session.js";
import { HttpError } from "../lib/http-error.js";
import { assertRole, normalizeRole } from "../lib/roles.js";
import { assertSellerSubscriptionActive } from "../services/subscription.service.js";
import { assertSellerVerified } from "../services/seller-verification.service.js";

export function optionalAuth(req, _res, next) {
  const token = req.cookies?.[sessionCookieName];
  try {
    req.auth = token ? verifySessionToken(token) : null;
  } catch {
    req.auth = null;
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
