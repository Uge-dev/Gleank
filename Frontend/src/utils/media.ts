import { apiUrl } from "../lib/api";

export function resolveMediaUrl(
  path: string | null | undefined,
  fallback: string,
) {
  if (!path) return fallback;
  if (/^https?:\/\//i.test(path) || path.startsWith("data:")) return path;
  return apiUrl(path);
}