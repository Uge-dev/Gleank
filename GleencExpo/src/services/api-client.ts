import { Platform } from 'react-native';
import { readSession } from './api';
import { AppConfig } from '@/constants/config';

type ApiErrorResponse = {
  error?: {
    message?: string;
    details?: unknown;
  };
  message?: string;
};

type ApiRequestOptions = RequestInit & {
  timeoutMs?: number;
};

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(
    status: number,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//') || path.split('/').includes('..')) {
    throw new ApiError(400, 'Invalid API path.');
  }
  const {
    timeoutMs = AppConfig.apiTimeoutMs,
    ...requestOptions
  } = options;

  const controller = new AbortController();

  const abort = () => controller.abort();
  requestOptions.signal?.addEventListener('abort', abort, { once: true });
  if (requestOptions.signal?.aborted) abort();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const headers = new Headers(requestOptions.headers);

  const isFormData =
    typeof FormData !== 'undefined' &&
    requestOptions.body instanceof FormData;

  if (
    requestOptions.body &&
    !isFormData &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (!headers.has('X-Gleenc-Portal')) {
    headers.set('X-Gleenc-Portal', 'user');
  }

  const normalizedPath = path.startsWith('/')
    ? path
    : `/${path}`;

  try {
    const session = await readSession();
    if (session && !['/auth/verify-email','/auth/forgot-password','/auth/reset-password'].includes(path)) headers.set('Authorization', `Bearer ${session.accessToken}`);
    const response = await fetch(
      `${AppConfig.apiBaseUrl}${normalizedPath}`,
      {
        ...requestOptions,
        headers,
        credentials: Platform.OS === 'web' ? 'include' : 'omit',
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      let errorBody: ApiErrorResponse = {};

      try {
        errorBody =
          (await response.json()) as ApiErrorResponse;
      } catch {
        errorBody = {};
      }

      throw new ApiError(
        response.status,
        errorBody.error?.message ||
          errorBody.message ||
          'The request could not be completed.',
        errorBody.error?.details,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === 'AbortError'
    ) {
      throw new ApiError(
        408,
        'The server is taking too long to respond.',
      );
    }

    throw new ApiError(
      0,
      'Unable to connect. Check your internet connection and try again.',
    );
  } finally {
    clearTimeout(timeout);
    requestOptions.signal?.removeEventListener('abort', abort);
  }
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

export function apiAssetUrl(path?: string | null) {
  if (!path) {
    return '';
  }

  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:')
  ) {
    return path;
  }

  const apiOrigin =
    AppConfig.apiBaseUrl.replace(/\/api$/, '');

  return `${apiOrigin}${
    path.startsWith('/') ? path : `/${path}`
  }`;
}