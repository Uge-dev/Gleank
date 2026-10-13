function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

const configuredApiUrl =
  process.env.EXPO_PUBLIC_API_URL?.trim();

if (!configuredApiUrl && !__DEV__) {
  throw new Error(
    'EXPO_PUBLIC_API_URL must be configured for release builds.',
  );
}

// Accept the backend root, or an older value ending in /api or /api/v2.
const apiOrigin = normalizeUrl(
  configuredApiUrl || 'http://localhost:4000',
).replace(/\/api(?:\/v2)?$/i, '');

export const AppConfig = {
  name: 'Gleenc',

  // Existing backend services.
  apiBaseUrl: `${apiOrigin}/api`,

  // Shared mobile/web integration.
  sharedApiBaseUrl: `${apiOrigin}/api/v2`,

  apiTimeoutMs: 45_000,

  supportEmail: 'support@gleenc.com',

  currency: 'NGN',

  locale: 'en-NG',

  platformFeePercent: 5,

  pagination: {
    defaultPageSize: 20,
    maximumPageSize: 100,
  },
} as const;