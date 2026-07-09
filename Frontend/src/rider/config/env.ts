export const config = {
  apiBaseUrl: (import.meta.env.VITE_GLEANK_API_URL || import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, ''),
  riderApiMode: (import.meta.env.VITE_RIDER_API_MODE || 'mock') as 'mock' | 'api' | 'hybrid',
  apiTimeoutMs: Number(import.meta.env.VITE_API_TIMEOUT_MS || 12000)
};

export function shouldUseApi() {
  return Boolean(config.apiBaseUrl) && config.riderApiMode !== 'mock';
}
