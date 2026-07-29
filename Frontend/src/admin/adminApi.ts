import type { AdminDataset, AdminRider, AdminStatus } from "./adminData";
import { cleanErrorMessage } from "../lib/errorMessages";

function resolveAdminApiBase() {
  const configuredUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "") || "/api";

  if (typeof window === "undefined" || !/^https?:\/\//i.test(configuredUrl)) {
    return configuredUrl;
  }

  try {
    const configured = new URL(configuredUrl);
    const isVercelApp = window.location.hostname.endsWith(".vercel.app");
    const isRenderBackend = configured.hostname.endsWith(".onrender.com");

    if (isVercelApp && isRenderBackend && configured.origin !== window.location.origin) {
      return "/api";
    }
  } catch {
    // Keep the configured value; the UI will show a safe connection message if it fails.
  }

  return configuredUrl;
}

const API_BASE = resolveAdminApiBase();
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
  const isFormData = options.body instanceof FormData;
  const headers = new Headers(options.headers);

  if (!isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      credentials: "include",
    });
  } catch {
    throw new Error("We could not connect to admin services. Please check your connection and try again.");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      clearAdminToken();
    }

    const error = await response.json().catch(() => ({ message: "" }));
    throw new Error(cleanErrorMessage(error.message, response.status, "Admin request could not be completed."));
  }

  return response.json() as Promise<T>;
}

