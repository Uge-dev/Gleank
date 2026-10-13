export type ValidationResult = {
  valid: boolean;
  message?: string;
};

export function validateRequired(
  value: string,
  fieldName: string,
): ValidationResult {
  if (!value.trim()) {
    return {
      valid: false,
      message: `${fieldName} is required.`,
    };
  }

  return { valid: true };
}

export function validateEmail(
  email: string,
): ValidationResult {
  const normalizedEmail = email.trim();

  if (!normalizedEmail) {
    return {
      valid: false,
      message: 'Email address is required.',
    };
  }

  const validEmail =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      normalizedEmail,
    );

  return validEmail
    ? { valid: true }
    : {
        valid: false,
        message:
          'Enter a valid email address.',
      };
}

export function validatePassword(
  password: string,
): ValidationResult {
  if (password.length < 8) {
    return {
      valid: false,
      message:
        'Password must contain at least 8 characters.',
    };
  }

  if (password.length > 72) {
    return {
      valid: false,
      message:
        'Password must contain 72 characters or fewer.',
    };
  }

  if (!/[A-Za-z]/.test(password)) {
    return {
      valid: false,
      message:
        'Password must contain at least one letter.',
    };
  }

  if (!/\d/.test(password)) {
    return {
      valid: false,
      message:
        'Password must contain at least one number.',
    };
  }

  if (
    /password|123456|qwerty|gleank/i.test(
      password,
    ) &&
    password.length < 12
  ) {
    return {
      valid: false,
      message:
        'Avoid common or easy-to-guess passwords.',
    };
  }

  return { valid: true };
}

export function validateUsername(
  username: string,
): ValidationResult {
  const valid =
    /^[a-z0-9_]{3,30}$/.test(
      username.trim().toLowerCase(),
    );

  return valid
    ? { valid: true }
    : {
        valid: false,
        message:
          'Use 3–30 letters, numbers or underscores.',
      };
}

export function normalizePhone(
  phone: string,
) {
  return phone.replace(/[^\d+]/g, '');
}

export function validatePhone(
  phone: string,
): ValidationResult {
  const normalized = normalizePhone(phone);

  if (normalized.length < 7) {
    return {
      valid: false,
      message:
        'Enter a valid phone number.',
    };
  }

  return { valid: true };
}