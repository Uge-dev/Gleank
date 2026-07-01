import { apiRequest } from "../lib/api";
import type {
  AccountSecurityEvent,
  AccountSecuritySession,
  AuthUser,
} from "../types/domain";

export type AccountSecurityResponse = {
  user: AuthUser;
  sessions: AccountSecuritySession[];
  events: AccountSecurityEvent[];
};

export function getAccountSecurity() {
  return apiRequest<AccountSecurityResponse>("/security/me");
}

/**
 * Deprecated old flow. Keep this export for compatibility with older imports,
 * but new UI should use requestSecurityPasswordReset + verify code + complete.
 */
export function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  return apiRequest<{ message: string }>("/security/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function requestSecurityPasswordReset() {
  return apiRequest<{ message: string }>("/security/password-reset/request", {
    method: "POST",
  });
}

export function verifySecurityPasswordResetCode(code: string) {
  return apiRequest<{ message: string }>("/security/password-reset/verify-code", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export function completeSecurityPasswordReset(input: {
  code: string;
  newPassword: string;
}) {
  return apiRequest<{ message: string }>("/security/password-reset/complete", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logoutAllDevices() {
  return apiRequest<{ message: string }>("/security/logout-all", {
    method: "POST",
  });
}
