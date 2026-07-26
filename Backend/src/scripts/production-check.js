import "dotenv/config";

const errors = [];
const warnings = [];
const canonicalFrontendUrl = "https://beta.gleenc.com";

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function requireValue(name) {
  if (!process.env[name]) {
    errors.push(`${name} is required.`);
  }
}

function requireHttpsUrl(name) {
  const value = process.env[name] || "";
  if (!value) {
    errors.push(`${name} is required.`);
    return;
  }

  if (!value.startsWith("https://")) {
    errors.push(`${name} must be an https:// URL in production.`);
  }
}

if (process.env.NODE_ENV !== "production") {
  warnings.push("NODE_ENV is not production. Set NODE_ENV=production on the deployed backend.");
}

requireHttpsUrl("FRONTEND_URL");

if (normalizeUrl(process.env.FRONTEND_URL) !== canonicalFrontendUrl) {
  errors.push(`FRONTEND_URL must be ${canonicalFrontendUrl}.`);
}

const corsOrigins = String(process.env.CORS_ORIGINS || "")
  .split(",")
  .map(normalizeUrl)
  .filter(Boolean);

if (corsOrigins.length !== 1 || corsOrigins[0] !== canonicalFrontendUrl) {
  errors.push(`CORS_ORIGINS must contain only ${canonicalFrontendUrl}.`);
}

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 48) {
  errors.push("JWT_SECRET must be a random production secret with at least 48 characters.");
}

if (process.env.DATABASE_PROVIDER !== "postgres") {
  errors.push("DATABASE_PROVIDER must be postgres for Neon production deployment.");
}

requireValue("DATABASE_URL");

if ((process.env.DATABASE_URL || "").includes("localhost")) {
  errors.push("DATABASE_URL points to localhost. Use the Neon pooled production connection string.");
}

if (/sslmode=(prefer|require|verify-ca)(?=&|$)/i.test(process.env.DATABASE_URL || "")) {
  warnings.push("DATABASE_URL uses a legacy SSL mode. Prefer sslmode=verify-full&channel_binding=require for Neon.");
}

if (process.env.STORAGE_PROVIDER !== "cloudinary") {
  errors.push("STORAGE_PROVIDER must be cloudinary for production deployment.");
}

requireValue("CLOUDINARY_CLOUD_NAME");
requireValue("CLOUDINARY_API_KEY");
requireValue("CLOUDINARY_API_SECRET");

if ((process.env.PAYMENT_PROVIDER || "local") === "local") {
  warnings.push("PAYMENT_PROVIDER is local. Use a live provider before accepting real payments.");
}

if (
  (process.env.PAYMENT_PROVIDER || "").toLowerCase() === "paystack" &&
  normalizeUrl(process.env.PAYSTACK_CALLBACK_URL) !== `${canonicalFrontendUrl}/payment/callback`
) {
  errors.push(`PAYSTACK_CALLBACK_URL must be ${canonicalFrontendUrl}/payment/callback.`);
}

if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
  warnings.push("SMTP is not fully configured. Email verification/password reset will not send live emails.");
}

if (process.env.AUTO_VERIFY_AUTH === "true") {
  errors.push("AUTO_VERIFY_AUTH must be false in production.");
}

if (process.env.AUTO_APPROVE_USED_LISTINGS === "true") {
  warnings.push("AUTO_APPROVE_USED_LISTINGS is true. Usually this should be false in production.");
}

if (warnings.length) {
  console.warn("Production warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error("Production readiness failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Production readiness check passed.");
