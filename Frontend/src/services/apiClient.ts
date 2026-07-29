import { config } from '../config/env';
import { cleanErrorMessage } from '../../lib/errorMessages';

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

export function buildApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${config.apiBaseUrl}${cleanPath}`;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? config.apiTimeoutMs);
  const headers = new Headers(options.headers || {});
  const isFormData = options.body instanceof FormData;

  if (!isFormData && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(buildApiUrl(path), {
      credentials: 'include',
      ...options,
      headers,
      signal: controller.signal
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      const backendMessage =
        typeof payload === 'object' && payload && 'message' in payload
          ? String((payload as { message?: unknown }).message)
          : typeof payload === 'object' && payload && 'error' in payload &&
              typeof (payload as { error?: unknown }).error === 'object' &&
              (payload as { error?: { message?: unknown } }).error?.message
            ? String((payload as { error?: { message?: unknown } }).error?.message)
          : '';
      const message = cleanErrorMessage(backendMessage, response.status, 'The request could not be completed.');
      throw new ApiClientError(message, response.status, payload);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiClientError('The rider service is taking too long to respond. Please try again in a moment.', 408);
    }
    throw new ApiClientError('We could not connect right now. Please check your internet connection and try again.', 0);
  } finally {
    window.clearTimeout(timeout);
  }
}
