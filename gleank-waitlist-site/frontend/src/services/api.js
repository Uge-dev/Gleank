const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const TOKEN_KEY = "gleank_waitlist_admin_token";

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || data || "Request failed.");
  }

  return data;
}

export async function joinWaitlist(payload) {
  const response = await fetch(`${API_URL}/waitlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function adminLogin(payload) {
  const response = await fetch(`${API_URL}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export async function fetchWaitlist({ search = "", userType = "", status = "", page = 1, limit = 100 } = {}) {
  const token = getAdminToken();
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });

  if (search) params.set("search", search);
  if (userType) params.set("userType", userType);
  if (status) params.set("status", status);

  const response = await fetch(`${API_URL}/admin/waitlist?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}

export async function fetchWaitlistStats() {
  const token = getAdminToken();
  const response = await fetch(`${API_URL}/admin/waitlist/stats`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return parseResponse(response);
}

export async function updateWaitlistEntry(id, payload) {
  const token = getAdminToken();
  const response = await fetch(`${API_URL}/admin/waitlist/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  return parseResponse(response);
}

export function getExportUrl() {
  return `${API_URL}/admin/waitlist/export`;
}

export async function downloadWaitlistCsv() {
  const token = getAdminToken();
  const response = await fetch(getExportUrl(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || "Unable to download CSV.");
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gleank-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
