import { apiRequest } from "../lib/api";
import type { GleencOrder, OrderStatus } from "../types/domain";

export type CreateOrderItemInput = {
  productId: string;
  quantity: number;
};

export type CreateOrderInput = {
  buyerName: string;
  buyerPhone: string;
  campus: string;
  deliveryOption: "Pickup" | "Delivery";
  paymentMethod?: "pay_now" | "pay_on_delivery";
  deliveryAddress: string;
  pickupLocation: string;
  note?: string;
  items: CreateOrderItemInput[];
};

export function createOrders(input: CreateOrderInput) {
  return apiRequest<{ orders: GleencOrder[] }>("/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getOrders() {
  return apiRequest<{ orders: GleencOrder[] }>("/orders");
}

export function getOrder(id: string) {
  return apiRequest<{ order: GleencOrder }>(
    `/orders/${encodeURIComponent(id)}`,
  );
}

export function updateOrderStatus(
  id: string,
  status: OrderStatus,
  note = "",
) {
  return apiRequest<{ order: GleencOrder }>(
    `/orders/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    },
  );
}

export function payOrder(id: string, reference = "") {
  return apiRequest<{ order: GleencOrder }>(
    `/orders/${encodeURIComponent(id)}/pay`,
    {
      method: "POST",
      body: JSON.stringify({ reference }),
    },
  );
}

export function sellerConfirmOrder(id: string, note = "") {
  return apiRequest<{ order: GleencOrder }>(
    `/orders/${encodeURIComponent(id)}/seller-confirm`,
    {
      method: "POST",
      body: JSON.stringify({ note }),
    },
  );
}

export function sellerRejectOrder(id: string, note = "") {
  return apiRequest<{ order: GleencOrder }>(
    `/orders/${encodeURIComponent(id)}/seller-reject`,
    {
      method: "POST",
      body: JSON.stringify({ note }),
    },
  );
}

export type OrderReturnRequest = {
  id: string;
  orderId: string | null;
  usedOrderId: string | null;
  requesterId: string;
  sellerId: string;
  sourceType: "store_order" | "used_order";
  reason: string;
  description: string;
  evidenceUrls: string[];
  status: string;
  sellerResponse: string;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderDispute = {
  id: string;
  orderId: string | null;
  usedOrderId: string | null;
  returnRequestId: string | null;
  openedBy: string;
  sellerId: string;
  sourceType: "store_order" | "used_order";
  reason: string;
  status: string;
  adminDecision: string;
  createdAt: string;
  updatedAt: string;
};

export function listOrderReturns(id: string) {
  return apiRequest<{ returns: OrderReturnRequest[] }>(
    `/orders/${encodeURIComponent(id)}/returns`,
  );
}

export function openOrderReturn(
  id: string,
  input: { reason: string; description?: string; evidenceUrls?: string[] },
) {
  return apiRequest<{ returnRequest: OrderReturnRequest }>(
    `/orders/${encodeURIComponent(id)}/returns`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function openOrderDispute(id: string, input: { reason: string }) {
  return apiRequest<{ dispute: OrderDispute }>(
    `/orders/${encodeURIComponent(id)}/disputes`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function verifyOrderDelivery(
  id: string,
  verificationCode: string,
  note = "",
) {
  return apiRequest<{ order: GleencOrder }>(
    `/orders/${encodeURIComponent(id)}/verify-delivery`,
    {
      method: "POST",
      body: JSON.stringify({ verificationCode, note }),
    },
  );
}