export async function adminLogin(payload: AdminLoginPayload) {
  const result = await request<{ token: string; admin: AdminProfile }>("/admin/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  setAdminToken("session");
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

export type AdminDispatchBatch = {
  id: string;
  parentOrderId?: string | null;
  batchType?: string;
  sourceZoneId?: string | null;
  destinationZoneId?: string | null;
  status?: string;
  dispatchStatus?: string;
  pickupCount?: number;
  packageSizeSummary?: string;
  weightClassSummary?: string;
  fragilitySummary?: string;
  requiredVehicleType?: string;
  riskLevel?: string;
  requiresGps?: boolean;
  deliveryFee?: number;
  packageValue?: number;
  pickupTasks?: Array<Record<string, unknown>>;
  attempts?: Array<Record<string, unknown>>;
};

export type AdminInterventionItem = {
  id: string;
  type?: string;
  priority?: string;
  reason?: string;
  status?: string;
  relatedBatchId?: string | null;
  relatedOrderId?: string | null;
  createdAt?: string;
};

export type AdminDeliveryZone = {
  id: string;
  name: string;
  parentAreaId?: string | null;
  zoneType?: string;
  marketId?: string | null;
  campusId?: string | null;
  baseDeliveryFee?: number;
  extraPickupFee?: number;
  availabilityStatus?: string;
  availabilityNote?: string;
  isActive?: boolean;
};

export type AdminPackageRule = {
  id: string;
  categoryKey: string;
  categoryName: string;
  packageSize: string;
  packageWeightClass: string;
  fragilityLevel: string;
  requiredVehicleType: string;
  batchingEligibility: string;
  riskLevel: string;
  adminReviewRequired?: boolean;
  isActive?: boolean;
};

export type AdminDispatchOperations = {
  dispatches: AdminDispatchBatch[];
  stats: {
    pending: number;
    offered: number;
    accepted: number;
    noRider: number;
    highRisk: number;
  };
};

export async function fetchAdminDispatchOperations() {
  return request<AdminDispatchOperations>("/admin/live-dispatch");
}

export async function fetchAdminInterventionQueue() {
  return request<{ queue: AdminInterventionItem[] }>("/admin/intervention-queue");
}

export async function fetchDeliveryZones() {
  return request<{ zones: AdminDeliveryZone[] }>("/zones");
}

export async function fetchPackageRules() {
  return request<{ rules: AdminPackageRule[] }>("/package-rules");
}

function normalizeRider(row: {
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    emailVerified?: boolean;
    emailVerifiedAt?: string | null;
    phoneVerified?: boolean;
    phoneVerifiedAt?: string | null;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
  };
  riderProfile: Record<string, unknown> | null;
}): AdminRider {
  const profile = row.riderProfile || {};

  return {
    id: row.user.id,
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    phone: row.user.phone,
    emailVerified: Boolean(row.user.emailVerified),
    emailVerifiedAt: row.user.emailVerifiedAt || null,
    phoneVerified: Boolean(row.user.phoneVerified),
    phoneVerifiedAt: row.user.phoneVerifiedAt || null,
    isActive: Boolean(row.user.isActive),
    fullName: String(profile.fullName || row.user.name || ""),
    whatsappPhone: String(profile.whatsappPhone || row.user.phone || ""),
    vehicleType: String(profile.vehicleType || ""),
    vehiclePlate: String(profile.vehiclePlate || ""),
    coverageArea: String(profile.coverageArea || ""),
    homeAddress: String(profile.homeAddress || ""),
    emergencyContactName: String(profile.emergencyContactName || ""),
    emergencyContactPhone: String(profile.emergencyContactPhone || ""),
    guarantorName: String(profile.guarantorName || ""),
    guarantorPhone: String(profile.guarantorPhone || ""),
    verificationStatus: String(profile.verificationStatus || "pending_review"),
    verificationNote: String(profile.verificationNote || ""),
    verificationLevel: Number(profile.verificationLevel || 1),
    maxPackageValue: Number(profile.maxPackageValue || 0),
    availability: profile.availability === "online" ? "online" : "offline",
    safetyStatus: String(profile.safetyStatus || "normal"),
    ratingAverage: Number(profile.ratingAverage || 0),
    completedDeliveries: Number(profile.completedDeliveries || 0),
    profileCompletionPercent: Number(profile.profileCompletionPercent || 0),
    completionMissingFields: Array.isArray(profile.completionMissingFields) ? profile.completionMissingFields.map(String) : [],
    verificationStages: profile.verificationStages && typeof profile.verificationStages === "object" ? profile.verificationStages as Record<string, boolean> : {},
    capacityLocked: Boolean(profile.capacityLocked),
    capacityChangeUnlockedUntil: profile.capacityChangeUnlockedUntil ? String(profile.capacityChangeUnlockedUntil) : null,
    identityDocumentUrl: profile.identityDocumentUrl ? String(profile.identityDocumentUrl) : null,
    selfieUrl: profile.selfieUrl ? String(profile.selfieUrl) : null,
    createdAt: String(profile.createdAt || row.user.createdAt || ""),
    updatedAt: String(profile.updatedAt || row.user.updatedAt || ""),
  };
}

export async function fetchAdminRiders(): Promise<AdminRider[]> {
  const response = await request<{
    success: boolean;
    riders: Array<{
      user: {
        id: string;
        name: string;
        email: string;
        phone: string;
        emailVerified?: boolean;
        emailVerifiedAt?: string | null;
        phoneVerified?: boolean;
        phoneVerifiedAt?: string | null;
        isActive: boolean;
        createdAt?: string;
        updatedAt?: string;
      };
      riderProfile: Record<string, unknown> | null;
    }>;
  }>("/admin/riders");

  return response.riders.map(normalizeRider);
}

export async function updateAdminRiderVerification(
  riderId: string,
  fields: {
    verificationStatus: "draft" | "pending_review" | "verified" | "rejected" | "suspended";
    verificationNote?: string;
    verificationLevel?: number;
    maxPackageValueKobo?: number;
    safetyStatus?: "normal" | "flagged" | "suspended";
  },
) {
  return request<{ success: boolean; riderProfile: Record<string, unknown> }>(
    `/admin/riders/${riderId}/verification`,
    {
      method: "PATCH",
      body: JSON.stringify(fields),
    },
  );
}

export async function unlockAdminRiderCapacity(
  riderId: string,
  fields: { minutes?: number; note?: string } = {},
) {
  return request<{ success: boolean; riderProfile: Record<string, unknown> }>(
    `/admin/riders/${riderId}/capacity-unlock`,
    {
      method: "PATCH",
      body: JSON.stringify(fields),
    },
  );
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

export type AdminKycVerification = {
  id: string;
  userId: string;
  role: "seller" | "rider";
  provider: "mock" | "manual" | "dojah";
  providerReferenceId: string;
  status: string;
  level: number;
  requiresAdminReview: boolean;
  adminReviewStatus: string;
  failureReason: string;
  documentUrls: string[];
  selfieUrl: string | null;
  submittedPayload: Record<string, unknown>;
  completionPercent: number;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    campus: string;
    role: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type AdminPriceRange = {
  id: string;
  marketScope: string;
  campus: string;
  sellerType: string;
  category: string;
  subcategory: string;
  condition: string;
  minPriceKobo: number;
  maxPriceKobo: number;
  minPrice: number;
  maxPrice: number;
  action: "allow" | "warn" | "review" | "block";
  note: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminAuditLog = {
  id: string;
  adminId: string | null;
  adminName: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  metadata: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
};

export type AdminVerificationRequirement = {
  id: string;
  code: string;
  title: string;
  status: string;
  requiredLevel: number;
  blocking: boolean;
  adminFeedback?: string;
  resubmissionRequest?: {
    id: string;
    reason: string;
    status: "pending" | "approved" | "rejected" | "completed" | "cancelled";
    adminFeedback?: string;
    reviewedAt?: string | null;
    createdAt: string;
  } | null;
  latestSubmission?: {
    id: string;
    version: number;
    documentUrls: string[];
    submittedAt: string;
    status: string;
  } | null;
};

export type AdminVerificationCase = {
  id: string;
  userId: string;
  role: "seller" | "rider";
  sellerType?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
  } | null;
  currentVerifiedLevel: number;
  requestedLevel: number;
  overallStatus: string;
  operationalStatus: string;
  completionPercent: number;
  stageReadiness: Array<{
    stage: 1 | 2 | 3;
    title: string;
    started: boolean;
    approved: boolean;
    submissionComplete: boolean;
    previousStageApproved: boolean;
    approvalReady: boolean;
    missingRequirementCodes: string[];
  }>;
  requirements: AdminVerificationRequirement[];
  eligibility?: {
    eligible: boolean;
    blockingReasons: Array<{ code: string; message: string }>;
    checks: Record<string, boolean>;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminVerificationQueues = {
  cases: AdminVerificationCase[];
  queues: Record<string, AdminVerificationCase[]>;
};

export async function fetchAdminKyc(filters: { role?: string; status?: string; reviewStatus?: string } = {}) {
  const params = new URLSearchParams();
  if (filters.role) params.set("role", filters.role);
  if (filters.status) params.set("status", filters.status);
  if (filters.reviewStatus) params.set("reviewStatus", filters.reviewStatus);
  const query = params.toString();

  return request<{ success: boolean; verifications: AdminKycVerification[] }>(
    `/admin/kyc${query ? `?${query}` : ""}`,
  );
}

export async function decideAdminKyc(
  id: string,
  action: "approve" | "reject" | "request-resubmission",
  input: { reason?: string; note?: string } = {},
) {
  return request<{ success: boolean; kyc: AdminKycVerification }>(
    `/admin/kyc/${encodeURIComponent(id)}/${action}`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function fetchAdminPriceRanges() {
  return request<{ success: boolean; priceRanges: AdminPriceRange[] }>("/admin/price-ranges");
}

export async function createAdminPriceRange(input: Partial<AdminPriceRange>) {
  return request<{ success: boolean; priceRange: AdminPriceRange }>("/admin/price-ranges", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAdminPriceRange(id: string, input: Partial<AdminPriceRange>) {
  return request<{ success: boolean; priceRange: AdminPriceRange }>(
    `/admin/price-ranges/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function deleteAdminPriceRange(id: string) {
  return request<{ success: boolean }>(`/admin/price-ranges/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function fetchAdminAuditLogs() {
  return request<{ success: boolean; logs: AdminAuditLog[] }>("/admin/audit-logs");
}

export async function fetchAdminVerificationQueues(role?: "seller" | "rider") {
  const query = role ? `?role=${role}` : "";
  return request<AdminVerificationQueues>(`/verification/admin/queues${query}`);
}

export async function reviewAdminVerificationRequirement(
  requirementId: string,
  input: { action: "mark_under_review" | "approve" | "needs_information" | "reject" | "expire"; feedback?: string },
) {
  return request<{ case: AdminVerificationCase }>(
    `/verification/admin/requirements/${encodeURIComponent(requirementId)}/review`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function reviewAdminVerificationResubmission(
  requestId: string,
  input: { action: "approve" | "reject"; feedback?: string },
) {
  return request<{ case: AdminVerificationCase }>(
    `/verification/admin/resubmission-requests/${encodeURIComponent(requestId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export async function approveAdminVerificationLevel(caseId: string, level: number, reason = "") {
  return request<{ case: AdminVerificationCase }>(
    `/verification/admin/cases/${encodeURIComponent(caseId)}/level`,
    {
      method: "PATCH",
      body: JSON.stringify({ level, reason }),
    },
  );
}

export async function updateAdminVerificationOperationalStatus(
  caseId: string,
  input: { status: "active" | "restricted" | "suspended" | "deactivated"; reason?: string },
) {
  return request<{ case: AdminVerificationCase }>(
    `/verification/admin/cases/${encodeURIComponent(caseId)}/operational-status`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}
