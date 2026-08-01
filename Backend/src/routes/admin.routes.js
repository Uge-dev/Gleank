import { Router } from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { db } from "../db/database.js";
import {
  deleteRecord,
  getAdminDataset,
  markSupportConversationRead,
  resetAdminDataset,
  sendAdminSupportMessage,
  updateRecordFields,
  updateRecordStatus,
} from "../data/adminStore.js";
import { deleteUploadedFiles, fileUrl, upload } from "../middleware/upload.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import {
  createSession,
  adminSessionCookieName,
  deleteSession,
  deleteSessionsForUser,
  sessionCookieOptions,
} from "../lib/session.js";
import { safeErrorMessage, shouldLogTechnicalError } from "../lib/safe-error-message.js";
import {
  adminCreateMarket,
  adminListMarketRequests,
  adminListMarkets,
  adminListMarketSellers,
  adminListSellerCategoryApprovals,
  adminUpdateMarket,
  adminUpdateMarketRequestStatus,
  adminUpdateMarketCategories,
  adminUpdateMarketSellerStatus,
  adminUpdateMarketStatus,
  adminUpdateSellerMarketApproval,
  adminUpdateSellerCategoryApproval,
} from "../services/market.service.js";
import {
  adminUnlockRiderCapacityChange,
  adminListRiders,
  adminUpdateRiderVerification,
} from "../services/rider.service.js";
import {
  adminReviewProduct,
  listProductModeration,
} from "../services/moderation.service.js";
import {
  adminListPayouts,
  adminUpdatePayout,
} from "../services/payout.service.js";
import {
  adminDecideDispute,
  adminListDisputes,
} from "../services/return-dispute.service.js";
import {
  adminApproveKyc,
  adminGetKyc,
  adminListKyc,
  adminRejectKyc,
  adminRequestKycResubmission,
} from "../services/kyc.service.js";
import {
  adminCreatePriceRange,
  adminDeletePriceRange,
  adminListPriceRanges,
  adminUpdatePriceRange,
} from "../services/price-validation.service.js";
import { listAdminAuditLogs, logAdminAudit } from "../services/audit-log.service.js";

const router = Router();

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many admin login attempts. Please wait 15 minutes and try again.",
      error: {
        code: "ADMIN_RATE_LIMITED",
        message: "Too many admin login attempts. Please wait 15 minutes and try again.",
      },
    });
  },
});

function getConfiguredAdminEmail() {
  return process.env.ADMIN_EMAIL || "";
}

function serializeAdminProfile(row) {
  return {
    name: row?.name || "Gleenc Admin",
    email: row?.email || getConfiguredAdminEmail(),
    role: "admin",
    avatarUrl: row?.avatar_url || null,
  };
}

function findAdminByEmail(email) {
  return db
    .prepare("SELECT * FROM users WHERE role = 'admin' AND LOWER(email) = ? LIMIT 1")
    .get(String(email || "").toLowerCase().trim());
}

function getAdminProfile(userId) {
  const row = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'admin'").get(userId);
  if (!row) throw new Error("Admin profile was not found.");
  return row;
}

function sendAdminError(res, error, fallback = "Admin request could not be completed.") {
  const status = error?.status || error?.statusCode || 500;
  if (shouldLogTechnicalError(error, status)) {
    console.error(error);
  }
  const message = safeErrorMessage(error, { status, fallback });
  res.status(status).json({
    success: false,
    message,
    error: {
      code: status === 403 ? "ADMIN_FORBIDDEN" : "ADMIN_REQUEST_FAILED",
      message,
    },
  });
}

function sendAdminLoginError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    message,
    error: { code, message },
  });
}

function requestMeta(req) {
  return {
    ipAddress: req.ip || req.socket?.remoteAddress || "",
    userAgent: req.get("user-agent") || "",
  };
}

function adminAuthForRequest(req) {
  return {
    role: "admin",
    user_id: req.auth.user_id,
    id: req.auth.user_id,
  };
}

