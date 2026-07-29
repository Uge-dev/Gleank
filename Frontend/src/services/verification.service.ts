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
  canRequestResubmission?: boolean;
  resubmissionRequest?: {
    id: string;
    reason: string;
    status: string;
    adminFeedback?: string;
  } | null;
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
  stageReadiness?: Array<{
    stage: number;
    title: string;
    started: boolean;
    approved: boolean;
    submissionComplete: boolean;
    previousStageApproved: boolean;
    approvalReady: boolean;
    missingRequirementCodes: string[];
  }>;
};

export type VerificationCenterResponse = {
  case: VerificationCase;
};

export function getMyVerificationCenter(role: "seller" | "rider", history = false) {
  return apiRequest<VerificationCenterResponse>(
    `/verification/me?role=${role}${history ? "&history=true" : ""}`,
  );
}

export function requestVerificationRequirementResubmission(
  requirementId: string,
  reason: string,
) {
  return apiRequest<VerificationCenterResponse>(
    `/verification/requirements/${encodeURIComponent(requirementId)}/resubmission-request`,
    {
      method: "POST",
      body: JSON.stringify({ reason, role: "seller" }),
    },
  );
}
