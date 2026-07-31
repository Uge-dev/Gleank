import { apiRequest } from "../lib/api";

type LocationRole = "buyer" | "seller" | "rider";

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
    currentLocation = await browserLocation();
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
