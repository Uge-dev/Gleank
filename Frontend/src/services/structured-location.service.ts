import { apiRequest } from "../lib/api";

export type LocationCatalog = {
  country: string;
  states: Array<{ name: string; cities: string[] }>;
  campuses: string[];
  marketplaces: Array<{
    id: string;
    name: string;
    state: string;
    city: string;
    lat: number | null;
    lng: number | null;
  }>;
};

export type GeocodedSellerLocation = {
  provider: string;
  formattedAddress: string;
  address: string;
  area: string;
  campus: string;
  placeId: string;
  country: string;
  state: string;
  city: string;
  lat: number | null;
  lng: number | null;
  confidence: number;
};

export function getLocationCatalog() {
  return apiRequest<LocationCatalog>("/location/catalog");
}

export function geocodeSellerLocation(text: string) {
  return apiRequest<{
    provider: string;
    fallback: boolean;
    results: GeocodedSellerLocation[];
  }>("/location/geocode", {
    method: "POST",
    body: JSON.stringify({ text, limit: 5 }),
  });
}
