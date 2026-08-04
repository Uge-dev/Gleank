import { apiRequest } from "../lib/api";

export type LocationCatalog = {
  country: string;
  countries: Array<{ code: string; name: string }>;
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

export function getLocationCatalog(country?: string, stateQuery?: string) {
  const params = new URLSearchParams();
  if (country?.trim()) params.set("country", country.trim());
  if (stateQuery?.trim()) params.set("stateQuery", stateQuery.trim());
  const query = params.toString();
  return apiRequest<LocationCatalog>(`/location/catalog${query ? `?${query}` : ""}`);
}

export function geocodeSellerLocation(text: string, country?: string) {
  return apiRequest<{
    provider: string;
    fallback: boolean;
    results: GeocodedSellerLocation[];
  }>("/location/geocode", {
    method: "POST",
    body: JSON.stringify({ text, country, limit: 5 }),
  });
}
