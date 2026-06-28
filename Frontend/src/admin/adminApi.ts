import { buildAdminOverview, initialAdminDataset, type AdminDataset, type AdminStatus } from "./adminData";

const API_BASE = (import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "/api");
const ADMIN_TOKEN_KEY = "gleank_admin_token";
const ADMIN_DATA_KEY = "gleank_admin_demo_data";

type AdminCollection = keyof Omit<AdminDataset, "overview">;

export type AdminLoginPayload = {
  email: string;
  password: string;
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

function loadLocalDataset(): AdminDataset {
  const saved = localStorage.getItem(ADMIN_DATA_KEY);
  if (!saved) return initialAdminDataset;

  try {
    const parsed = JSON.parse(saved) as AdminDataset;
    const rest = { ...parsed };
    delete (rest as Partial<AdminDataset>).overview;
    return { ...parsed, overview: buildAdminOverview(rest as Omit<AdminDataset, "overview">) };
  } catch {
    return initialAdminDataset;
  }
}

function saveLocalDataset(dataset: AdminDataset) {
  const rest = { ...dataset };
  delete (rest as Partial<AdminDataset>).overview;
  const next = { ...dataset, overview: buildAdminOverview(rest as Omit<AdminDataset, "overview">) };
  localStorage.setItem(ADMIN_DATA_KEY, JSON.stringify(next));
  return next;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAdminToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || "Request failed");
  }

  return response.json() as Promise<T>;
}

export async function adminLogin(payload: AdminLoginPayload) {
  try {
    const result = await request<{ token: string; admin: { name: string; email: string; role: "admin" } }>("/admin/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setAdminToken(result.token);
    return result;
  } catch {
    const email = payload.email.toLowerCase().trim();
    const password = payload.password.trim();

    if (email === "admin@gleank.com" && password === "admin12345") {
      const fallback = {
        token: "local-admin-demo-token",
        admin: { name: "Gleank Admin", email: "admin@gleank.com", role: "admin" as const },
      };
      setAdminToken(fallback.token);
      return fallback;
    }

    throw new Error("Invalid admin login details");
  }
}

export async function fetchAdminDataset(): Promise<AdminDataset> {
  try {
    return await request<AdminDataset>("/admin/overview");
  } catch {
    return loadLocalDataset();
  }
}

export async function updateAdminRecordStatus(collection: AdminCollection, id: string, status: AdminStatus, field = "status") {
  try {
    return await request<{ success: boolean; data: AdminDataset }>(`/admin/${collection}/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, field }),
    });
  } catch {
    const current = loadLocalDataset();
    const rows = current[collection] as Array<Record<string, unknown>>;
    const nextRows = rows.map((row) => {
      if (row.id !== id) return row;

      const patch: Record<string, unknown> = { [field]: status };

      if (collection === "orders" && field === "orderStatus" && status === "completed") {
        patch.deliveryStatus = "verified";
      }

      if (collection === "deliveries") {
        patch.codeVerified = status === "verified";
      }

      return { ...row, ...patch };
    });

    const activityLogs = [
      {
        id: `log-${Date.now()}`,
        admin: "Gleank Admin",
        action: `Changed ${collection} status to ${status}`,
        target: id,
        time: new Date().toLocaleString(),
      },
      ...current.activityLogs,
    ];

    const next = saveLocalDataset({ ...current, [collection]: nextRows, activityLogs } as AdminDataset);
    return { success: true, data: next };
  }
}


export async function updateAdminRecordFields(collection: AdminCollection, id: string, fields: Record<string, unknown>) {
  try {
    return await request<{ success: boolean; data: AdminDataset }>(`/admin/${collection}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  } catch {
    const current = loadLocalDataset();
    const rows = current[collection] as Array<Record<string, unknown>>;
    const nextRows = rows.map((row) => (row.id === id ? { ...row, ...fields } : row));

    const activityLogs = [
      {
        id: `log-${Date.now()}`,
        admin: "Gleank Admin",
        action: `Updated ${collection} record`,
        target: id,
        time: new Date().toLocaleString(),
      },
      ...current.activityLogs,
    ];

    const next = saveLocalDataset({ ...current, [collection]: nextRows, activityLogs } as AdminDataset);
    return { success: true, data: next };
  }
}

export async function deleteAdminRecord(collection: AdminCollection, id: string) {
  try {
    return await request<{ success: boolean; data: AdminDataset }>(`/admin/${collection}/${id}`, {
      method: "DELETE",
    });
  } catch {
    const current = loadLocalDataset();
    const rows = current[collection] as Array<Record<string, unknown>>;
    const nextRows = rows.filter((row) => row.id !== id);

    const activityLogs = [
      {
        id: `log-${Date.now()}`,
        admin: "Gleank Admin",
        action: `Deleted ${collection} record`,
        target: id,
        time: new Date().toLocaleString(),
      },
      ...current.activityLogs,
    ];

    const next = saveLocalDataset({ ...current, [collection]: nextRows, activityLogs } as AdminDataset);
    return { success: true, data: next };
  }
}

export function resetAdminDemoData() {
  localStorage.removeItem(ADMIN_DATA_KEY);
  return initialAdminDataset;
}