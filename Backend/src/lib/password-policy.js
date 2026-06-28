export function validatePasswordStrength(password) {
  const value = String(password || "");
  const issues = [];

  if (value.length < 8) issues.push("Use at least 8 characters.");
  if (value.length > 72) issues.push("Use 72 characters or fewer.");
  if (!/[A-Za-z]/.test(value)) issues.push("Add at least one letter.");
  if (!/\d/.test(value)) issues.push("Add at least one number.");
  if (/password|123456|qwerty|gleank/i.test(value) && value.length < 12) {
    issues.push("Avoid common or easy-to-guess passwords.");
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
