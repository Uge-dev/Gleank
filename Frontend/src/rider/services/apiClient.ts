import { config } from '../config/env';

export class ApiClientError extends Error {
  status?: number;
  payload?: unknown;

  constructor(message: string, status?: number, payload?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.payload = payload;
  }
}

type RequestOptions = RequestInit & { timeoutMs?: number };

function buildUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${config.apiBaseUrl}${cleanPath}`;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!config.apiBaseUrl) {
    throw new ApiClientError('API base URL is not configured. Set VITE_GLEANK_API_URL to connect to the full Gleank backend.');
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? config.apiTimeoutMs);
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;

  if (!isFormData && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(buildUrl(path), {
      credentials: 'include',
      ...options,
      headers,
      signal: controller.signal
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const message = typeof payload === 'object' && payload && 'message' in payload ? String((payload as { message?: unknown }).message) : `Request failed with status ${response.status}`;
      throw new ApiClientError(message, response.status, payload);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiClientError('The API request timed out.');
    }
    throw new ApiClientError(error instanceof Error ? error.message : 'Unable to complete API request.');
  } finally {
    window.clearTimeout(timeout);
  }
}
