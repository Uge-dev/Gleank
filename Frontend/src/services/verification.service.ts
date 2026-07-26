import { apiRequest } from "../lib/api";

export type VerificationRequirement = {
  id: string;
  code: string;
  title: string;
  description: string;
  workflowType: "form" | "document" | "provider" | "system";
  status: string;
  requiredLevel: number;
  blocking: boolean;
  adminFeedback?: string;
  latestSubmission?: {
    id: string;
    version: number;
    submittedAt: string;
    status: string;
    documentUrls: string[];
  } | null;
};

export type VerificationCase = {
  id: string;
  role: "seller" | "rider";
  sellerType?: string;
  currentVerifiedLevel: number;
  requestedLevel: number;
  overallStatus: string;
  operationalStatus: string;
  completionPercent: number;
  requirements: VerificationRequirement[];
};

export type VerificationCenterResponse = {
  case: VerificationCase;
};

export function getMyVerificationCenter(role: "seller" | "rider", history = false) {
  return apiRequest<VerificationCenterResponse>(
    `/verification/me?role=${role}${history ? "&history=true" : ""}`,
  );
}
