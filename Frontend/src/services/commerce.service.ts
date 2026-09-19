import { apiRequest } from "../lib/api";
import type { GleencOrder } from "../types/domain";
export type AccountProfile = {
  username: string;
  displayName: string;
  bio: string;
  activities: string[];
  interests: string[];
  completedAt: string;
};
export type FulfillmentSettings = {
  name: string;
  coverage: string;
  deliveryFee: number;
  deliveryDays: number;
  dispatchAddress: string;
  phone: string;
};
export type DeliveryPackage = {
  id: string;
  orderItemId: string;
  status: string;
  method: string;
  transportName: string;
  trackingReference: string;
  expectedArrival: string;
  hasReceipt: boolean;
  dispatchedAt: string | null;
  confirmedAt: string | null;
  code?: string;
};
export type Quote = {
  sellers: {
    storeId: string;
    storeName: string;
    subtotalKobo: number;
    deliveryFeeKobo: number;
    coverage: string;
    deliveryDays: number;
  }[];
  totalKobo: number;
};
export const commerce = {
  profile: () =>
    apiRequest<{ profile: AccountProfile | null }>("/commerce/profile"),
  saveProfile: (input: unknown) =>
    apiRequest("/commerce/profile", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  settings: () =>
    apiRequest<{ settings: FulfillmentSettings | null }>("/commerce/selling"),
  saveSettings: (input: FulfillmentSettings) =>
    apiRequest("/commerce/selling", {
      method: "PUT",
      body: JSON.stringify(input),
    }),
  orders: () =>
    apiRequest<{ purchases: GleencOrder[]; sales: GleencOrder[] }>(
      "/commerce/orders",
    ),
  quote: (items: { productId: string; quantity: number }[]) =>
    apiRequest<Quote>("/commerce/quote", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  packages: (id: string) =>
    apiRequest<{ packages: DeliveryPackage[] }>(
      `/commerce/orders/${id}/packages`,
    ),
  prepare: (id: string) =>
    apiRequest<{ packages: DeliveryPackage[] }>(
      `/commerce/orders/${id}/packages`,
      { method: "POST" },
    ),
  dispatch: (id: string, pkg: string, body: FormData) =>
    apiRequest(`/commerce/orders/${id}/packages/${pkg}/dispatch`, {
      method: "POST",
      body,
    }),
  confirm: (id: string, pkg: string, code: string) =>
    apiRequest(`/commerce/orders/${id}/packages/${pkg}/confirm`, {
      method: "POST",
      body: JSON.stringify({ code, confirmReceived: true }),
    }),
  remind: (id: string, pkg: string) =>
    apiRequest<{ message: string }>(
      `/commerce/orders/${id}/packages/${pkg}/remind`,
      { method: "POST" },
    ),
};
