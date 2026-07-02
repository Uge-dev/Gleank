const API_URL = import.meta.env.VITE_GLEANK_WAITLIST_API_URL || "http://localhost:5000/api";
const TOKEN_KEY = "gleank_waitlist_admin_token";

export function getGleankWaitlistToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setGleankWaitlistToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearGleankWaitlistToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function parseJson(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || "Request failed.");
  return data;
}

export async function loginGleankWaitlistAdmin(email, password) {
  const response = await fetch(`${API_URL}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return parseJson(response);
}

export async function fetchGleankWaitlistEntries(filters = {}) {
  const token = getGleankWaitlistToken();
  const params = new URLSearchParams({ limit: String(filters.limit || 100) });

  if (filters.search) params.set("search", filters.search);
  if (filters.userType) params.set("userType", filters.userType);
  if (filters.status) params.set("status", filters.status);

  const response = await fetch(`${API_URL}/admin/waitlist?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(response);
}

export async function fetchGleankWaitlistStats() {
  const token = getGleankWaitlistToken();
  const response = await fetch(`${API_URL}/admin/waitlist/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJson(response);
}