router.post("/login", adminLoginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return sendAdminLoginError(
      res,
      422,
      "ADMIN_LOGIN_REQUIRED",
      "Enter the admin email and password.",
    );
  }

  const adminProfile = findAdminByEmail(email);
  const passwordMatches = adminProfile
    ? await bcrypt.compare(String(password || ""), adminProfile.password_hash || "")
    : false;

  if (!adminProfile || !passwordMatches) {
    return sendAdminLoginError(
      res,
      401,
      "INVALID_ADMIN_LOGIN",
      "Invalid admin login details.",
    );
  }

  if (!adminProfile.is_active) {
    return sendAdminLoginError(
      res,
      403,
      "ADMIN_ACCOUNT_DISABLED",
      "This admin account is disabled.",
    );
  }

  deleteSessionsForUser(adminProfile.id);
  const session = createSession(adminProfile.id, requestMeta(req));
  res.cookie(adminSessionCookieName, session.token, sessionCookieOptions());
  logAdminAudit({
    adminId: adminProfile.id,
    action: "admin_login",
    targetType: "admin",
    targetId: adminProfile.id,
    summary: "Admin logged in.",
    metadata: { email: normalizedEmail },
    ...requestMeta(req),
  });

  res.json({
    success: true,
    token: "session",
    admin: serializeAdminProfile(adminProfile),
  });
});

router.post("/logout", (req, res) => {
  deleteSession(req.cookies?.[adminSessionCookieName]);
  res.clearCookie(adminSessionCookieName, sessionCookieOptions());
  res.status(204).end();
});

router.get("/overview", requireAdmin, (_req, res) => {
  res.json(getAdminDataset());
});

router.get("/profile", requireAdmin, (_req, res) => {
  res.json({ admin: serializeAdminProfile(getAdminProfile(_req.auth.user_id)) });
});

router.post("/profile/avatar", requireAdmin, upload.single("avatar"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Choose an admin profile image to upload." });
    }

    const existing = getAdminProfile(req.auth.user_id);
    const avatarUrl = fileUrl(req, req.file);
    const now = new Date().toISOString();

    db.prepare("UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?").run(
      avatarUrl,
      now,
      existing.id,
    );

    if (existing.avatar_url) {
      deleteUploadedFiles([existing.avatar_url]);
    }

    const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(existing.id);
    res.json({ admin: serializeAdminProfile(updated) });
  } catch (error) {
    sendAdminError(res, error, "Could not upload admin profile image.");
  }
});

router.post("/support/:conversationId/messages", requireAdmin, (req, res) => {
  try {
    const data = sendAdminSupportMessage(
      req.auth.user_id,
      req.params.conversationId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendAdminError(res, error, "Could not send support reply.");
  }
});

router.patch("/support/:conversationId/read", requireAdmin, (req, res) => {
  try {
    const data = markSupportConversationRead(req.params.conversationId);
    res.json({ success: true, data });
  } catch (error) {
    sendAdminError(res, error, "Could not mark support conversation as read.");
  }
});

router.get("/markets", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      markets: adminListMarkets({
        query: String(req.query.q || ""),
      }),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load markets.");
  }
});

router.get("/markets/requests", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      requests: adminListMarketRequests({
        query: String(req.query.q || ""),
        status: String(req.query.status || ""),
      }),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load market requests.");
  }
});

router.patch("/markets/requests/:requestId/approve", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      request: adminUpdateMarketRequestStatus(req.params.requestId, "approved", req.body || {}),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not approve market request.");
  }
});

router.patch("/markets/requests/:requestId/reject", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      request: adminUpdateMarketRequestStatus(req.params.requestId, "rejected", req.body || {}),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not reject market request.");
  }
});

router.patch("/markets/requests/:requestId/status", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      request: adminUpdateMarketRequestStatus(req.params.requestId, req.body?.status, req.body || {}),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update market request.");
  }
});

router.get("/seller-category-approvals", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      approvals: adminListSellerCategoryApprovals({
        query: String(req.query.q || ""),
        status: String(req.query.status || ""),
      }),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load seller category approvals.");
  }
});

