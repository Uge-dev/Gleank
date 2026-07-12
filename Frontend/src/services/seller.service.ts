import { apiRequest } from "../lib/api";
import type {
  AvailabilityStatus,
  SellerProduct,
  PublicStoreWorkspace,
  SellerService,
  SellerStore,
  SellerWorkspace,
  StoreHighlight,
} from "../types/domain";

export function getSellerWorkspace() {
  return apiRequest<SellerWorkspace>("/seller/workspace");
}

export function updateSellerStore(formData: FormData) {
  return apiRequest<{ store: SellerStore }>("/seller/store", {
    method: "PATCH",
    body: formData,
  });
}

export function createSellerHighlight(formData: FormData) {
  return apiRequest<{ highlight: StoreHighlight }>("/seller/highlights", {
    method: "POST",
    body: formData,
  });
}

export function updateSellerHighlight(id: string, formData: FormData) {
  return apiRequest<{ highlight: StoreHighlight }>(
    `/seller/highlights/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: formData,
    },
  );
}

export function deleteSellerHighlight(id: string) {
  return apiRequest<void>(`/seller/highlights/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function reorderSellerHighlights(highlightIds: string[]) {
  return apiRequest<{ highlights: StoreHighlight[] }>(
    "/seller/highlights/reorder",
    {
      method: "PATCH",
      body: JSON.stringify({ highlightIds }),
    },
  );
}

export function createSellerProduct(formData: FormData) {
  return apiRequest<{ product: SellerProduct }>("/seller/products", {
    method: "POST",
    body: formData,
  });
}

export function updateSellerProduct(id: string, formData: FormData) {
  return apiRequest<{ product: SellerProduct }>(`/seller/products/${id}`, {
    method: "PATCH",
    body: formData,
  });
}

export function deleteSellerProduct(id: string) {
  return apiRequest<void>(`/seller/products/${id}`, {
    method: "DELETE",
  });
}

export function updateProductAvailability(
  id: string,
  input: { availabilityStatus: AvailabilityStatus; note?: string },
) {
  return apiRequest<{ product: SellerProduct }>(
    `/products/${encodeURIComponent(id)}/availability`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export type SellerPayout = {
  id: string;
  orderId: string | null;
  usedOrderId: string | null;
  sellerId: string;
  sourceType: "store_order" | "used_order";
  grossAmountKobo: number;
  grossAmount: number;
  platformFeeKobo: number;
  platformFee: number;
  deliveryFeeKobo: number;
  deliveryFee: number;
  sellerAmountKobo: number;
  sellerAmount: number;
  status: string;
  holdReason: string;
  releaseAfter: string | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export function getSellerPayouts() {
  return apiRequest<{ payouts: SellerPayout[] }>("/seller/payouts");
}

export function createSellerService(formData: FormData) {
  return apiRequest<{ service: SellerService }>("/seller/services", {
    method: "POST",
    body: formData,
  });
}

export function updateSellerService(id: string, formData: FormData) {
  return apiRequest<{ service: SellerService }>(`/seller/services/${id}`, {
    method: "PATCH",
    body: formData,
  });
}

export function deleteSellerService(id: string) {
  return apiRequest<void>(`/seller/services/${id}`, {
    method: "DELETE",
  });
}

export function getPublicStore(slug: string) {
  return apiRequest<PublicStoreWorkspace>(
    `/stores/${encodeURIComponent(slug)}`,
  );
}

export function followPublicStore(slug: string) {
  return apiRequest<{
    interaction: PublicStoreWorkspace["interaction"];
  }>(`/stores/${encodeURIComponent(slug)}/follow`, {
    method: "POST",
  });
}

export function unfollowPublicStore(slug: string) {
  return apiRequest<{
    interaction: PublicStoreWorkspace["interaction"];
  }>(`/stores/${encodeURIComponent(slug)}/follow`, {
    method: "DELETE",
  });
}
