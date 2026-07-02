import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

function safeCompare(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

export function validateAdminCredentials(email, password) {
  const emailOk = safeCompare(String(email || "").toLowerCase(), env.adminEmail);
  const passwordOk = safeCompare(password, env.adminPassword);

  return emailOk && passwordOk;
}

export function createAdminToken() {
  return jwt.sign(
    {
      role: "admin",
      email: env.adminEmail,
      purpose: "gleank_waitlist_admin",
    },
    env.jwtSecret,
    {
      expiresIn: "12h",
    },
  );
}

export function requireAdmin(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ message: "Admin token is required." });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret);

    if (payload?.role !== "admin") {
      return res.status(403).json({ message: "Admin access only." });
    }

    req.admin = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid or expired admin token." });
  }
}
