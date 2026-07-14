import { db } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";

const NIGERIAN_PHONE_PATTERN =
  /(?:\+?234[\s.-]?|0)(?:70|80|81|90|91)[\s.-]?\d{4}[\s.-]?\d{4}\b/gi;
const WHATSAPP_PATTERN =
  /\b(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|whatsapp\.com)\/\S+|\bwhats\s*app\b|\bwhatsapp\b|\bwatsapp\b|\bwa\.me\b|\bwa\s*link\b/gi;
const ACCOUNT_NUMBER_PATTERN = /\b\d{10}\b/g;
const DIRECT_CONTACT_KEYWORD_PATTERN =
  /\b(?:dm\s*me|send\s*(?:me\s*)?(?:your\s*)?(?:number|contact)|drop\s*(?:your\s*)?(?:number|contact)|call\s*me|text\s*me|message\s*me\s*(?:direct|privately)?|private\s*chat|telegram|t\.me|instagram\s*dm|ig\s*dm|outside\s*chat)\b/i;
const DIRECT_CONTACT_SANITIZE_PATTERN =
  /\b(?:dm\s*me|send\s*(?:me\s*)?(?:your\s*)?(?:number|contact)|drop\s*(?:your\s*)?(?:number|contact)|call\s*me|text\s*me|message\s*me\s*(?:direct|privately)?|private\s*chat|telegram|t\.me|instagram\s*dm|ig\s*dm|outside\s*chat)\b/gi;
const PAYMENT_KEYWORD_PATTERN =
  /\b(?:cash|cash\s*on\s*delivery|bank\s*transfer|transfer|do\s*transfer|make\s*transfer|send\s*transfer|account\s*(?:number|no|details?)?|acct|account\s*details?|pay\s*me|pay\s*seller|pay\s*rider|pay\s*outside|pay\s*direct(?:ly)?|send\s*(?:money|payment|account|acct|number)|direct\s*payment|direct\s*transfer|outside\s*(?:the\s*)?(?:app|platform|gleenc)|off\s*platform|offline\s*payment|bypass\s*(?:app|gleenc|payment)|avoid\s*(?:fee|charges?|platform)|no\s*paystack|without\s*paystack|private\s*(?:deal|payment)|meet\s*and\s*pay|pay\s*on\s*arrival|pos|p\.?o\.?s\.?|ussd|bank\s*app|opay|o\s*pay|palmpay|palm\s*pay|moniepoint|monie\s*point|kuda|access\s*bank|gtbank|gt\s*bank|uba|zenith|first\s*bank|fidelity|fcmb|wema)\b/i;
const HIGH_RISK_PAY_AT_DELIVERY_PATTERN =
  /\b(?:iphone|phone|smartphone|laptop|macbook|tablet|ipad|electronics?|gadget|jewelry|gold|watch|camera)\b/i;

function clean(value, max = 1600) {
  return String(value || "").trim().slice(0, max);
}

function preview(value) {
  return clean(value, 240);
}

function uniqueReasons(reasons) {
  const seen = new Set();
  return reasons.filter((reason) => {
    if (seen.has(reason.code)) return false;
    seen.add(reason.code);
    return true;
  });
}

