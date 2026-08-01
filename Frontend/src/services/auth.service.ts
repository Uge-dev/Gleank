import { apiRequest } from "../lib/api";
import type { AuthUser, SellerStore } from "../types/domain";

export type AuthResponse = {
  user: AuthUser;
  store: SellerStore | null;
  emailVerificationRequired?: boolean;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role: "buyer" | "seller";
  campus: string;
  phone?: string;
  storeName?: string;
  sellerType?: "campus" | "local_market" | "used_market";
  country?: string;
  state?: string;
  city?: string;
  nearestCampus?: string;
  nearestMarketplace?: string;
  street?: string;
  pickupPlaceId?: string;
  pickupLat?: number;
  pickupLng?: number;
  locationVerifiedAt?: string;
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
  return apiRequest<{ message: string }>("/auth/resend-verification", {
    method: "POST",
  });
}

export function logout() {
  return apiRequest<void>("/auth/logout", {
    method: "POST",
  });
}

export function requestPasswordReset(email: string, role?: "buyer" | "seller" | "rider") {
  return apiRequest<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email, ...(role ? { role } : {}) }),
  });
}

export function resetPassword(input: { token: string; password: string; role?: "buyer" | "seller" | "rider" }) {
  return apiRequest<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
