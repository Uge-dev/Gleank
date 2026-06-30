import { apiRequest } from "../lib/api";

export type PaymentPurpose =
  | "store_order"
  | "used_order"
  | "seller_subscription";

export type GleankPayment = {
  id: string;
  reference: string;
  provider: string;
  purpose: PaymentPurpose;
  orderId: string | null;
  usedOrderId: string | null;
  subscriptionId: string | null;
  userId: string;
  amountKobo: number;
  amount: number;
  currency: "NGN";
  status: "initialized" | "paid" | "failed" | "cancelled";
  authorizationUrl: string;
  providerReference: string;
  createdAt: string;
  updatedAt: string;
};

export function initializePayment(input: {
  purpose: PaymentPurpose;
  targetId?: string;
}) {
  return apiRequest<{ payment: GleankPayment }>("/payments/initialize", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function verifyPayment(reference: string) {
  return apiRequest<{ payment: GleankPayment }>("/payments/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  });
}
