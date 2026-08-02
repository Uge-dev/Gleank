import { apiRequest } from "../lib/api";
import type { GleencOrder, OrderStatus } from "../types/domain";

export type CreateOrderItemInput = {
  productId: string;
  quantity: number;
  selectedSize?: string;
};

export type CreateOrderInput = {
  buyerName: string;
  buyerPhone: string;
  campus: string;
  deliveryArea?: string;
  deliveryOption: "Pickup" | "Delivery";
  paymentMethod?: "pay_now" | "pay_on_delivery";
  deliveryAddress: string;
  deliveryDetails?: string;
  deliveryLandmark?: string;
  nearestBusStop?: string;
  deliveryLat?: number | null;
  deliveryLng?: number | null;
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

export function getPendingBuyerOrderCount() {
  return apiRequest<{ count: number }>("/orders/pending-count");
}

export function getOrder(id: string) {
  return apiRequest<{ order: GleencOrder }>(
    `/orders/${encodeURIComponent(id)}`,
  );
}

export function submitOrderReview(id: string, rating: number, body = "") {
  return apiRequest<{ review: { id: string; rating: number; body: string } }>(
    `/orders/${encodeURIComponent(id)}/review`,
    { method: "POST", body: JSON.stringify({ rating, body }) },
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

function captureSellerLocation() {
  return new Promise<
    { lat: number; lng: number; accuracyMeters: number; address?: string } | null
  >((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  });
}

export async function sellerConfirmOrder(id: string, note = "") {
  const sellerLocation = await captureSellerLocation();
  if (sellerLocation) {
    try {
      const result = await apiRequest<{
        location?: { formattedAddress?: string; address?: string };
      }>("/location/reverse-geocode", {
        method: "POST",
        body: JSON.stringify({ lat: sellerLocation.lat, lng: sellerLocation.lng }),
      });
      sellerLocation.address =
        result.location?.formattedAddress || result.location?.address || "";
    } catch {
      // Coordinates are still authoritative when a readable address cannot be
      // resolved at this moment.
    }
  }
  return apiRequest<{ order: GleencOrder }>(
    `/orders/${encodeURIComponent(id)}/seller-confirm`,
    {
      method: "POST",
      body: JSON.stringify({ note, sellerLocation }),
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
