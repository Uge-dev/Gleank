import { apiRequest } from "../lib/api";
import type { UsedMarketOrder, UsedMarketOrderStatus } from "../types/domain";
import type { AvailableDeliveryRider } from "./seller.service";

export type CreateUsedOrderInput = {
  listingId: string;
  quantity: number;
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

/**
 * OLD DEVELOPMENT PAYMENT FLOW
 * Keep this only if your backend still has /used-orders/:id/pay.
 * For real Paystack flow, use initializeUsedOrderPayment()
 * from payment.service.ts instead.
 */
export function payUsedOrder(id: string) {
  return apiRequest<{ order: UsedMarketOrder }>(
    `/used-orders/${encodeURIComponent(id)}/pay`,
    {
      method: "POST",
    },
  );
}

/**
 * Seller verifies the buyer's delivery/pickup code.
 * Backend route expected:
 * POST /api/used-orders/:id/verify-delivery
 *
 * Request body:
 * {
 *   code: string,
 *   note: string
 * }
 */
export function verifyUsedOrderDelivery(
  id: string,
  code: string,
  note = "",
) {
  return apiRequest<{ order: UsedMarketOrder }>(
    `/used-orders/${encodeURIComponent(id)}/verify-delivery`,
    {
      method: "POST",
      body: JSON.stringify({ code, note }),
    },
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
  return apiRequest<{ success: boolean; order: UsedMarketOrder }>(
    `/used-orders/${encodeURIComponent(id)}/delivery-proof`,
    {
      method: "POST",
      body: formData,
    },
  );
}

export function chooseUsedOrderFulfillment(
  id: string,
  method: "gleenc_rider" | "external_delivery",
) {
  return apiRequest<{ order: UsedMarketOrder }>(
    `/used-orders/${encodeURIComponent(id)}/fulfillment`,
    { method: "PATCH", body: JSON.stringify({ method }) },
  );
}

export function getUsedOrderAvailableRiders(id: string) {
  return apiRequest<{ riders: AvailableDeliveryRider[] }>(
    `/used-orders/${encodeURIComponent(id)}/available-riders`,
  );
}

export function assignUsedOrderRider(id: string, riderId: string) {
  return apiRequest<{ assignment: unknown; pickupCode?: string }>(
    `/used-orders/${encodeURIComponent(id)}/assign-rider`,
    {
      method: "POST",
      body: JSON.stringify({ riderId }),
    },
  );
}