router.post("/markets", requireAdmin, (req, res) => {
  try {
    res.status(201).json({
      success: true,
      market: adminCreateMarket(req.body || {}),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not create market.");
  }
});

router.patch("/markets/:marketId", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      market: adminUpdateMarket(req.params.marketId, req.body || {}),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update market.");
  }
});

router.patch("/markets/:marketId/status", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      market: adminUpdateMarketStatus(req.params.marketId, req.body?.status),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update market status.");
  }
});

router.get("/markets/:marketId/sellers", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      ...adminListMarketSellers(req.params.marketId, {
        viewerId: req.auth?.user_id || req.auth?.id || "",
      }),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load market sellers.");
  }
});

router.patch("/markets/:marketId/categories", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      market: adminUpdateMarketCategories(
        req.params.marketId,
        req.body?.categories || req.body?.allowedCategories || req.body?.allowed_categories || [],
      ),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update market categories.");
  }
});

router.patch("/markets/:marketId/sellers/:profileId/status", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      ...adminUpdateMarketSellerStatus(
        req.params.marketId,
        req.params.profileId,
        req.body?.status,
        req.body || {},
      ),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update market seller status.");
  }
});

router.patch("/sellers/:sellerId/market-approval", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      ...adminUpdateSellerMarketApproval(req.params.sellerId, req.body || {}),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update seller market approval.");
  }
});

router.patch("/sellers/:sellerId/category-approval", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      approval: adminUpdateSellerCategoryApproval(
        req.body?.approvalId || req.params.sellerId,
        req.body || {},
        req.auth?.user_id || req.auth?.id || null,
      ),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update seller category approval.");
  }
});

router.patch("/seller-category-approvals/:approvalId", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      approval: adminUpdateSellerCategoryApproval(
        req.params.approvalId,
        req.body || {},
        req.auth?.user_id || req.auth?.id || null,
      ),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update seller category approval.");
  }
});

router.get("/riders", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      riders: adminListRiders({ role: "admin" }, String(req.query.status || "")),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load riders.");
  }
});

router.patch("/riders/:riderId/verification", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      riderProfile: adminUpdateRiderVerification(
        { role: "admin" },
        req.params.riderId,
        req.body || {},
      ),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update rider verification.");
  }
});

router.patch("/riders/:riderId/capacity-unlock", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      riderProfile: adminUnlockRiderCapacityChange(
        { role: "admin" },
        req.params.riderId,
        req.body || {},
      ),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not unlock rider capacity changes.");
  }
});

router.get("/kyc", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      verifications: adminListKyc({
        role: String(req.query.role || ""),
        status: String(req.query.status || ""),
        reviewStatus: String(req.query.reviewStatus || req.query.review_status || ""),
      }),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load verification reviews.");
  }
});

router.get("/kyc/:id", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      verification: adminGetKyc(req.params.id),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load verification details.");
  }
});

router.post("/kyc/:id/approve", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      ...adminApproveKyc(adminAuthForRequest(req), req.params.id, req.body || {}, requestMeta(req)),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not approve verification.");
  }
});

router.post("/kyc/:id/reject", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      ...adminRejectKyc(adminAuthForRequest(req), req.params.id, req.body || {}, requestMeta(req)),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not reject verification.");
  }
});

router.post("/kyc/:id/request-resubmission", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      ...adminRequestKycResubmission(
        adminAuthForRequest(req),
        req.params.id,
        req.body || {},
        requestMeta(req),
      ),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not request verification update.");
  }
});

router.get("/price-ranges", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      priceRanges: adminListPriceRanges({
        category: String(req.query.category || ""),
        sellerType: String(req.query.sellerType || req.query.seller_type || ""),
      }),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load price ranges.");
  }
});

