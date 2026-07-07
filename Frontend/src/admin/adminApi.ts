import type { AdminDataset, AdminStatus } from "./adminData";

const API_BASE = (import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "/api");
const ADMIN_TOKEN_KEY = "gleank_admin_token";

type AdminCollection = keyof Omit<AdminDataset, "overview">;

export type AdminLoginPayload = {
  email: string;
  password: string;
};

export type AdminProfile = {
  name: string;
  email: string;
  role: "admin";
  avatarUrl: string | null;
};

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const isFormData = options.body instanceof FormData;
  const headers = new Headers(options.headers);

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearAdminToken();
    }

    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || "Request failed");
  }

  return response.json() as Promise<T>;
}

export async function adminLogin(payload: AdminLoginPayload) {
  const result = await request<{ token: string; admin: AdminProfile }>("/admin/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setAdminToken(result.token);
  return result;
}

export async function fetchAdminProfile() {
  return request<{ admin: AdminProfile }>("/admin/profile");
}

export async function uploadAdminAvatar(file: File) {
  const formData = new FormData();
  formData.append("avatar", file);

  return request<{ admin: AdminProfile }>("/admin/profile/avatar", {
    method: "POST",
    body: formData,
  });
}

export async function fetchAdminDataset(): Promise<AdminDataset> {
  return request<AdminDataset>("/admin/overview");
}

export async function updateAdminRecordStatus(collection: AdminCollection, id: string, status: AdminStatus, field = "status") {
  return request<{ success: boolean; data: AdminDataset }>(`/admin/${collection}/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, field }),
  });
}


export async function updateAdminRecordFields(collection: AdminCollection, id: string, fields: Record<string, unknown>) {
  return request<{ success: boolean; data: AdminDataset }>(`/admin/${collection}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export async function deleteAdminRecord(collection: AdminCollection, id: string) {
  return request<{ success: boolean; data: AdminDataset }>(`/admin/${collection}/${id}`, {
    method: "DELETE",
  });
}

export async function sendAdminSupportMessage(conversationId: string, body: string) {
  return request<{ success: boolean; data: AdminDataset }>(
    `/admin/support/${conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    },
  );
}

export async function markAdminSupportConversationRead(conversationId: string) {
  return request<{ success: boolean; data: AdminDataset }>(
    `/admin/support/${conversationId}/read`,
    {
      method: "PATCH",
    },
  );
}
