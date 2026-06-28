import { apiRequest } from "../lib/api";
import type { AuthUser, SellerStore, UserRole } from "../types/domain";

export type AuthResponse = {
  user: AuthUser;
  store: SellerStore | null;
  emailVerificationRequired?: boolean;
  developmentEmailVerificationToken?: string;
  emailVerificationExpiresAt?: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role: Exclude<UserRole, "admin">;
  campus: string;
  phone?: string;
  storeName?: string;
};

export function getCurrentSession() {
  return apiRequest<AuthResponse>("/auth/me");
}

export function login(input: { email: string; password: string }) {
  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function register(input: RegisterInput) {
  return apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function verifyEmail(token: string) {
  return apiRequest<AuthResponse & { message: string }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function resendVerification() {
  return apiRequest<{
    message: string;
    developmentEmailVerificationToken?: string;
    emailVerificationExpiresAt?: string;
  }>("/auth/resend-verification", {
    method: "POST",
  });
}

export function logout() {
  return apiRequest<void>("/auth/logout", {
    method: "POST",
  });
}

export function requestPasswordReset(email: string) {
  return apiRequest<{
    message: string;
    developmentToken?: string;
    expiresAt?: string;
  }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(input: { token: string; password: string }) {
  return apiRequest<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
