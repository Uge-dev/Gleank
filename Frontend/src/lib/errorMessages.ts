const TECHNICAL_PATTERNS = [
  /failed to fetch/i,
  /Route not found/i,
  /network\s*error/i,
  /load failed/i,
  /abort(?:ed)?/i,
  /timeout/i,
  /ETIMEDOUT/i,
  /ECONN(?:REFUSED|RESET|ABORTED)/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /SQLITE_/i,
  /Postgres/i,
  /syntax error at or near/i,
  /violates (?:foreign key|unique|check|not-null)/i,
  /DATABASE_URL/i,
  /Cloudinary/i,
  /SMTP|nodemailer|Brevo/i,
  /api_secret|secret(?:_key)?|token_hash|password_hash/i,
  /\/opt\/render\/project/i,
  /file:\/\//i,
];

export function isTechnicalMessage(message = "") {
  return TECHNICAL_PATTERNS.some((pattern) => pattern.test(String(message || "")));
}

export function cleanErrorMessage(
  message: unknown,
  status?: number,
  fallback = "The request could not be completed. Please try again.",
) {
  const value = String(message || "").trim();

  if (status === 0 || status === 408 || isTechnicalMessage(value) && /failed to fetch|network|load failed|timeout|ETIMEDOUT/i.test(value)) {
    return "We could not connect right now. Please check your internet connection and try again.";
  }

  if (status === 401) return "Please log in to continue.";
  if (status === 403) return value && !isTechnicalMessage(value)
    ? value
    : "You do not have permission to complete this action.";
  if (status === 404) return value && !isTechnicalMessage(value)
    ? value
    : "We could not find what you are looking for.";
  if ((status || 0) >= 500) {
    return "Something went wrong on our side. Please try again shortly.";
  }

  if (!value || isTechnicalMessage(value)) return fallback;
  return value;
}
