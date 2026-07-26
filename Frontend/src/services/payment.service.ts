import { apiRequest } from "../lib/api";

export type PaymentPurpose =
  | "store_order"
  | "used_order"
  | "seller_subscription";

export type GleencPaymentStatus =
  | "initialized"
  | "paid"
  | "failed"
  | "cancelled";

export type GleencPayment = {
  id: string;
  reference: string;
  provider: string;
  purpose: PaymentPurpose;
  orderId: string | null;
  usedOrderId: string | null;
  subscriptionId: string | null;
  userId?: string;
  amountKobo: number;
  amount: number;
  currency: "NGN";
  status: GleencPaymentStatus;
  authorizationUrl: string;
  providerReference: string;
  providerStatus?: string;
  redirectPath?: string;
  successPath?: string;
  summary?: PaymentSummary | null;
  createdAt: string;
  updatedAt: string;
};

export type InitializedPayment = GleencPayment;
export type VerifyPaymentResult = GleencPayment;

export type PaymentSummaryItem = {
  name: string;
  imageUrl?: string | null;
  quantity: number;
  totalKobo: number;
  total: number;
};

export type PaymentSummary = {
  type: "store_order" | "used_order" | "seller_subscription";
  orderId?: string;
  orderCode?: string;
  status: string;
  paymentStatus?: string;
  storeName?: string;
  listingName?: string;
  totalKobo: number;
  total: number;
  createdAt: string;
  items?: PaymentSummaryItem[];
};

export function initializePayment(input: {
  purpose: PaymentPurpose;
  targetId?: string;
}) {
  return apiRequest<{ payment: GleencPayment }>("/payments/initialize", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function verifyPayment(reference: string) {
  return apiRequest<{ payment: GleencPayment }>("/payments/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  });
}

export function verifyPublicPayment(reference: string) {
  return apiRequest<{ payment: GleencPayment }>("/payments/public/verify", {
    method: "POST",
    body: JSON.stringify({ reference }),
  });
}

export async function initializeOrdersPayment(orderIds: string[]) {
  const firstOrderId = orderIds[0];

  if (!firstOrderId) {
    throw new Error("No order was selected for payment.");
  }

  return initializePayment({
    purpose: "store_order",
    targetId: firstOrderId,
  });
}

export function initializePayAtDeliveryPayment(orderId: string) {
  return apiRequest<{ payment: GleencPayment }>(
    "/payments/pay-at-delivery/initialize",
    {
      method: "POST",
      body: JSON.stringify({ orderId }),
    },
  );
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

export function getPaymentRedirectUrl(payment: GleencPayment) {
  if (!payment.authorizationUrl) {
    throw new Error("Payment authorization URL was not returned.");
  }

  return payment.authorizationUrl;
}

export function isPaymentSuccessful(payment: GleencPayment) {
  return payment.status === "paid";
}
