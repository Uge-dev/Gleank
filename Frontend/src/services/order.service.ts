import { apiRequest } from "../lib/api";
import type { GleankOrder, OrderStatus } from "../types/domain";

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
  return apiRequest<{ orders: GleankOrder[] }>("/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getOrders() {
  return apiRequest<{ orders: GleankOrder[] }>("/orders");
}

export function getOrder(id: string) {
  return apiRequest<{ order: GleankOrder }>(
    `/orders/${encodeURIComponent(id)}`,
  );
}

export function updateOrderStatus(
  id: string,
  status: OrderStatus,
  note = "",
) {
  return apiRequest<{ order: GleankOrder }>(
    `/orders/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    },
  );
}
