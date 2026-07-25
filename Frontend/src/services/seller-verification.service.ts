import { apiRequest } from "../lib/api";
import type {
  SellerSubscription,
  SellerVerificationProfile,
  UsedMarketPayoutAccount,
  SellerStore,
} from "../types/domain";

export type SellerReadiness = {
  store: SellerStore | null;
  verification: SellerVerificationProfile;
  payoutAccount: UsedMarketPayoutAccount | null;
  hasStore: boolean;
  emailReady: boolean;
  phoneReady?: boolean;
  faceReady?: boolean;
  verificationReady: boolean;
  subscriptionActive?: boolean;
  payoutReady: boolean;
  platformFeeReady?: boolean;
};

export type SellerVerificationResponse = {
  verification: SellerVerificationProfile;
  readiness: SellerReadiness;
  subscription: SellerSubscription | null;
};

export function getSellerVerification() {
  return apiRequest<SellerVerificationResponse>("/seller-verification/me");
}

export function updateSellerVerification(formData: FormData) {
  return apiRequest<SellerVerificationResponse>("/seller-verification/me", {
    method: "PUT",
    body: formData,
  });
}

export function saveSellerVerificationDraft(payload: FormData | Record<string, unknown>) {
  return apiRequest<SellerVerificationResponse>("/seller-verification/me/draft", {
    method: "PATCH",
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  });
}

export function submitSellerVerification(formData: FormData) {
  return apiRequest<SellerVerificationResponse>("/seller-verification/me/submit", {
    method: "POST",
    body: formData,
  });
}
