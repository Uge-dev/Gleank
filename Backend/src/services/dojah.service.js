import crypto from "node:crypto";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";

export function isDojahConfigured() {
  return Boolean(env.dojahAppId && env.dojahSecretKey && env.dojahWebhookSecret);
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

export function verifyDojahWebhookSignature(rawBody, signature, timestamp) {
  if (!env.dojahWebhookSecret) return false;
  if (!signature || !timestamp) return false;

  const timestampMs = /^\d+$/.test(String(timestamp))
    ? Number(timestamp) * (String(timestamp).length <= 10 ? 1000 : 1)
    : new Date(timestamp).getTime();

  if (!Number.isFinite(timestampMs)) return false;

  const maxSkewMs = 5 * 60 * 1000;
  if (Math.abs(Date.now() - timestampMs) > maxSkewMs) return false;

  const body = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(String(rawBody || ""), "utf8");
  const candidates = [
    body,
    Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), body]),
  ];
  const provided = String(signature).replace(/^sha256=/i, "");

  return candidates.some((candidate) => {
    const expected = crypto
      .createHmac("sha256", env.dojahWebhookSecret)
      .update(candidate)
      .digest("hex");

    if (provided.length !== expected.length) return false;

    return crypto.timingSafeEqual(
      Buffer.from(provided),
      Buffer.from(expected),
    );
  });
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
    eventId: data.event_id || data.eventId || data.id || payload.event_id || payload.id || "",
    appId: data.app_id || data.appId || payload.app_id || payload.appId || "",
    timestamp: data.timestamp || payload.timestamp || "",
    reference,
    status,
    failureReason: data.failure_reason || data.reason || payload.reason || "",
    raw: payload,
  };
}