router.post("/price-ranges", requireAdmin, (req, res) => {
  try {
    res.status(201).json({
      success: true,
      priceRange: adminCreatePriceRange(adminAuthForRequest(req), req.body || {}, requestMeta(req)),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not create price range.");
  }
});

router.patch("/price-ranges/:rangeId", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      priceRange: adminUpdatePriceRange(
        adminAuthForRequest(req),
        req.params.rangeId,
        req.body || {},
        requestMeta(req),
      ),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update price range.");
  }
});

router.delete("/price-ranges/:rangeId", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      ...adminDeletePriceRange(adminAuthForRequest(req), req.params.rangeId, requestMeta(req)),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not delete price range.");
  }
});

router.get("/audit-logs", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      logs: listAdminAuditLogs({
        action: String(req.query.action || ""),
        targetType: String(req.query.targetType || req.query.target_type || ""),
        targetId: String(req.query.targetId || req.query.target_id || ""),
      }),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load audit logs.");
  }
});

router.get("/products/moderation", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      products: listProductModeration({
        status: String(req.query.status || ""),
        query: String(req.query.q || ""),
      }),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load product moderation.");
  }
});

router.get("/moderation/products", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      products: listProductModeration({
        status: String(req.query.status || ""),
        query: String(req.query.q || ""),
      }),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load product moderation.");
  }
});

router.patch("/products/:productId/moderation", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      product: adminReviewProduct(
        { role: "admin", user_id: req.auth?.user_id || req.auth?.id || null },
        req.params.productId,
        req.body || {},
      ),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update product moderation.");
  }
});

for (const action of ["approve", "reject", "request-edit"]) {
  router.post(`/moderation/products/:productId/${action}`, requireAdmin, (req, res) => {
    try {
      const status =
        action === "approve"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : "flagged";

      res.json({
        success: true,
        product: adminReviewProduct(
          adminAuthForRequest(req),
          req.params.productId,
          {
            ...(req.body || {}),
            status,
          },
        ),
      });
    } catch (error) {
      sendAdminError(res, error, "Could not update product moderation.");
    }
  });
}

router.get("/payouts", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      payouts: adminListPayouts({ status: String(req.query.status || "") }),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load payouts.");
  }
});

router.patch("/payouts/:payoutId", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      payout: adminUpdatePayout(
        { role: "admin", user_id: req.auth?.user_id || req.auth?.id || null },
        req.params.payoutId,
        req.body || {},
      ),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update payout.");
  }
});

router.get("/stage4/disputes", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      disputes: adminListDisputes({ status: String(req.query.status || "") }),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not load disputes.");
  }
});

router.patch("/stage4/disputes/:disputeId", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      dispute: adminDecideDispute(
        { role: "admin", user_id: req.auth?.user_id || req.auth?.id || null },
        req.params.disputeId,
        req.body || {},
      ),
    });
  } catch (error) {
    sendAdminError(res, error, "Could not update dispute.");
  }
});

router.patch("/:collection/:id/status", requireAdmin, (req, res) => {
  try {
    const { collection, id } = req.params;
    const { status, field = "status" } = req.body || {};

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    const data = updateRecordStatus(collection, id, status, field);
    res.json({ success: true, data });
  } catch (error) {
    sendAdminError(res, error, "Could not update admin record.");
  }
});


router.patch("/:collection/:id", requireAdmin, (req, res) => {
  try {
    const { collection, id } = req.params;
    const fields = req.body || {};

    if (!fields || Object.keys(fields).length === 0) {
      return res.status(400).json({ message: "Update fields are required" });
    }

    const data = updateRecordFields(collection, id, fields);
    res.json({ success: true, data });
  } catch (error) {
    sendAdminError(res, error, "Could not update admin record.");
  }
});

router.delete("/:collection/:id", requireAdmin, (req, res) => {
  try {
    const { collection, id } = req.params;
    const data = deleteRecord(collection, id);
    res.json({ success: true, data });
  } catch (error) {
    sendAdminError(res, error, "Could not delete admin record.");
  }
});

router.post("/reset", requireAdmin, (_req, res) => {
  res.json({ success: true, data: resetAdminDataset() });
});

export default router;
