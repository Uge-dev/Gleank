import { apiRequest } from "../lib/api";
import type { SellerSubscription } from "../types/domain";

export function getSellerSubscription() {
  return apiRequest<{ subscription: SellerSubscription | null }>(
    "/subscriptions/seller/me",
  );
}

export function activateSellerSubscriptionForDevelopment() {
  return apiRequest<{ subscription: SellerSubscription }>(
    "/subscriptions/seller/activate-development",
    { method: "POST" },
  );
}
