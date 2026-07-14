function normalizeApiBaseUrl(value: string) {
  const base = value.replace(/\/+$/, '');
  return base.endsWith('/api') ? base.slice(0, -4) : base;
}

export const config = {
  apiBaseUrl: normalizeApiBaseUrl(
    import.meta.env.VITE_GLEANK_API_URL ||
      import.meta.env.VITE_API_BASE_URL ||
      import.meta.env.VITE_API_URL ||
      '',
  ),
  riderApiMode: (import.meta.env.VITE_RIDER_API_MODE || 'api') as 'mock' | 'api' | 'hybrid',
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS || 12000)
};

export function shouldUseApi() {
  return Boolean(config.apiBaseUrl) && config.riderApiMode !== 'mock';
}

export function shouldUseMock() {
  return config.riderApiMode === 'mock';
}
