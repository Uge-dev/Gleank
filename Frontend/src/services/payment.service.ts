import { apiRequest } from "../lib/api";

export type PaymentPurpose =
  | "store_order"
  | "used_order"
  | "seller_subscription";

export type PaymentStatus =
  | "initialized"
  | "paid"
  | "failed"
  | "cancelled"
  | "abandoned"
  | "pending";

export type GleankPayment = {
  id: string;
  reference: string;
  provider: "local" | "paystack" | string;
  purpose: PaymentPurpose;
  orderId: string | null;
  orderIds: string[];
  usedOrderId: string | null;
  subscriptionId: string | null;
  userId: string;
  amountKobo: number;
  amount: number;
  currency: "NGN";
  status: PaymentStatus;
  authorizationUrl: string;
  accessCode: string;
  providerReference: string;
  providerStatus: string;
  redirectPath: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt: string | null;
};

export function initializePayment(input: {
  purpose: PaymentPurpose;
  targetId?: string;
  targetIds?: string[];
}) {
  return apiRequest<{ payment: GleankPayment }>("/payments/initialize", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function initializeOrdersPayment(orderIds: string[]) {
  return initializePayment({
    purpose: "store_order",
    targetIds: orderIds,
  });
}

export function initializeUsedOrderPayment(orderId: string) {
  return initializePayment({
    purpose: "used_order",
    targetId: orderId,
  });
}

export function initializeSellerSubscriptionPayment() {
  return initializePayment({
    purpose: "seller_subscription",
  });
}

export function verifyPayment(reference: string) {
  return apiRequest<{ payment: GleankPayment }>("/payments/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  });
}