export function scanForCircumvention(text, options = {}) {
  const sourceText = clean(text, 4000);
  const reasons = [];

  if (!sourceText || options.disabled) {
    return {
      flagged: false,
      sanitizedText: sourceText,
      severity: 0,
      reasons,
      action: "none",
    };
  }

  const phoneMatches = sourceText.match(NIGERIAN_PHONE_PATTERN) || [];
  const whatsappMatches = sourceText.match(WHATSAPP_PATTERN) || [];
  const hasDirectContactKeyword = DIRECT_CONTACT_KEYWORD_PATTERN.test(sourceText);
  const hasPaymentKeyword =
    env.enablePaymentKeywordBlocking && PAYMENT_KEYWORD_PATTERN.test(sourceText);
  const accountMatches =
    hasPaymentKeyword ? sourceText.match(ACCOUNT_NUMBER_PATTERN) || [] : [];

  if (phoneMatches.length) {
    reasons.push({
      code: "direct_phone",
      message: "Direct phone number was hidden to keep the order on Gleenc.",
      score: 35,
    });
  }

  if (whatsappMatches.length) {
    reasons.push({
      code: "whatsapp_contact",
      message: "WhatsApp/direct contact instruction was hidden before a protected order stage.",
      score: 35,
    });
  }

  if (hasDirectContactKeyword) {
    reasons.push({
      code: "direct_contact_instruction",
      message: "Direct contact instructions were hidden to keep the order protected on Gleenc.",
      score: 35,
    });
  }

  if (hasPaymentKeyword) {
    reasons.push({
      code: "off_platform_payment",
      message: "Direct cash, transfer, or outside-app payment wording was detected.",
      score: 45,
    });
  }

  if (accountMatches.length) {
    reasons.push({
      code: "bank_account_number",
      message: "Bank account details were hidden. Payments must go through Gleenc/Paystack.",
      score: 50,
    });
  }

  const normalizedReasons = uniqueReasons(reasons);
  const severity = Math.min(
    100,
    normalizedReasons.reduce((total, reason) => total + Number(reason.score || 0), 0),
  );

  let sanitizedText = sourceText;

  if (env.enablePhoneNumberMasking) {
    sanitizedText = sanitizedText.replace(NIGERIAN_PHONE_PATTERN, "[protected phone hidden]");
  }

  sanitizedText = sanitizedText.replace(WHATSAPP_PATTERN, "[protected contact channel hidden]");
  sanitizedText = sanitizedText.replace(DIRECT_CONTACT_SANITIZE_PATTERN, "[protected contact instruction hidden]");

  if (hasPaymentKeyword) {
    sanitizedText = sanitizedText.replace(ACCOUNT_NUMBER_PATTERN, "[protected account hidden]");
  }

  return {
    flagged: normalizedReasons.length > 0,
    sanitizedText,
    severity,
    reasons: normalizedReasons,
    action:
      normalizedReasons.length === 0
        ? "none"
        : severity >= 70
          ? "masked_admin_review"
          : "masked_warning",
  };
}

