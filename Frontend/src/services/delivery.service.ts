import { apiRequest } from "../lib/api";

export type DeliveryZone = {
  id: string;
  label: string;
};

export type DeliveryZonesResponse = {
  campus: string;
  defaultOrigin: string;
  pricing: {
    baseFeeKobo: number;
    perKmKobo: number;
    minimumFeeKobo: number;
    maximumFeeKobo: number;
    freeRadiusKm: number;
    roundToKobo: number;
  };
  zones: DeliveryZone[];
};

export type DeliveryQuote = {
  campus: string;
  deliveryOption: "Pickup" | "Delivery";
  origin: DeliveryZone | null;
  destination: DeliveryZone | null;
  distanceKm: number;
  feeKobo: number;
  fee: number;
  label: string;
};

export type DeliveryQuoteInput = {
  campus: string;
  deliveryOption: "Pickup" | "Delivery";
  origin?: string;
  destination?: string;
  deliveryAddress?: string;
};

export function getDeliveryZones(campus: string) {
  return apiRequest<DeliveryZonesResponse>(
    `/delivery/zones?campus=${encodeURIComponent(campus)}`,
  );
}

export function quoteDeliveryFee(input: DeliveryQuoteInput) {
  return apiRequest<{ quote: DeliveryQuote }>("/delivery/quote", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
