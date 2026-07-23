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
  role: "buyer" | "seller" | "rider";
  campus: string;
  phone?: string;
  storeName?: string;
  vehicleType?: string;
  vehiclePlate?: string;
  coverageArea?: string;
  homeAddress?: string;
  transportType?: string;
  maxPackageSize?: string;
  maxWeightClass?: string;
  fragileHandlingAbility?: string;
  deliveryBagType?: string;
  gpsPermissionStatus?: string;
  canReceiveAutoDispatch?: boolean;
  identityDocument?: File | null;
  selfie?: File | null;
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
  if (input.role === "rider") {
    const formData = new FormData();
    formData.append("name", input.name);
    formData.append("email", input.email);
    formData.append("password", input.password);
    formData.append("phone", input.phone || "");
    formData.append("campus", input.campus || "General");
    formData.append("vehicleType", input.vehicleType || "");
    formData.append("vehiclePlate", input.vehiclePlate || "");
    formData.append("coverageArea", input.coverageArea || input.campus || "");
    formData.append("homeAddress", input.homeAddress || "");
    formData.append("transportType", input.transportType || input.vehicleType || "motorcycle");
    formData.append("maxPackageSize", input.maxPackageSize || "small_medium");
    formData.append("maxWeightClass", input.maxWeightClass || "up_to_medium");
    formData.append("fragileHandlingAbility", input.fragileHandlingAbility || "can_handle_fragile");
    formData.append("deliveryBagType", input.deliveryBagType || "medium_delivery_bag");
    formData.append("gpsPermissionStatus", input.gpsPermissionStatus || "gps_disabled");
    formData.append("canReceiveAutoDispatch", String(input.canReceiveAutoDispatch !== false));

    if (input.identityDocument) {
      formData.append("identityDocument", input.identityDocument);
    }

    if (input.selfie) {
      formData.append("selfie", input.selfie);
    }

    return apiRequest<AuthResponse & { riderProfile?: unknown }>("/rider/register", {
      method: "POST",
      body: formData,
    }).then((response) => ({
      user: response.user,
      store: null,
      emailVerificationRequired: response.emailVerificationRequired,
    }));
  }

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