export function logPaymentProtectionEvent({
  actorId = null,
  targetUserId = null,
  contextType = "",
  contextId = "",
  source = "",
  action = "logged",
  severity = 0,
  reasons = [],
  originalText = "",
  sanitizedText = "",
} = {}) {
  if (!env.enableOffPlatformReports) return null;

  const id = createId("ppe");
  db.prepare(`
    INSERT INTO payment_protection_events (
      id, actor_id, target_user_id, context_type, context_id, source,
      action, severity, reasons, original_preview, sanitized_preview, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    actorId || null,
    targetUserId || null,
    clean(contextType, 80),
    clean(contextId, 160),
    clean(source, 80),
    clean(action, 80),
    Math.max(0, Number(severity || 0)),
    JSON.stringify(reasons || []),
    preview(originalText),
    preview(sanitizedText),
    new Date().toISOString(),
  );

  return id;
}

export function protectMessageContent({
  senderId,
  recipientId,
  conversationId,
  body,
} = {}) {
  if (!env.enableChatSafetyFilter) {
    return { body: clean(body, 1600), flagged: false, warning: "" };
  }

  const scan = scanForCircumvention(body);

  if (scan.flagged) {
    logPaymentProtectionEvent({
      actorId: senderId,
      targetUserId: recipientId,
      contextType: "conversation",
      contextId: conversationId,
      source: "chat",
      action: scan.action,
      severity: scan.severity,
      reasons: scan.reasons,
      originalText: body,
      sanitizedText: scan.sanitizedText,
    });
  }

  return {
    body: scan.sanitizedText,
    flagged: scan.flagged,
    warning: scan.flagged
      ? "Gleenc hid contact/payment details. Keep payments inside Gleenc for protection."
      : "",
    reasons: scan.reasons,
  };
}

export function scanListingContent(input = {}) {
  if (!env.enableProductContactModeration && !env.enableStoreContactModeration) {
    return {
      flagged: false,
      severity: 0,
      reasons: [],
      sanitizedText: "",
      action: "none",
    };
  }

  const text = [
    input.name,
    input.category,
    input.serviceType,
    input.location,
    input.description,
    input.businessDescription,
  ]
    .filter(Boolean)
    .join(" ");

  return scanForCircumvention(text);
}

export function recordPayAtDeliveryFailure({
  userId,
  orderId = null,
  reason = "pay_at_delivery_failed",
} = {}) {
  if (!userId) return;

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO pay_at_delivery_failures (id, user_id, order_id, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(createId("pdf"), userId, orderId || null, clean(reason, 240), now);

  const existing = db
    .prepare("SELECT * FROM buyer_pay_at_delivery_scores WHERE user_id = ?")
    .get(userId);
  const nextFailures = Number(existing?.failure_count || 0) + 1;
  const nextScore = Math.max(0, Number(existing?.score ?? 100) - 20);
  const disabledUntil =
    nextFailures >= env.payAtDeliveryDisableAfterFailures
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      : existing?.disabled_until || null;

  db.prepare(`
    INSERT INTO buyer_pay_at_delivery_scores (
      user_id, score, failure_count, disabled_until, last_failure_reason, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      score = excluded.score,
      failure_count = excluded.failure_count,
      disabled_until = excluded.disabled_until,
      last_failure_reason = excluded.last_failure_reason,
      updated_at = excluded.updated_at
  `).run(userId, nextScore, nextFailures, disabledUntil, clean(reason, 240), now);
}

export function evaluatePayAtDeliveryEligibility(userId, { products = [], totalKobo = 0 } = {}) {
  if (!env.enablePayAtDelivery) {
    return {
      eligible: false,
      reason: "Pay at Delivery is currently unavailable. Please use Pay Now.",
    };
  }

  const user = db
    .prepare("SELECT id, email_verified, phone_verified FROM users WHERE id = ?")
    .get(userId);

  if (!user) {
    return { eligible: false, reason: "Log in again before using Pay at Delivery." };
  }

  const scoreRow = db
    .prepare("SELECT * FROM buyer_pay_at_delivery_scores WHERE user_id = ?")
    .get(userId);
  const buyerScore = Number(scoreRow?.score ?? 100);
  const failureCount = Number(scoreRow?.failure_count || 0);

  if (
    scoreRow?.disabled_until &&
    new Date(scoreRow.disabled_until).getTime() > Date.now()
  ) {
    return {
      eligible: false,
      reason: "Pay at Delivery is temporarily unavailable because of previous failed delivery payments.",
    };
  }

  if (failureCount >= env.payAtDeliveryDisableAfterFailures) {
    return {
      eligible: false,
      reason: "Pay at Delivery is disabled after repeated failed delivery payments. Please use Pay Now.",
    };
  }

  if (buyerScore < env.payAtDeliveryMinBuyerScore) {
    return {
      eligible: false,
      reason: "Pay at Delivery is not available for this account yet. Please use Pay Now.",
    };
  }

  if (env.payAtDeliveryRequireVerifiedBuyer && !user.email_verified) {
    return {
      eligible: false,
      reason: "Verify your email before using Pay at Delivery, or choose Pay Now.",
    };
  }

  if (Number(totalKobo || 0) > env.payAtDeliveryMaxOrderValueKobo) {
    return {
      eligible: false,
      reason: "Pay at Delivery is not available for this order value. Please use Pay Now.",
    };
  }

  const highRiskProduct = products.find((item) =>
    HIGH_RISK_PAY_AT_DELIVERY_PATTERN.test(
      `${item.product?.name || ""} ${item.product?.category || ""}`,
    ),
  );

  if (highRiskProduct && Number(totalKobo || 0) > 75_000_00) {
    return {
      eligible: false,
      reason: "Pay at Delivery is not available for high-risk/high-value items. Please use Pay Now.",
    };
  }

  return {
    eligible: true,
    reason: "",
    buyerScore,
    paymentWindowMinutes: env.payAtDeliveryPaymentWindowMinutes,
  };
}
