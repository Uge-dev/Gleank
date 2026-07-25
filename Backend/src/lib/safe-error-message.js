const TECHNICAL_ERROR_PATTERNS = [
  /\bfailed to fetch\b/i,
  /\bRoute not found\b/i,
  /\bnetwork\s*error\b/i,
  /\bload failed\b/i,
  /\babort(?:ed)?\b/i,
  /\btimeout\b/i,
  /\bETIMEDOUT\b/i,
  /\bECONN(?:REFUSED|RESET|ABORTED)\b/i,
  /\bENOTFOUND\b/i,
  /\bEAI_AGAIN\b/i,
  /\bSQLITE_/i,
  /\bPostgres\b/i,
  /\bPGRST\b/i,
  /\bsyntax error at or near\b/i,
  /\bviolates (?:foreign key|unique|check|not-null)/i,
  /\bDATABASE_URL\b/i,
  /\bSMTP\b/i,
  /\bnodemailer\b/i,
  /\bCloudinary\b/i,
  /\bapi_secret\b/i,
  /\bsecret(?:_key)?\b/i,
  /\btoken_hash\b/i,
  /\bpassword_hash\b/i,
  /\bat\s+file:\/\//i,
  /\b\/opt\/render\/project\b/i,
];

export function isTechnicalErrorMessage(message = "") {
  const value = String(message || "");
  return TECHNICAL_ERROR_PATTERNS.some((pattern) => pattern.test(value));
}

export function safeErrorMessage(error, {
  status = 500,
  fallback = "The request could not be completed. Please try again.",
} = {}) {
  const rawMessage = String(error?.message || "").trim();

  if (status === 401) return "Please log in to continue.";
  if (status === 403) return rawMessage && !isTechnicalErrorMessage(rawMessage)
    ? rawMessage
    : "You do not have permission to complete this action.";
  if (status === 404) return rawMessage && !isTechnicalErrorMessage(rawMessage)
    ? rawMessage
    : "We could not find what you are looking for.";
  if (status === 408 || /\b(?:timeout|ETIMEDOUT|AbortError)\b/i.test(rawMessage)) {
    return "The request is taking too long. Please wait a moment and try again.";
  }
  if (status >= 500) {
    if (/\b(?:SMTP|nodemailer|Brevo|email)\b/i.test(rawMessage)) {
      return "We could not send the email right now. Please try again shortly.";
    }
    if (/\b(?:Paystack|payment provider|payment checkout)\b/i.test(rawMessage)) {
      return "Payment checkout could not be started. Please try again shortly.";
    }
    if (/\b(?:Cloudinary|upload|image)\b/i.test(rawMessage)) {
      return "We could not upload the image right now. Please try again.";
    }
    return "Something went wrong on our side. Please try again shortly.";
  }
  if (!rawMessage || isTechnicalErrorMessage(rawMessage)) return fallback;
  return rawMessage;
}

export function shouldLogTechnicalError(error, status = 500) {
  return status >= 500 || isTechnicalErrorMessage(error?.message || "");
}
