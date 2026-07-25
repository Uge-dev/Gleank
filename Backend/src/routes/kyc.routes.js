import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { fileUrl, upload } from "../middleware/upload.js";
import {
  getKycStatusForUser,
  getOwnKycStatus,
  startKyc,
  submitManualKyc,
} from "../services/kyc.service.js";

export const kycRouter = Router();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function attachManualKycUploads(req, _res, next) {
  const files = req.files || {};
  const documentUrls = [
    files.identityDocument?.[0],
    files.businessDocument?.[0],
    files.vehicleDocument?.[0],
    ...(files.documents || []),
  ]
    .map((file) => fileUrl(req, file))
    .filter(Boolean);
  const selfieFile =
    files.selfie?.[0] ||
    files.faceImage?.[0] ||
    files.profilePhoto?.[0];

  req.body.documentUrls = documentUrls;
  req.body.identityDocumentUrl = documentUrls[0] || req.body.identityDocumentUrl;
  req.body.selfieUrl = selfieFile ? fileUrl(req, selfieFile) : req.body.selfieUrl;
  next();
}

kycRouter.use(requireAuth);

kycRouter.post("/start", (req, res) => {
  res.json(startKyc(req.auth, req.body || {}));
});

kycRouter.get("/status", (req, res) => {
  res.json(getOwnKycStatus(req.auth));
});

kycRouter.get("/status/:userId", (req, res) => {
  res.json(getKycStatusForUser(req.auth, req.params.userId));
});

kycRouter.post(
  "/manual/submit",
  upload.fields([
    { name: "identityDocument", maxCount: 1 },
    { name: "businessDocument", maxCount: 1 },
    { name: "vehicleDocument", maxCount: 1 },
    { name: "documents", maxCount: 6 },
    { name: "selfie", maxCount: 1 },
    { name: "faceImage", maxCount: 1 },
    { name: "profilePhoto", maxCount: 1 },
  ]),
  attachManualKycUploads,
  asyncRoute(async (req, res) => {
    res.status(201).json(submitManualKyc(req.auth, req.body || {}));
  }),
);
