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

export function changePassword(input: {
  currentPassword: string;
  newPassword: string;
}) {
  return apiRequest<{ message: string }>("/security/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function logoutAllDevices() {
  return apiRequest<{ message: string }>("/security/logout-all", {
    method: "POST",
  });
}
