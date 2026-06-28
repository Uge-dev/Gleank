const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "/api";

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

  if (init.body && !isFormData && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

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