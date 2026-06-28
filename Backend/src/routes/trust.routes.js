import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { fileUrl, upload } from "../middleware/upload.js";
import {
  getTrustStatus,
  upsertPayoutAccount,
  upsertTrustProfile,
} from "../services/trust.service.js";

export const trustRouter = Router();

trustRouter.use(requireAuth);

trustRouter.get("/me", (req, res) => {
  res.json(getTrustStatus(req.auth.user_id));
});

trustRouter.put(
  "/profile",
  upload.single("identityProof"),
  (req, res) => {
    const identityProofUrl = req.file ? fileUrl(req, req.file) : null;
    const trustProfile = upsertTrustProfile(
      req.auth.user_id,
      req.body,
      identityProofUrl,
    );

    res.json({ trustProfile, trust: getTrustStatus(req.auth.user_id) });
  },
);

trustRouter.put("/payout", (req, res) => {
  const payoutAccount = upsertPayoutAccount(req.auth.user_id, req.body);

  res.json({ payoutAccount, trust: getTrustStatus(req.auth.user_id) });
});
