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

export type SellerPickupTaskItem = {
  id: string;
  productId: string;
  name: string;
  imageUrl: string;
  unitPrice: number;
  quantity: number;
  total: number;
};

export type SellerPickupTask = {
  id: string;
  deliveryBatchId: string;
  orderId: string | null;
  sellerId: string;
  sellerName: string;
  orderCode: string;
  packageTagCode?: string;
  sellerPickupCode?: string;
  packageInstruction?: string;
  pickupZoneId: string | null;
  pickupLandmark: string;
  pickupSequence: number;
  itemCount: number;
  packageProfileSnapshot: Record<string, unknown>;
  orderItems: SellerPickupTaskItem[];
  status: string;
  sellerConfirmedAvailability: boolean;
  sellerMarkedReady: boolean;
  packageSize?: string;
  packageWeightClass?: string;
  handlingClass?: string;
  pickupPointConfirmed?: boolean;
  packageReadyNote?: string;
  batchStatus?: string;
  dispatchStatus?: string;
  assignedRiderId?: string | null;
  dispatchAttemptCount?: number;
  manualAssignmentAllowed?: boolean;
  confirmationDeadlineAt: string | null;
  sellerConfirmedAt: string | null;
  sellerRejectedAt: string | null;
  sellerRejectionNote: string;
  readyAt: string | null;
  pickedUpAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AvailableDeliveryRider = {
  id: string;
  name: string;
  displayName?: string;
  dispatchScore?: number;
  matchSummary?: string;
  availabilityMode?: string;
  privacyNote?: string;
  profile?: {
    availability?: string;
    coverageArea?: string;
    transportType?: string;
    maxPackageSize?: string;
    maxWeightClass?: string;
    ratingAverage?: number;
    completedDeliveries?: number;
  };
};

export function getSellerPickupTasks() {
  return apiRequest<{ pickupTasks: SellerPickupTask[] }>("/seller/pickup-tasks");
}

export function confirmSellerOrderItemAvailability(orderItemId: string, note = "") {
  return apiRequest<{ pickupTask: SellerPickupTask }>(
    `/seller/order-items/${encodeURIComponent(orderItemId)}/confirm-availability`,
    {
      method: "POST",
      body: JSON.stringify({ note }),
    },
  );
}

export function rejectSellerOrderItemAvailability(orderItemId: string, note = "") {
  return apiRequest<{ pickupTask: SellerPickupTask }>(
    `/seller/order-items/${encodeURIComponent(orderItemId)}/reject-availability`,
    {
      method: "POST",
      body: JSON.stringify({ note }),
    },
  );
}

export function markSellerPickupTaskReady(
  pickupTaskId: string,
  input: {
    packageSize?: string;
    packageWeightClass?: string;
    handlingClass?: string;
    pickupPointConfirmed?: boolean;
    note?: string;
  } = {},
) {
  return apiRequest<{ pickupTask: SellerPickupTask }>(
    `/seller/pickup-tasks/${encodeURIComponent(pickupTaskId)}/mark-ready`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function getAvailableDeliveryRiders(batchId: string) {
  return apiRequest<{ riders: AvailableDeliveryRider[] }>(
    `/dispatch/batches/${encodeURIComponent(batchId)}/rider-candidates`,
  );
}

export function sendDeliveryOfferToRider(input: {
  batchId: string;
  riderId: string;
}) {
  return apiRequest<{ batch: unknown; attempt: unknown }>(
    `/dispatch/batches/${encodeURIComponent(input.batchId)}/offers`,
    {
      method: "POST",
      body: JSON.stringify({
        riderId: input.riderId,
      }),
    },
  );
}

export function startAutomaticDispatchForBatch(batchId: string) {
  return apiRequest<{ batch: unknown; attempt: unknown; sellerManualAssignmentRequired?: boolean }>(
    `/dispatch/batches/${encodeURIComponent(batchId)}/start`,
    {
      method: "POST",
    },
  );
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
