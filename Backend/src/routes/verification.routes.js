import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { fileUrl, upload } from "../middleware/upload.js";
import {
  adminListVerificationQueues,
  approveCaseLevel,
  backfillLegacyVerification,
  getVerificationCenter,
  requestVerificationLevel,
  reviewRequirement,
  setCaseOperationalStatus,
  submitRequirement,
} from "../services/verification.service.js";

export const verificationRouter = Router();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const verificationUpload = upload.fields([
  { name: "documents", maxCount: 8 },
  { name: "identityDocument", maxCount: 2 },
  { name: "businessDocument", maxCount: 4 },
  { name: "vehicleDocument", maxCount: 4 },
  { name: "identityProof", maxCount: 2 },
  { name: "selfie", maxCount: 1 },
  { name: "profilePhoto", maxCount: 1 },
  { name: "faceImage", maxCount: 1 },
]);

function parseJsonField(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function uploadedFiles(req) {
  const files = req.files || {};
  return Object.fromEntries(
    Object.entries(files).map(([field, rows]) => [
      field,
      (rows || []).map((file) => ({
        url: fileUrl(req, file),
        fileName: file.originalname || file.filename || "",
        mimeType: file.mimetype || "",
      })),
    ]),
  );
}

function documentUrlsFromBody(req) {
  const direct = req.body?.documentUrls || req.body?.documentUrl || "";
  if (Array.isArray(direct)) return direct;
  if (typeof direct === "string" && direct.trim().startsWith("[")) {
    return parseJsonField(direct, []);
  }
  return direct ? [direct] : [];
}

verificationRouter.use(requireAuth);

verificationRouter.get("/me", (req, res) => {
  res.json(getVerificationCenter(req.auth, {
    role: req.query?.role || req.auth.role,
    includeHistory: req.query?.history === "true",
  }));
});

verificationRouter.post(
  "/requirements/:code/submissions",
  verificationUpload,
  asyncRoute(async (req, res) => {
    const result = submitRequirement(req.auth, req.params.code, {
      payload: parseJsonField(req.body?.payload, req.body || {}),
      documentUrls: documentUrlsFromBody(req),
      files: uploadedFiles(req),
      provider: req.body?.provider,
      providerReference: req.body?.providerReference,
      providerStatus: req.body?.providerStatus,
    });
    res.status(201).json(result);
  }),
);

verificationRouter.post("/level-requests", (req, res) => {
  res.status(201).json(requestVerificationLevel(req.auth, req.body || {}));
});

verificationRouter.get("/admin/queues", requireRole("admin"), (req, res) => {
  res.json(adminListVerificationQueues(req.auth, req.query || {}));
});

verificationRouter.post("/admin/backfill/dry-run", requireRole("admin"), (req, res) => {
  res.json(backfillLegacyVerification({ dryRun: true }));
});

verificationRouter.post("/admin/backfill/apply", requireRole("admin"), (req, res) => {
  res.json(backfillLegacyVerification({ dryRun: false }));
});

verificationRouter.patch(
  "/admin/requirements/:requirementId/review",
  requireRole("admin"),
  (req, res) => {
    res.json(reviewRequirement(req.auth, req.params.requirementId, req.body || {}));
  },
);

verificationRouter.patch("/admin/cases/:caseId/level", requireRole("admin"), (req, res) => {
  res.json(approveCaseLevel(req.auth, req.params.caseId, req.body || {}));
});

verificationRouter.patch("/admin/cases/:caseId/operational-status", requireRole("admin"), (req, res) => {
  res.json(setCaseOperationalStatus(req.auth, req.params.caseId, req.body || {}));
});
