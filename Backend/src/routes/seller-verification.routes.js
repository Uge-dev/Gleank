import { Router } from "express";
import { fileUrl, upload } from "../middleware/upload.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getSellerReadiness,
  getSellerVerification,
  submitSellerVerificationStage,
  updateSellerOnboardingDraft,
  upsertSellerVerification,
} from "../services/seller-verification.service.js";
import { ensureSellerSubscription, getSellerSubscription } from "../services/subscription.service.js";

export const sellerVerificationRouter = Router();

sellerVerificationRouter.use(requireAuth, requireRole("seller"));

sellerVerificationRouter.get("/me", (req, res) => {
  ensureSellerSubscription(req.auth.user_id);

  res.json({
    verification: getSellerVerification(req.auth.user_id),
    readiness: getSellerReadiness(req.auth.user_id),
    subscription: getSellerSubscription(req.auth.user_id),
  });
});

sellerVerificationRouter.patch("/me/draft", upload.single("identityProof"), (req, res) => {
  const identityProofUrl = req.file ? fileUrl(req, req.file) : null;
  const verification = updateSellerOnboardingDraft(
    req.auth.user_id,
    req.body,
    identityProofUrl,
  );
  ensureSellerSubscription(req.auth.user_id);

  res.json({
    verification,
    readiness: getSellerReadiness(req.auth.user_id),
    subscription: getSellerSubscription(req.auth.user_id),
  });
});

sellerVerificationRouter.post(
  "/me/stages/:stage/submit",
  upload.single("identityProof"),
  (req, res) => {
    const identityProofUrl = req.file ? fileUrl(req, req.file) : null;
    const verification = submitSellerVerificationStage(
      req.auth.user_id,
      Number(req.params.stage),
      req.body,
      identityProofUrl,
    );
    ensureSellerSubscription(req.auth.user_id);

    res.json({
      verification,
      readiness: getSellerReadiness(req.auth.user_id),
      subscription: getSellerSubscription(req.auth.user_id),
    });
  },
);

sellerVerificationRouter.post(
  "/me/submit",
  upload.single("identityProof"),
  (req, res) => {
    const identityProofUrl = req.file ? fileUrl(req, req.file) : null;
    const verification = upsertSellerVerification(
      req.auth.user_id,
      req.body,
      identityProofUrl,
    );
    ensureSellerSubscription(req.auth.user_id);

    res.json({
      verification,
      readiness: getSellerReadiness(req.auth.user_id),
      subscription: getSellerSubscription(req.auth.user_id),
    });
  },
);

sellerVerificationRouter.put(
  "/me",
  upload.single("identityProof"),
  (req, res) => {
    const identityProofUrl = req.file ? fileUrl(req, req.file) : null;
    const verification = upsertSellerVerification(
      req.auth.user_id,
      req.body,
      identityProofUrl,
    );
    ensureSellerSubscription(req.auth.user_id);

    res.json({
      verification,
      readiness: getSellerReadiness(req.auth.user_id),
      subscription: getSellerSubscription(req.auth.user_id),
    });
  },
);
