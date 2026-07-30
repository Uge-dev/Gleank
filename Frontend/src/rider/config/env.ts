function normalizeApiBaseUrl(value: string) {
  const raw = (value || '/api').trim();

  if (!raw || raw === '/api') return '';

  const base = raw.replace(/\/+$/, '');

  if (typeof window !== 'undefined' && /^https?:\/\//i.test(base)) {
    try {
      const configured = new URL(base);
      const isLocalFrontend =
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';

      // Production rider authentication must travel through the same-origin
      // /api proxy. Otherwise Safari and other browsers can withhold the
      // httpOnly session cookie from a cross-site Render request.
      if (!isLocalFrontend && configured.origin !== window.location.origin) {
        return '';
      }
    } catch {
      return '';
    }
  }

  return base.endsWith('/api') ? base.slice(0, -4) : base;
}

export const config = {
  apiBaseUrl: normalizeApiBaseUrl(
    import.meta.env.VITE_GLEANK_API_URL ||
      import.meta.env.VITE_API_BASE_URL ||
      import.meta.env.VITE_API_URL ||
      '/api',
  ),
  riderApiMode: (import.meta.env.VITE_RIDER_API_MODE || 'api') as 'mock' | 'api' | 'hybrid',
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS || 30000),
  mapStyleUrl:
    String(import.meta.env.VITE_MAP_STYLE_URL || '').trim() ||
    'https://tiles.openfreemap.org/styles/liberty',
};

export function shouldUseApi() {
  return config.riderApiMode !== 'mock';
}

export function shouldUseMock() {
  return false;
}
