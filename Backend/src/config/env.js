import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function numberFromEnv(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanFromEnv(value, fallback) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
const paymentProvider = String(process.env.PAYMENT_PROVIDER || "local").toLowerCase();

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: numberFromEnv(process.env.PORT, 4000),
  frontendUrl,
  databasePath: path.resolve(
    backendRoot,
    process.env.DATABASE_PATH || "./data/gleank.sqlite",
  ),
  uploadsPath: path.resolve(
    backendRoot,
    process.env.UPLOADS_PATH || "./uploads",
  ),
  jwtSecret:
    process.env.JWT_SECRET ||
    "local-development-secret-change-before-production-123456",
  sessionDays: numberFromEnv(process.env.SESSION_DAYS, 7),
  passwordResetMinutes: numberFromEnv(
    process.env.PASSWORD_RESET_MINUTES,
    30,
  ),
  emailVerificationMinutes: numberFromEnv(
    process.env.EMAIL_VERIFICATION_MINUTES,
    60,
  ),
  loginLockMinutes: numberFromEnv(process.env.LOGIN_LOCK_MINUTES, 15),
  loginMaxFailedAttempts: numberFromEnv(process.env.LOGIN_MAX_FAILED_ATTEMPTS, 5),
  sellerMonthlyFeeKobo: numberFromEnv(
    process.env.SELLER_MONTHLY_FEE_KOBO,
    300000,
  ),
  platformFeePercent: numberFromEnv(process.env.PLATFORM_FEE_PERCENT, 5),

    paymentProvider: process.env.PAYMENT_PROVIDER || "local",
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || "",
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
  paystackBaseUrl: process.env.PAYSTACK_BASE_URL || "https://api.paystack.co",
  paystackCallbackUrl:
    process.env.PAYSTACK_CALLBACK_URL ||
    `${process.env.FRONTEND_URL || "http://localhost:5173"}/payment/callback`,
  flutterwaveSecretKey: process.env.FLUTTERWAVE_SECRET_KEY || "",
  flutterwavePublicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || "",
  
  livenessProvider: process.env.LIVENESS_PROVIDER || "local",
  livenessApiKey: process.env.LIVENESS_API_KEY || "",
  autoVerifyAuth: booleanFromEnv(
    process.env.AUTO_VERIFY_AUTH,
    process.env.NODE_ENV === "test",
  ),
  autoActivateSellerSubscription: booleanFromEnv(
    process.env.AUTO_ACTIVATE_SELLER_SUBSCRIPTION,
    process.env.NODE_ENV !== "production",
  ),
  autoApproveUsedListings: booleanFromEnv(
    process.env.AUTO_APPROVE_USED_LISTINGS,
    process.env.NODE_ENV !== "production",
  ),
  maxUploadMb: numberFromEnv(process.env.MAX_UPLOAD_MB, 5),
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: numberFromEnv(process.env.SMTP_PORT, 587),
  smtpSecure: booleanFromEnv(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  emailFrom: process.env.EMAIL_FROM || "",
  isProduction: process.env.NODE_ENV === "production",
};

if (env.isProduction && env.jwtSecret.includes("local-development")) {
  throw new Error("JWT_SECRET must be configured in production.");
}

if (env.isProduction && env.paymentProvider === "paystack") {
  if (!env.paystackSecretKey.startsWith("sk_live_")) {
    throw new Error(
      "PAYSTACK_SECRET_KEY must be configured with a live secret key in production.",
    );
  }
}
