import { sessionCookieName, verifySessionToken } from "../lib/session.js";
import { HttpError } from "../lib/http-error.js";
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

    if (!roles.includes(req.auth.role)) {
      throw new HttpError(403, "You do not have access to this area.");
    }

    next();
  };
}

export function requireVerifiedSellerAccess(req, _res, next) {
  if (!req.auth) {
    throw new HttpError(401, "Please log in to continue.");
  }

  if (!['seller', 'admin'].includes(req.auth.role)) {
    throw new HttpError(403, "Seller tools require a seller account.");
  }

  if (req.auth.role === 'admin') {
    next();
    return;
  }

  assertSellerVerified(req.auth);
  assertSellerSubscriptionActive(req.auth.user_id);
  next();
}
