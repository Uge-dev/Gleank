import { apiRequest } from "../lib/api";
import type { UsedMarketOrder, UsedMarketOrderStatus } from "../types/domain";

export type CreateUsedOrderInput = {
  listingId: string;
  buyerName: string;
  buyerPhone: string;
  campus: string;
  deliveryOption: "Pickup" | "Delivery" | "Pickup & Delivery";
  deliveryAddress?: string;
  pickupLocation?: string;
  note?: string;
};

export function createUsedOrder(input: CreateUsedOrderInput) {
  return apiRequest<{ order: UsedMarketOrder }>("/used-orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getUsedOrders() {
  return apiRequest<{ orders: UsedMarketOrder[] }>("/used-orders");
}

export function getUsedOrder(id: string) {
  return apiRequest<{ order: UsedMarketOrder }>(
    `/used-orders/${encodeURIComponent(id)}`,
  );
}

export function payUsedOrder(id: string) {
  return apiRequest<{ order: UsedMarketOrder }>(
    `/used-orders/${encodeURIComponent(id)}/pay`,
    { method: "POST" },
  );
}

export function updateUsedOrderStatus(
  id: string,
  status: UsedMarketOrderStatus,
  note = "",
) {
  return apiRequest<{ order: UsedMarketOrder }>(
    `/used-orders/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    },
  );
}

export function submitUsedDeliveryProof(id: string, formData: FormData) {
  return apiRequest<{ success: boolean }>(
    `/used-orders/${encodeURIComponent(id)}/delivery-proof`,
    {
      method: "POST",
      body: formData,
    },
  );
}
