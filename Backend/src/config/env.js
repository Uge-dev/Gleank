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

function listUrlsFromEnv(...values) {
  return values
    .flatMap((value) => String(value || "").split(","))
    .map(normalizeUrl)
    .filter(Boolean);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const nodeEnv = process.env.NODE_ENV || "development";
const isProduction = nodeEnv === "production";
const canonicalProductionFrontendUrl = "https://beta.gleenc.com";
const frontendUrl = normalizeUrl(
  process.env.FRONTEND_URL || (isProduction ? "" : "http://localhost:5173"),
);
const localCorsOrigins = isProduction
  ? []
  : [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5173",
      "http://127.0.0.1:5174",
    ];
const corsOrigins = Array.from(
  new Set([
    ...localCorsOrigins,
    frontendUrl,
    ...listUrlsFromEnv(
      process.env.CORS_ORIGINS,
      process.env.FRONTEND_URL,
      process.env.FRONTEND_URLS,
      !isProduction && process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "",
    ),
  ].filter(Boolean)),
);
const paymentProvider = String(process.env.PAYMENT_PROVIDER || "local").toLowerCase();
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || "";
const configuredPaystackMode = String(process.env.PAYSTACK_MODE || "").toLowerCase();
const paystackMode =
  configuredPaystackMode ||
  (paystackSecretKey.startsWith("sk_test_")
    ? "test"
    : paystackSecretKey.startsWith("sk_live_")
      ? "live"
      : "");
const emailProvider = String(process.env.EMAIL_PROVIDER || "").toLowerCase();
const storageProvider = String(process.env.STORAGE_PROVIDER || "local").toLowerCase();
const databaseProvider = String(process.env.DATABASE_PROVIDER || "sqlite").toLowerCase();
const kycProvider = String(process.env.KYC_PROVIDER || "manual").toLowerCase();
const mapProvider = String(process.env.MAP_PROVIDER || "manual").toLowerCase();
const realtimeProvider = String(process.env.REALTIME_PROVIDER || "sse").toLowerCase();
const ocrProvider = String(process.env.OCR_PROVIDER || "none").toLowerCase();
const paystackCallbackUrl = normalizeUrl(
  process.env.PAYSTACK_CALLBACK_URL || (frontendUrl ? `${frontendUrl}/payment/callback` : ""),
);

export const env = {
  nodeEnv,
  port: numberFromEnv(process.env.PORT, 4000),
  frontendUrl,
  corsOrigins,
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
  paystackSecretKey,
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
  paystackMode,
  allowPaystackTestKeysInProduction: booleanFromEnv(
    process.env.ALLOW_PAYSTACK_TEST_KEYS_IN_PRODUCTION,
    false,
  ),
  paystackBaseUrl: process.env.PAYSTACK_BASE_URL || "https://api.paystack.co",
  paystackCallbackUrl,
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
  autoVerifyRidersInDev: booleanFromEnv(
    process.env.AUTO_VERIFY_RIDERS_IN_DEV,
    false,
  ),
  autoSetRidersOnlineInDev: booleanFromEnv(
    process.env.AUTO_SET_RIDERS_ONLINE_IN_DEV,
    false,
  ),
  enableTestRiderDispatch: booleanFromEnv(
    process.env.ENABLE_TEST_RIDER_DISPATCH,
    false,
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
  riderDispatchOfferSeconds: numberFromEnv(process.env.RIDER_DISPATCH_OFFER_SECONDS, 90),
  maxDispatchAttempts: numberFromEnv(process.env.MAX_DISPATCH_ATTEMPTS, 6),
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
  enableChatSafetyFilter: booleanFromEnv(process.env.ENABLE_CHAT_SAFETY_FILTER, true),
  enablePhoneNumberMasking: booleanFromEnv(process.env.ENABLE_PHONE_NUMBER_MASKING, true),
  enablePaymentKeywordBlocking: booleanFromEnv(process.env.ENABLE_PAYMENT_KEYWORD_BLOCKING, true),
  enableOffPlatformReports: booleanFromEnv(process.env.ENABLE_OFF_PLATFORM_REPORTS, true),
  enablePayAtDelivery: booleanFromEnv(process.env.ENABLE_PAY_AT_DELIVERY, true),
  enableDeliveryOtpLock: booleanFromEnv(process.env.ENABLE_DELIVERY_OTP_LOCK, true),
  enableProductContactModeration: booleanFromEnv(process.env.ENABLE_PRODUCT_CONTACT_MODERATION, true),
  enableStoreContactModeration: booleanFromEnv(process.env.ENABLE_STORE_CONTACT_MODERATION, true),
  enableAntiCircumventionScoring: booleanFromEnv(process.env.ENABLE_ANTI_CIRCUMVENTION_SCORING, true),
  payAtDeliveryPaymentWindowMinutes: numberFromEnv(
    process.env.PAY_AT_DELIVERY_PAYMENT_WINDOW_MINUTES,
    10,
  ),
  payAtDeliveryRequireVerifiedBuyer: booleanFromEnv(
    process.env.PAY_AT_DELIVERY_REQUIRE_VERIFIED_BUYER,
    true,
  ),
  payAtDeliveryMinBuyerScore: numberFromEnv(process.env.PAY_AT_DELIVERY_MIN_BUYER_SCORE, 70),
  payAtDeliveryMaxOrderValueKobo: numberFromEnv(
    process.env.PAY_AT_DELIVERY_MAX_ORDER_VALUE_KOBO,
    numberFromEnv(process.env.PAY_AT_DELIVERY_MAX_ORDER_VALUE, 50000) * 100,
  ),
  payAtDeliveryDisableAfterFailures: numberFromEnv(
    process.env.PAY_AT_DELIVERY_DISABLE_AFTER_FAILURES,
    2,
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
  kycProvider,
  dojahAppId: process.env.DOJAH_APP_ID || "",
  dojahPublicKey: process.env.DOJAH_PUBLIC_KEY || "",
  dojahSecretKey: process.env.DOJAH_SECRET_KEY || "",
  dojahBaseUrl: normalizeUrl(process.env.DOJAH_BASE_URL || "https://api.dojah.io"),
  dojahEnvironment: String(process.env.DOJAH_ENVIRONMENT || "sandbox").toLowerCase(),
  dojahWebhookSecret: process.env.DOJAH_WEBHOOK_SECRET || "",
  mapProvider,
  geoapifyApiKey: process.env.GEOAPIFY_API_KEY || "",
  geoapifyBaseUrl: normalizeUrl(process.env.GEOAPIFY_BASE_URL || "https://api.geoapify.com/v1"),
  realtimeProvider,
  enableRealtime: booleanFromEnv(process.env.ENABLE_REALTIME, true),
  realtimeHeartbeatMs: numberFromEnv(process.env.REALTIME_HEARTBEAT_MS, 25000),
  enableOcrModeration: booleanFromEnv(process.env.ENABLE_OCR_MODERATION, false),
  ocrProvider,
  moderationStrictMode: booleanFromEnv(
    process.env.MODERATION_STRICT_MODE,
    process.env.NODE_ENV === "production",
  ),
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
  firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
  firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY || "",
  isProduction,
};

if (!["development", "test", "production"].includes(env.nodeEnv)) {
  throw new Error("NODE_ENV must be one of development, test, or production.");
}

if (!env.frontendUrl || !isHttpUrl(env.frontendUrl)) {
  throw new Error("FRONTEND_URL must be configured as an http(s) URL.");
}

if (env.isProduction && !env.frontendUrl.startsWith("https://")) {
  throw new Error("FRONTEND_URL must use https in production.");
}

if (env.isProduction && env.frontendUrl !== canonicalProductionFrontendUrl) {
  throw new Error(
    `FRONTEND_URL must be ${canonicalProductionFrontendUrl} in production.`,
  );
}

if (env.isProduction && env.corsOrigins.length === 0) {
  throw new Error("At least one allowed frontend origin must be configured in production.");
}

for (const origin of env.corsOrigins) {
  if (!isHttpUrl(origin)) {
    throw new Error(`Invalid CORS origin configured: ${origin}`);
  }

  if (env.isProduction && !origin.startsWith("https://")) {
    throw new Error(`Production CORS origins must use https: ${origin}`);
  }

  if (env.isProduction && origin !== canonicalProductionFrontendUrl) {
    throw new Error(
      `Production CORS origins must contain only ${canonicalProductionFrontendUrl}. Remove ${origin}.`,
    );
  }
}

if (env.isProduction && env.jwtSecret.includes("local-development")) {
  throw new Error("JWT_SECRET must be configured in production.");
}

if (!["sqlite", "postgres"].includes(env.databaseProvider)) {
  throw new Error("DATABASE_PROVIDER must be either sqlite or postgres.");
}

if (!["local", "cloudinary"].includes(env.storageProvider)) {
  throw new Error("STORAGE_PROVIDER must be either local or cloudinary.");
}

if (!["mock", "manual", "dojah"].includes(env.kycProvider)) {
  throw new Error("KYC_PROVIDER must be one of mock, manual, or dojah.");
}

if (!["manual", "geoapify"].includes(env.mapProvider)) {
  throw new Error("MAP_PROVIDER must be either manual or geoapify.");
}

if (!["sse", "socketio", "none"].includes(env.realtimeProvider)) {
  throw new Error("REALTIME_PROVIDER must be one of sse, socketio, or none.");
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
  throw new Error("DATABASE_PROVIDER=postgres and DATABASE_URL are required in production.");
}

if (env.isProduction && env.kycProvider === "mock") {
  console.warn(
    "KYC_PROVIDER=mock is not a real production verification provider. New KYC checks will require admin review.",
  );
}

if (env.kycProvider === "dojah" && (!env.dojahAppId || !env.dojahSecretKey || !env.dojahWebhookSecret)) {
  throw new Error(
    "KYC_PROVIDER=dojah requires DOJAH_APP_ID, DOJAH_SECRET_KEY, and DOJAH_WEBHOOK_SECRET.",
  );
}

if (env.mapProvider === "geoapify" && !env.geoapifyApiKey) {
  console.warn(
    "MAP_PROVIDER=geoapify is selected but GEOAPIFY_API_KEY is missing. Location features will use manual area fallback.",
  );
}

if (
  env.isProduction &&
  env.paymentProvider === "paystack" &&
  env.paystackSecretKey.startsWith("sk_test_") &&
  env.paystackMode === "test" &&
  env.allowPaystackTestKeysInProduction
) {
  console.warn(
    "Paystack is running with test keys on a production deployment. Checkout is in test mode and will not collect real payments.",
  );
}

if (
  env.isProduction &&
  env.paymentProvider === "paystack" &&
  (!env.paystackCallbackUrl || !isHttpUrl(env.paystackCallbackUrl))
) {
  throw new Error("PAYSTACK_CALLBACK_URL must be configured as an http(s) URL in production.");
}

if (
  env.isProduction &&
  env.paymentProvider === "paystack" &&
  env.paystackCallbackUrl !== `${canonicalProductionFrontendUrl}/payment/callback`
) {
  throw new Error(
    `PAYSTACK_CALLBACK_URL must be ${canonicalProductionFrontendUrl}/payment/callback in production.`,
  );
}

if (
  env.isProduction &&
  env.paymentProvider === "paystack" &&
  !env.paystackSecretKey.startsWith("sk_live_") &&
  !(
    env.paystackSecretKey.startsWith("sk_test_") &&
    env.paystackMode === "test" &&
    env.allowPaystackTestKeysInProduction
  )
) {
  throw new Error(
    "PAYMENT_PROVIDER=paystack requires a live Paystack secret in production, or explicit PAYSTACK_MODE=test with ALLOW_PAYSTACK_TEST_KEYS_IN_PRODUCTION=true for real test-mode checks.",
  );
}
