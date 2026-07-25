import crypto from "node:crypto";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";

export function isDojahConfigured() {
  return Boolean(env.dojahAppId && env.dojahSecretKey);
}

export function createDojahVerificationSession({ user, role }) {
  const reference = createId("dojah");

  return {
    provider: "dojah",
    reference,
    status: isDojahConfigured() ? "started" : "pending_review",
    requiresAdminReview: !isDojahConfigured(),
    widget: {
      appId: env.dojahAppId,
      publicKey: env.dojahPublicKey,
      reference,
      email: user?.email || "",
      fullName: user?.name || "",
      role,
      environment: env.dojahEnvironment,
    },
    setupRequired: !isDojahConfigured(),
  };
}

export function verifyDojahWebhookSignature(rawBody, signature) {
  if (!env.dojahWebhookSecret) return true;
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", env.dojahWebhookSecret)
    .update(rawBody || "")
    .digest("hex");
  const provided = String(signature).replace(/^sha256=/i, "");

  if (provided.length !== expected.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(provided),
    Buffer.from(expected),
  );
}

export function normalizeDojahWebhook(payload = {}) {
  const data = payload.data || payload;
  const reference =
    data.reference ||
    data.reference_id ||
    data.customer_reference ||
    payload.reference ||
    "";
  const rawStatus = String(
    data.status ||
      data.verification_status ||
      payload.status ||
      "",
  ).toLowerCase();

  let status = "pending_review";
  if (["success", "successful", "approved", "verified", "completed"].includes(rawStatus)) {
    status = "verified";
  }
  if (["failed", "declined", "rejected", "error"].includes(rawStatus)) {
    status = "failed";
  }

  return {
    reference,
    status,
    failureReason: data.failure_reason || data.reason || payload.reason || "",
    raw: payload,
  };
}
