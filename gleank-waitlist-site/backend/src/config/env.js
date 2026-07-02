import dotenv from "dotenv";

dotenv.config();

function required(name, fallback = "") {
  const value = process.env[name] || fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseOrigins(value) {
  return String(value || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const extraCorsOrigins = parseOrigins(process.env.CORS_ORIGINS);

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  mongoUri: required("MONGODB_URI", "mongodb://127.0.0.1:27017/gleank_waitlist"),
  frontendUrl,
  corsOrigins: Array.from(new Set([frontendUrl, ...extraCorsOrigins])),
  jwtSecret: required("JWT_SECRET", "gleank-dev-jwt-secret-change-this"),
  adminEmail: required("ADMIN_EMAIL", "admin@gleank.com").toLowerCase(),
  adminPassword: required("ADMIN_PASSWORD", "change-this-password"),
};
