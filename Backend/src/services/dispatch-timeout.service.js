import { env } from "../config/env.js";

const HEAVY_FRAGILE_KEYWORDS = [
  "heavy",
  "fragile",
  "glass",
  "breakable",
  "ceramic",
  "mirror",
  "tv",
  "television",
  "monitor",
  "laptop",
  "electronics",
  "bottle",
  "liquid",
];

function safeSeconds(value, fallback) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return fallback;
  return Math.round(seconds);
}

function includesAnyKeyword(value, keywords) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/\b(?:not|non)[_\s-]?fragile\b/g, "")
    .replace(/\b(?:not|non)[_\s-]?heavy\b/g, "");
  return keywords.some((keyword) => text.includes(keyword));
}

function hasHeavyFragileSignal(input = {}) {
  if (input.isHeavyFragile === true) return true;
  const parts = [
    input.packageSummary,
    input.note,
    input.category,
    input.packageType,
    Array.isArray(input.packageTags) ? input.packageTags.join(" ") : input.packageTags,
  ];
  return includesAnyKeyword(parts.filter(Boolean).join(" "), HEAVY_FRAGILE_KEYWORDS);
}

function hasLocalMarketSignal(input = {}) {
  const sellerType = String(input.sellerType || "").toLowerCase();
  const marketSource = String(input.marketSource || "").toLowerCase();
  return sellerType === "local_market" || marketSource.includes("local market");
}

export function resolveDispatchTimeoutPolicy(input = {}) {
  const campusSeconds = safeSeconds(
    env.riderDispatchTimeoutCampusSeconds,
    safeSeconds(env.riderDispatchTimeoutSeconds, 600),
  );
  const localMarketSeconds = safeSeconds(env.riderDispatchTimeoutLocalMarketSeconds, 1200);
  const heavyFragileSeconds = safeSeconds(env.riderDispatchTimeoutHeavyFragileSeconds, 900);

  if (hasLocalMarketSignal(input)) {
    return {
      policyKey: "local_market",
      reason: "Local market pickup",
      timeoutSeconds: localMarketSeconds,
      timeoutMinutes: Math.round(localMarketSeconds / 60),
    };
  }

  if (hasHeavyFragileSignal(input)) {
    return {
      policyKey: "heavy_fragile",
      reason: "Heavy or fragile package",
      timeoutSeconds: heavyFragileSeconds,
      timeoutMinutes: Math.round(heavyFragileSeconds / 60),
    };
  }

  return {
    policyKey: "campus",
    reason: "Campus dispatch",
    timeoutSeconds: campusSeconds,
    timeoutMinutes: Math.round(campusSeconds / 60),
  };
}

export function buildDispatchExpiresAt(createdAt, timeoutSeconds) {
  const base = createdAt ? new Date(createdAt) : new Date();
  const baseMs = Number.isFinite(base.getTime()) ? base.getTime() : Date.now();
  return new Date(baseMs + safeSeconds(timeoutSeconds, 600) * 1000).toISOString();
}

export function dispatchRemainingSeconds(expiresAt, now = new Date()) {
  if (!expiresAt) return null;
  const expiryMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiryMs)) return null;
  return Math.max(0, Math.floor((expiryMs - now.getTime()) / 1000));
}
