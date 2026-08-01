import { apiRequest } from "../lib/api";

type LocationRole = "buyer" | "seller" | "rider";
const LOCATION_CACHE_KEY = "gleenc-location-cache-v1";
const LOCATION_CACHE_COOKIE = "gleenc_location_cache_at";
const LOCATION_CACHE_TTL_MS = 15 * 60 * 1000;

export type AccountLocationPresence = {
  userId: string;
  role: LocationRole;
  lat: number | null;
  lng: number | null;
  accuracyMeters: number | null;
  permissionStatus: "unknown" | "prompt" | "granted" | "denied" | "unavailable";
  source: string;
  capturedAt: string | null;
  updatedAt: string;
};

function notifyLocationStatus(
  status: AccountLocationPresence["permissionStatus"],
  message: string,
) {
  window.dispatchEvent(
    new CustomEvent("gleenc-location-status", {
      detail: { status, message },
    }),
  );
}

function browserLocation() {
  return new Promise<{
    lat: number;
    lng: number;
    accuracyMeters: number;
  }>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Object.assign(new Error("Location is not available in this browser."), { code: 0 }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        }),
      reject,
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 60_000,
      },
    );
  });
}

function cachedBrowserLocation() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(LOCATION_CACHE_KEY) || "null") as {
      lat?: number;
      lng?: number;
      accuracyMeters?: number;
      capturedAt?: number;
    } | null;
    if (
      cached &&
      Number.isFinite(cached.lat) &&
      Number.isFinite(cached.lng) &&
      Number(cached.capturedAt || 0) + LOCATION_CACHE_TTL_MS > Date.now() &&
      document.cookie
        .split(";")
        .map((part) => part.trim())
        .some((part) => {
          if (!part.startsWith(`${LOCATION_CACHE_COOKIE}=`)) return false;
          const capturedAt = Number(part.slice(LOCATION_CACHE_COOKIE.length + 1));
          return Number.isFinite(capturedAt) && capturedAt + LOCATION_CACHE_TTL_MS > Date.now();
        })
    ) {
      return {
        lat: Number(cached.lat),
        lng: Number(cached.lng),
        accuracyMeters: Number(cached.accuracyMeters || 0),
      };
    }
  } catch {
    // A malformed browser cache is ignored and replaced by a fresh reading.
  }
  return null;
}

async function syncPermissionStatus(
  permissionStatus: "denied" | "unavailable",
  role: string,
) {
  try {
    await apiRequest<{ presence: AccountLocationPresence | null }>(
      "/location/presence",
      {
        method: "POST",
        headers: role === "rider" ? { "X-Gleenc-Portal": "rider" } : undefined,
        body: JSON.stringify({
          permissionStatus,
          source: "browser_login",
        }),
      },
    );
  } catch {
    // Login remains successful even when the optional routing update cannot sync.
  }
}

export async function requestLocationAfterLogin(role: string) {
  if (!["buyer", "seller", "rider"].includes(role)) return null;

  let currentLocation: Awaited<ReturnType<typeof browserLocation>>;
  try {
    currentLocation = cachedBrowserLocation() || await browserLocation();
    const capturedAt = Date.now();
    window.localStorage.setItem(
      LOCATION_CACHE_KEY,
      JSON.stringify({ ...currentLocation, capturedAt }),
    );
    document.cookie = [
      `${LOCATION_CACHE_COOKIE}=${capturedAt}`,
      `Max-Age=${Math.floor(LOCATION_CACHE_TTL_MS / 1000)}`,
      "Path=/",
      "SameSite=Lax",
      window.location.protocol === "https:" ? "Secure" : "",
    ].filter(Boolean).join("; ");
  } catch (error) {
    const denied =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      Number((error as { code?: unknown }).code) === 1;
    const permissionStatus = denied ? "denied" : "unavailable";
    await syncPermissionStatus(permissionStatus, role);
    notifyLocationStatus(
      permissionStatus,
      denied
        ? "Location is off. Enable it in your browser settings for accurate delivery routing."
        : "Gleenc could not read your location. Check your connection and browser location settings.",
    );
    return null;
  }

  try {
    const response = await apiRequest<{
      presence: AccountLocationPresence;
      routingReady: boolean;
    }>("/location/presence", {
      method: "POST",
      headers: role === "rider" ? { "X-Gleenc-Portal": "rider" } : undefined,
      body: JSON.stringify({
        permissionStatus: "granted",
        source: "browser_login",
        currentLocation,
      }),
    });

    notifyLocationStatus(
      "granted",
      "Location is on. Gleenc can use it for delivery routing and rider selection.",
    );
    return response.presence;
  } catch {
    notifyLocationStatus(
      "unavailable",
      "Your location was found, but Gleenc could not save it for routing. Check your connection.",
    );
    return null;
  }
}
