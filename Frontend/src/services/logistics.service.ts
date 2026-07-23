import { apiRequest } from "../lib/api";

export type DeliveryZone = {
  id: string;
  name: string;
  parentAreaId: string | null;
  zoneType: "campus" | "local_market" | "nearby_area" | "general_area" | string;
  baseDeliveryFeeKobo: number;
  baseDeliveryFee: number;
  extraPickupFeeKobo: number;
  extraPickupFee: number;
  supportedDeliveryTypes: string[];
  isActive: boolean;
  availabilityStatus: string;
  availabilityNote: string;
};

export type CheckoutDeliveryGroup = {
  id: string;
  batchType: string;
  itemCount: number;
  sellerCount: number;
  packageSizeSummary: string;
  weightClassSummary: string;
  fragilitySummary: string;
  requiredVehicleType: string;
  requiresGps: boolean;
  requiresPhotoProof: boolean;
  canBatch: boolean;
  deliveryFeeKobo: number;
  deliveryFee: number;
  riskLevel: string;
  products: Array<{ id: string; name: string; category: string }>;
};

export type CheckoutGroupingPreview = {
  groups: CheckoutDeliveryGroup[];
  totalDeliveryFeeKobo: number;
  totalDeliveryFee: number;
};

export type RiderCapacityProfile = {
  riderId: string;
  transportType: string;
  maxPackageSize: string;
  maxWeightClass: string;
  fragileHandlingAbility: string;
  deliveryBagType: string;
  serviceZoneIds: string[];
  currentZoneId: string | null;
  gpsPermissionStatus: string;
  availabilityMode: string;
  canReceiveAutoDispatch: boolean;
  capacityLocked?: boolean;
  capacityChangeUnlockedUntil?: string | null;
  currentActiveBatchCount: number;
  acceptanceRate: number;
  rejectionRate: number;
  responseSpeedScore: number;
  reliabilityScore: number;
};

export type AdminDispatchSummary = {
  dispatches: unknown[];
  stats: {
    pending: number;
    offered: number;
    accepted: number;
    noRider: number;
    highRisk: number;
  };
};

export function getZones() {
  return apiRequest<{ zones: DeliveryZone[] }>("/zones");
}

export function getCheckoutGroupingPreview(input: {
  items: Array<{ productId: string; quantity: number }>;
}) {
  return apiRequest<CheckoutGroupingPreview>("/orders/grouping-preview", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getRiderCapacityProfile() {
  return apiRequest<{ capacityProfile: RiderCapacityProfile }>("/rider/capacity-profile");
}

export function updateRiderCapacityProfile(input: Partial<RiderCapacityProfile>) {
  return apiRequest<{ capacityProfile: RiderCapacityProfile }>("/rider/capacity-profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateRiderServiceZones(zoneIds: string[]) {
  return apiRequest<{ capacityProfile: RiderCapacityProfile }>("/rider/service-zones", {
    method: "PATCH",
    body: JSON.stringify({ zoneIds }),
  });
}

export function updateRiderCurrentZone(currentZoneId: string) {
  return apiRequest<{ capacityProfile: RiderCapacityProfile }>("/rider/current-zone", {
    method: "PATCH",
    body: JSON.stringify({ currentZoneId }),
  });
}

export function updateRiderLocationPermissionStatus(input: {
  gpsPermissionStatus: string;
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
}) {
  return apiRequest<{ capacityProfile: RiderCapacityProfile }>("/rider/location-permission-status", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function getAdminDispatchOperations() {
  return apiRequest<AdminDispatchSummary>("/admin/live-dispatch");
}

export function getAdminInterventionQueue() {
  return apiRequest<{ queue: unknown[] }>("/admin/intervention-queue");
}
