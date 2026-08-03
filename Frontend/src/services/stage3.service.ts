import { apiRequest } from "../lib/api";

export type KycStatus =
  | "not_started"
  | "started"
  | "pending_review"
  | "verified"
  | "failed"
  | "rejected"
  | "resubmission_requested";

export type KycVerification = {
  id: string;
  userId?: string;
  role?: "seller" | "rider";
  provider: "mock" | "manual" | "dojah";
  providerReferenceId?: string;
  status: KycStatus;
  level: number;
  requiresAdminReview: boolean;
  adminReviewStatus: string;
  failureReason: string;
  documentUrls: string[];
  selfieUrl: string | null;
  livenessReference?: string;
  submittedPayload: Record<string, unknown>;
  rawProviderPayload?: Record<string, unknown>;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  startedAt?: string | null;
  verifiedAt?: string | null;
  failedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type KycStatusResponse = {
  kyc: KycVerification;
  completionPercent: number;
};

export type GeocodedLocation = {
  provider: "manual" | "geoapify";
  formattedAddress: string;
  address: string;
  area: string;
  campus: string;
  lat: number | null;
  lng: number | null;
  confidence: number;
  raw?: unknown;
};

export type SavedLocation = {
  id: string;
  type: string;
  label: string;
  address: string;
  area: string;
  campus: string;
  landmark?: string;
  marketId?: string | null;
  marketName?: string;
  shopNumber?: string;
  shopSection?: string;
  pickupInstruction?: string;
  lat: number | null;
  lng: number | null;
  source: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PriceValidation = {
  status: "ok" | "warning" | "review" | "block";
  ok: boolean;
  requiresReview: boolean;
  reason: string;
  priceKobo: number;
  range: null | {
    id: string;
    minPrice: number;
    maxPrice: number;
    minPriceKobo: number;
    maxPriceKobo: number;
    action: string;
    note: string;
  };
};

export function startKyc(provider?: "mock" | "manual" | "dojah") {
  return apiRequest<{
    kyc: KycVerification;
    provider: string;
    providerSession: Record<string, unknown> | null;
    setupRequired: boolean;
  }>("/kyc/start", {
    method: "POST",
    body: JSON.stringify({ provider }),
  });
}

export function getKycStatus() {
  return apiRequest<KycStatusResponse>("/kyc/status");
}

export function submitManualKyc(formData: FormData) {
  return apiRequest<{ kyc: KycVerification }>("/kyc/manual/submit", {
    method: "POST",
    body: formData,
  });
}

export function geocodeAddress(input: {
  text?: string;
  address?: string;
  area?: string;
  campus?: string;
  autocomplete?: boolean;
  limit?: number;
  biasLat?: number | null;
  biasLng?: number | null;
}) {
  return apiRequest<{
    provider: "manual" | "geoapify";
    fallback: boolean;
    results: GeocodedLocation[];
  }>("/location/geocode", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function reverseGeocode(input: { lat: number; lng: number; campus?: string }) {
  return apiRequest<{
    provider: "manual" | "geoapify";
    fallback: boolean;
    location: GeocodedLocation;
  }>("/location/reverse-geocode", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function saveSellerPickupLocation(input: Partial<SavedLocation>) {
  return apiRequest<{ location: SavedLocation }>("/seller/pickup-location", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getSellerPickupLocation() {
  return apiRequest<{ location: SavedLocation | null }>("/seller/pickup-location");
}

export function saveBuyerDeliveryLocation(input: Partial<SavedLocation>) {
  return apiRequest<{ location: SavedLocation }>("/buyer/delivery-location", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getBuyerDeliveryLocations() {
  return apiRequest<{ locations: SavedLocation[] }>("/buyer/delivery-locations");
}

export function validateProductPrice(input: {
  productId?: string;
  name?: string;
  category?: string;
  description?: string;
  price?: number;
  priceKobo?: number;
  sellerType?: string;
  campus?: string;
}) {
  return apiRequest<{ validation: PriceValidation }>("/products/validate-price", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function validateProductForPublish(productId: string) {
  return apiRequest<{ validation: unknown }>(
    `/products/${encodeURIComponent(productId)}/validate`,
    { method: "POST" },
  );
}

export function publishValidatedProduct(productId: string) {
  return apiRequest<{ product: unknown; validation: unknown }>(
    `/products/${encodeURIComponent(productId)}/publish`,
    { method: "POST" },
  );
}
