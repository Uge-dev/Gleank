function normalizeApiBaseUrl(value: string) {
  const raw = (value || '/api').trim();

  if (!raw || raw === '/api') return '';

  const base = raw.replace(/\/+$/, '');

  if (typeof window !== 'undefined' && /^https?:\/\//i.test(base)) {
    try {
      const configured = new URL(base);
      const isVercelApp = window.location.hostname.endsWith('.vercel.app');
      const isRenderBackend = configured.hostname.endsWith('.onrender.com');

      if (isVercelApp && isRenderBackend && configured.origin !== window.location.origin) {
        return '';
      }
    } catch {
      // Keep the raw value so the failed request exposes the env issue.
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
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS || 12000)
};

export function shouldUseApi() {
  return config.riderApiMode !== 'mock';
}

export function shouldUseMock() {
  return false;
}
