import { apiRequest } from "../lib/api";
import type {
  ProductComment,
  ProductDetailsResponse,
  ProductInteraction,
  UsedListing,
  UsedMarketTrustStatus,
} from "../types/domain";

export function getPublicProduct(id: string) {
  return apiRequest<ProductDetailsResponse>(
    `/products/${encodeURIComponent(id)}`,
  );
}

export function likePublicProduct(id: string) {
  return apiRequest<{ interaction: ProductInteraction }>(
    `/products/${encodeURIComponent(id)}/like`,
    { method: "POST" },
  );
}

export function unlikePublicProduct(id: string) {
  return apiRequest<{ interaction: ProductInteraction }>(
    `/products/${encodeURIComponent(id)}/like`,
    { method: "DELETE" },
  );
}

export function sharePublicProduct(id: string, anonKey = "") {
  return apiRequest<{ interaction: ProductInteraction }>(
    `/products/${encodeURIComponent(id)}/share`,
    {
      method: "POST",
      body: JSON.stringify({ anonKey }),
    },
  );
}

export function viewPublicProduct(id: string, anonKey = "") {
  return apiRequest<{ interaction: ProductInteraction }>(
    `/products/${encodeURIComponent(id)}/view`,
    {
      method: "POST",
      body: JSON.stringify({ anonKey }),
    },
  );
}


export function commentOnPublicProduct(id: string, body: string) {
  return apiRequest<{ comment: ProductComment }>(
    `/products/${encodeURIComponent(id)}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    },
  );
}

export function getUsedListings(input?: {
  query?: string;
  category?: string;
}) {
  const params = new URLSearchParams();
  if (input?.query?.trim()) params.set("q", input.query.trim());
  if (input?.category?.trim()) params.set("category", input.category.trim());

  const suffix = params.size ? `?${params.toString()}` : "";
  return apiRequest<{ listings: UsedListing[] }>(`/used-market${suffix}`);
}

export function getUsedListing(id: string) {
  return apiRequest<{ listing: UsedListing }>(
    `/used-market/${encodeURIComponent(id)}`,
  );
}

export function getOwnUsedListings() {
  return apiRequest<{ listings: UsedListing[] }>("/used-market/mine");
}


export function getUsedMarketTrustStatus() {
  return apiRequest<UsedMarketTrustStatus>("/used-market/trust");
}

export function reportUsedListing(
  id: string,
  input: { reason: string; details: string },
) {
  return apiRequest<{ success: boolean }>(
    `/used-market/${encodeURIComponent(id)}/report`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function createUsedListing(formData: FormData) {
  return apiRequest<{ listing: UsedListing }>("/used-market", {
    method: "POST",
    body: formData,
  });
}

export function updateUsedListingStatus(
  id: string,
  status: "active" | "sold",
) {
  return apiRequest<{ listing: UsedListing }>(
    `/used-market/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
  );
}
