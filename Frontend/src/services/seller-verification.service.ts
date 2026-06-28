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
  verificationReady: boolean;
  payoutReady: boolean;
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
