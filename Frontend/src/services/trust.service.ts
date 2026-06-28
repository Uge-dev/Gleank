import { apiRequest } from "../lib/api";
import type {
  UsedMarketPayoutAccount,
  UsedMarketTrustProfile,
  UsedMarketTrustStatus,
} from "../types/domain";

export function getUsedMarketTrustStatus() {
  return apiRequest<UsedMarketTrustStatus>("/trust/me");
}

export function saveTrustProfile(formData: FormData) {
  return apiRequest<{
    trustProfile: UsedMarketTrustProfile;
    trust: UsedMarketTrustStatus;
  }>("/trust/profile", {
    method: "PUT",
    body: formData,
  });
}

export function savePayoutAccount(input: {
  bankName: string;
  accountName: string;
  accountNumber: string;
}) {
  return apiRequest<{
    payoutAccount: UsedMarketPayoutAccount;
    trust: UsedMarketTrustStatus;
  }>("/trust/payout", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
