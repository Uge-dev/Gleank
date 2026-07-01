import { apiRequest } from "../lib/api";

export type InitializedPayment = {
  reference: string;
  accessCode?: string;
  authorizationUrl: string;
};

export type VerifyPaymentResult = {
  success: boolean;
  status: string;
  reference: string;
  purpose: "orders" | "used_order" | "seller_subscription";
  redirectPath: string;
};

export function initializeOrdersPayment(orderIds: string[]) {
  return apiRequest<{ payment: InitializedPayment }>("/payments/orders/initialize", {
    method: "POST",
    body: JSON.stringify({ orderIds }),
  });
}

export function initializeUsedOrderPayment(orderId: string) {
  return apiRequest<{ payment: InitializedPayment }>(
    `/payments/used-orders/${encodeURIComponent(orderId)}/initialize`,
    { method: "POST" },
  );
}

export function initializeSellerSubscriptionPayment() {
  return apiRequest<{ payment: InitializedPayment }>(
    "/payments/seller-subscription/initialize",
    { method: "POST" },
  );
}

export function verifyPayment(reference: string) {
  return apiRequest<{ payment: VerifyPaymentResult }>(
    `/payments/verify/${encodeURIComponent(reference)}`,
  );
}
