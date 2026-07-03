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
