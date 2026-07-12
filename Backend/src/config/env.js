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

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

const frontendUrl = normalizeUrl(process.env.FRONTEND_URL || "http://localhost:5173");
const paymentProvider = String(process.env.PAYMENT_PROVIDER || "local").toLowerCase();
const paystackMode = String(process.env.PAYSTACK_MODE || "").toLowerCase();
const emailProvider = String(process.env.EMAIL_PROVIDER || "").toLowerCase();
const storageProvider = String(process.env.STORAGE_PROVIDER || "local").toLowerCase();
const databaseProvider = String(process.env.DATABASE_PROVIDER || "sqlite").toLowerCase();

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: numberFromEnv(process.env.PORT, 4000),
  frontendUrl,
  databaseProvider,
  databaseUrl: process.env.DATABASE_URL || "",
  databasePath: path.resolve(
    backendRoot,
    process.env.DATABASE_PATH || "./data/gleank.sqlite",
  ),
  storageProvider,
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
    199900,
  ),
  platformFeePercent: numberFromEnv(process.env.PLATFORM_FEE_PERCENT, 5),

  paymentProvider,
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || "",
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
  paystackMode,
  allowPaystackTestKeysInProduction: booleanFromEnv(
    process.env.ALLOW_PAYSTACK_TEST_KEYS_IN_PRODUCTION,
    false,
  ),
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
  riderDispatchTimeoutSeconds: numberFromEnv(process.env.RIDER_DISPATCH_TIMEOUT_SECONDS, 600),
  riderDispatchTimeoutCampusSeconds: numberFromEnv(
    process.env.RIDER_DISPATCH_TIMEOUT_CAMPUS_SECONDS,
    600,
  ),
  riderDispatchTimeoutLocalMarketSeconds: numberFromEnv(
    process.env.RIDER_DISPATCH_TIMEOUT_LOCAL_MARKET_SECONDS,
    1200,
  ),
  riderDispatchTimeoutHeavyFragileSeconds: numberFromEnv(
    process.env.RIDER_DISPATCH_TIMEOUT_HEAVY_FRAGILE_SECONDS,
    900,
  ),
  maxDispatchAttempts: numberFromEnv(process.env.MAX_DISPATCH_ATTEMPTS, 5),
  sellerConfirmationWindowMinutes: numberFromEnv(
    process.env.SELLER_CONFIRMATION_WINDOW_MINUTES,
    10,
  ),
  riderLocationRefreshMs: numberFromEnv(process.env.RIDER_LOCATION_REFRESH_MS, 30000),
  allowZoneOnlyRiderDispatch: booleanFromEnv(
    process.env.ALLOW_ZONE_ONLY_RIDER_DISPATCH,
    true,
  ),
  requireGpsForHighRiskDelivery: booleanFromEnv(
    process.env.REQUIRE_GPS_FOR_HIGH_RISK_DELIVERY,
    true,
  ),
  maxPickupsPerBatchDefault: numberFromEnv(
    process.env.MAX_PICKUPS_PER_BATCH_DEFAULT,
    4,
  ),
  enableAutomatedDispatch: booleanFromEnv(process.env.ENABLE_AUTOMATED_DISPATCH, true),
  enableSellerRiderManualAssignment: booleanFromEnv(
    process.env.ENABLE_SELLER_RIDER_MANUAL_ASSIGNMENT,
    false,
  ),
  enableAutomatedOrderGrouping: booleanFromEnv(
    process.env.ENABLE_AUTOMATED_ORDER_GROUPING,
    true,
  ),
  enableAutomatedDeliveryFees: booleanFromEnv(
    process.env.ENABLE_AUTOMATED_DELIVERY_FEES,
    true,
  ),
  enableAutomatedReliabilityScoring: booleanFromEnv(
    process.env.ENABLE_AUTOMATED_RELIABILITY_SCORING,
    true,
  ),
  enableAutomatedInterventionQueue: booleanFromEnv(
    process.env.ENABLE_AUTOMATED_INTERVENTION_QUEUE,
    true,
  ),
  enableAutomatedSubstitutions: booleanFromEnv(
    process.env.ENABLE_AUTOMATED_SUBSTITUTIONS,
    true,
  ),
  enableZoneAvailabilityControl: booleanFromEnv(
    process.env.ENABLE_ZONE_AVAILABILITY_CONTROL,
    true,
  ),
  maxUploadMb: numberFromEnv(process.env.MAX_UPLOAD_MB, 5),
  imageMaxWidth: numberFromEnv(process.env.IMAGE_MAX_WIDTH, 1800),
  imageWebpQuality: numberFromEnv(process.env.IMAGE_WEBP_QUALITY, 86),
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
  cloudinaryFolder: process.env.CLOUDINARY_FOLDER || "gleenc",
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: numberFromEnv(process.env.SMTP_PORT, 587),
  smtpSecure: booleanFromEnv(process.env.SMTP_SECURE, false),
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  emailFrom: process.env.EMAIL_FROM || "",
  smtpFromName: process.env.SMTP_FROM_NAME || "Gleenc",
  smtpFromEmail: process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM || "",
  emailProvider,
  brevoApiKey: process.env.BREVO_API_KEY || "",
  emailDiagnosticToken: process.env.EMAIL_DIAGNOSTIC_TOKEN || "",
  isProduction: process.env.NODE_ENV === "production",
};

if (env.isProduction && env.jwtSecret.includes("local-development")) {
  throw new Error("JWT_SECRET must be configured in production.");
}

if (!["sqlite", "postgres"].includes(env.databaseProvider)) {
  throw new Error("DATABASE_PROVIDER must be either sqlite or postgres.");
}

if (!["local", "cloudinary"].includes(env.storageProvider)) {
  throw new Error("STORAGE_PROVIDER must be either local or cloudinary.");
}

if (env.databaseProvider === "postgres" && !env.databaseUrl) {
  throw new Error("DATABASE_URL is required when DATABASE_PROVIDER=postgres.");
}

if (env.storageProvider === "cloudinary") {
  const hasCloudinaryConfig =
    env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret;

  if (!hasCloudinaryConfig) {
    throw new Error(
      "Cloudinary storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
  }
}

if (env.isProduction && env.storageProvider !== "cloudinary") {
  throw new Error("STORAGE_PROVIDER=cloudinary is required in production.");
}

if (env.isProduction && env.databaseProvider !== "postgres") {
  console.warn(
    "Production database is set to sqlite. Set DATABASE_PROVIDER=postgres and DATABASE_URL to use persistent Neon storage.",
  );
}

if (
  env.isProduction &&
  env.paymentProvider === "paystack" &&
  env.paystackSecretKey.startsWith("sk_test_") &&
  (env.paystackMode === "test" || env.allowPaystackTestKeysInProduction)
) {
  console.warn(
    "Paystack is running with test keys on a production deployment. Checkout is in test mode and will not collect real payments.",
  );
}

if (
  env.isProduction &&
  env.paymentProvider === "paystack" &&
  !env.paystackSecretKey.startsWith("sk_live_") &&
  !(
    env.paystackSecretKey.startsWith("sk_test_") &&
    (env.paystackMode === "test" || env.allowPaystackTestKeysInProduction)
  )
) {
  console.warn(
    "PAYMENT_PROVIDER=paystack is enabled without an allowed PAYSTACK_SECRET_KEY. The API will start, but Paystack checkout will be blocked until a sk_live_ key is configured or PAYSTACK_MODE=test is set for test keys.",
  );
}
