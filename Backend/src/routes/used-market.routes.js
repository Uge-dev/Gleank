import { Router } from "express";
import { fileUrl, upload } from "../middleware/upload.js";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import { HttpError } from "../lib/http-error.js";
import {
  createUsedListing,
  getUsedListing,
  listOwnUsedListings,
  listUsedListings,
  reportUsedListing,
  updateOwnUsedListingStatus,
} from "../services/used-market.service.js";
import {
  getTrustProfile,
  getTrustStatus,
  upsertPayoutAccount,
  upsertTrustProfile,
} from "../services/trust.service.js";
import {
  addUsedListingComment,
  deleteUsedListingComment,
  likeUsedListing,
  likeUsedListingComment,
  recordUsedListingShare,
  recordUsedListingView,
  unlikeUsedListing,
  unlikeUsedListingComment,
} from "../services/used-listing-interaction.service.js";

export const usedMarketRouter = Router();

usedMarketRouter.get("/", (req, res) => {
  res.json({
    listings: listUsedListings({
      query: String(req.query.q || ""),
      category: String(req.query.category || ""),
      viewerId: req.auth?.user_id || "",
    }),
  });
});

usedMarketRouter.get("/mine", requireAuth, requireEmailVerified, (req, res) => {
  res.json({ listings: listOwnUsedListings(req.auth.user_id) });
});

usedMarketRouter.get("/trust", requireAuth, requireEmailVerified, (req, res) => {
  res.json(getTrustStatus(req.auth.user_id));
});

usedMarketRouter.post(
  "/",
  requireAuth,
  requireEmailVerified,
  upload.fields([
    { name: "images", maxCount: 10 },
    { name: "ownershipProof", maxCount: 1 },
    { name: "receipt", maxCount: 1 },
    { name: "identityProof", maxCount: 1 },
  ]),
  (req, res) => {
    const imageFiles = req.files?.images || [];
    const proofFile = req.files?.ownershipProof?.[0];
    const receiptFile = req.files?.receipt?.[0];
    const identityProofFile = req.files?.identityProof?.[0];
    const trustProfile = getTrustProfile(req.auth.user_id);

    if (!identityProofFile && !trustProfile?.identityProofUrl) {
      throw new HttpError(422, "Upload a used-market seller identity proof image before submitting a listing.");
    }

    if (identityProofFile || req.body.fullName || req.body.faceVerified) {
      upsertTrustProfile(
        req.auth.user_id,
        req.body,
        identityProofFile ? fileUrl(req, identityProofFile) : null,
      );
    }

    if (req.body.bankName || req.body.accountName || req.body.accountNumber) {
      upsertPayoutAccount(req.auth.user_id, req.body);
    }

    const listing = createUsedListing(req.auth.user_id, req.body, {
      images: imageFiles.map((file) => ({ url: fileUrl(req, file) })),
      ownershipProof: proofFile ? { url: fileUrl(req, proofFile) } : null,
      receipt: receiptFile ? { url: fileUrl(req, receiptFile) } : null,
    });

    res.status(201).json({ listing });
  },
);

usedMarketRouter.patch("/:id/status", requireAuth, requireEmailVerified, (req, res) => {
  res.json({
    listing: updateOwnUsedListingStatus(
      req.auth.user_id,
      req.params.id,
      String(req.body.status || ""),
    ),
  });
});

usedMarketRouter.post("/:id/report", requireAuth, requireEmailVerified, (req, res) => {
  res.status(201).json(reportUsedListing(req.auth.user_id, req.params.id, req.body));
});

usedMarketRouter.post("/:id/like", requireAuth, (req, res) => {
  res.json({
    interaction: likeUsedListing(req.auth.user_id, req.params.id),
  });
});

usedMarketRouter.delete("/:id/like", requireAuth, (req, res) => {
  res.json({
    interaction: unlikeUsedListing(req.auth.user_id, req.params.id),
  });
});

usedMarketRouter.post("/:id/share", requireAuth, (req, res) => {
  res.json({
    interaction: recordUsedListingShare(req.auth.user_id, req.params.id),
  });
});

usedMarketRouter.post("/:id/view", requireAuth, (req, res) => {
  res.json({
    interaction: recordUsedListingView(req.auth.user_id, req.params.id),
  });
});

usedMarketRouter.post("/:id/comments", requireAuth, (req, res) => {
  res.status(201).json({
    comment: addUsedListingComment(
      req.auth.user_id,
      req.params.id,
      req.body,
    ),
  });
});

usedMarketRouter.post("/:id/comments/:commentId/like", requireAuth, (req, res) => {
  res.json({
    comment: likeUsedListingComment(
      req.auth.user_id,
      req.params.id,
      req.params.commentId,
    ),
  });
});

usedMarketRouter.delete("/:id/comments/:commentId/like", requireAuth, (req, res) => {
  res.json({
    comment: unlikeUsedListingComment(
      req.auth.user_id,
      req.params.id,
      req.params.commentId,
    ),
  });
});

usedMarketRouter.delete("/:id/comments/:commentId", requireAuth, (req, res) => {
  res.json({
    comment: deleteUsedListingComment(
      req.auth,
      req.params.id,
      req.params.commentId,
    ),
  });
});

usedMarketRouter.get("/:id", (req, res) => {
  res.json({
    listing: getUsedListing(req.params.id, req.auth),
  });
});
