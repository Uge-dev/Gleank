import { Router } from "express";
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
import { createId } from "../lib/ids.js";
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

const router = Router();

function getConfiguredAdminEmail() {
  return process.env.ADMIN_EMAIL || "admin@gleank.com";
}

function serializeAdminProfile(row) {
  return {
    name: row?.name || "Gleenc Admin",
    email: row?.email || getConfiguredAdminEmail(),
    role: "admin",
    avatarUrl: row?.avatar_url || null,
  };
}

function ensureAdminProfile() {
  const adminEmail = getConfiguredAdminEmail();
  const emailLookup = adminEmail.toLowerCase().trim();

  const existing = db
    .prepare("SELECT * FROM users WHERE role = 'admin' AND LOWER(email) = ? LIMIT 1")
    .get(emailLookup);

  if (existing) return existing;

  const now = new Date().toISOString();
  const id = createId("adm");

  db.prepare(`
    INSERT INTO users (
      id, name, email, password_hash, role, campus, phone,
      avatar_url, is_active, email_verified, email_verified_at,
      phone_verified, phone_verified_at, failed_login_count, locked_until,
      last_login_at, last_password_change_at, created_at, updated_at
    )
    VALUES (
      ?, 'Gleenc Admin', ?, 'admin-console-account',
      'admin', 'Gleenc HQ', '', NULL, 1, 1, ?, 0, NULL, 0, NULL,
      NULL, ?, ?, ?
    )
  `).run(id, adminEmail, now, now, now, now);

  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

function sendAdminError(res, error, fallback = "Admin request could not be completed.") {
  const status = error?.status || error?.statusCode || 500;
  if (shouldLogTechnicalError(error, status)) {
    console.error(error);
  }
  const message = safeErrorMessage(error, { status, fallback });
  res.status(status).json({ message });
}

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  const adminEmail = process.env.ADMIN_EMAIL || "admin@gleank.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "admin12345";
  const token =
    process.env.ADMIN_TOKEN ||
    process.env.ADMIN_DEMO_TOKEN ||
    "gleank-admin-local-token";

  if (String(email).toLowerCase().trim() !== adminEmail || String(password).trim() !== adminPassword) {
    return res.status(401).json({ message: "Invalid admin login details" });
  }

  const adminProfile = ensureAdminProfile();

  res.json({
    token,
    admin: serializeAdminProfile(adminProfile),
  });
});

router.get("/overview", requireAdmin, (_req, res) => {
  res.json(getAdminDataset());
});

router.get("/profile", requireAdmin, (_req, res) => {
  res.json({ admin: serializeAdminProfile(ensureAdminProfile()) });
});

router.post("/profile/avatar", requireAdmin, upload.single("avatar"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Choose an admin profile image to upload." });
    }

    const existing = ensureAdminProfile();
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
    const data = sendAdminSupportMessage(req.params.conversationId, req.body);
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
