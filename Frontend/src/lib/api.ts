function resolveApiUrl() {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "") || "/api";

  if (typeof window === "undefined" || !/^https?:\/\//i.test(configuredUrl)) {
    return configuredUrl;
  }

  try {
    const configured = new URL(configuredUrl);
    const isVercelApp = window.location.hostname.endsWith(".vercel.app");
    const isRenderBackend = configured.hostname.endsWith(".onrender.com");

    if (isVercelApp && isRenderBackend && configured.origin !== window.location.origin) {
      return "/api";
    }
  } catch {
    // If the configured value is malformed, keep it so the request surfaces the real issue.
  }

  return configuredUrl;
}

const API_URL = resolveApiUrl();
const API_TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS || 45000);

function getApiOrigin() {
  if (/^https?:\/\//i.test(API_URL)) {
    return new URL(API_URL).origin;
  }

  const isLocalFrontend =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";

  if (isLocalFrontend) {
    return "http://localhost:4000";
  }

  return window.location.origin;
}

type ApiErrorBody = {
  error?: {
    message?: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  const isFormData = init.body instanceof FormData;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  if (init.body && !isFormData && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      credentials: "include",
      signal: init.signal || controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(
        408,
        "The server is taking too long to respond. Please wait a moment and try again.",
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    let body: ApiErrorBody = {};

    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // Non-JSON errors will use the default message below.
    }

    throw new ApiError(
      response.status,
      body.error?.message || "The request could not be completed.",
      body.error?.details,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function apiUrl(path: string) {
  if (!path) return "";

  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) {
    return path;
  }

  if (path.startsWith("/uploads/")) {
    return `${getApiOrigin()}${path}`;
  }

  return `${API_URL}${path}`;
}
