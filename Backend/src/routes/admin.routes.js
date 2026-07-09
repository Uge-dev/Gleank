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
import {
  adminCreateMarket,
  adminListMarkets,
  adminListMarketSellers,
  adminUpdateMarket,
  adminUpdateMarketCategories,
  adminUpdateMarketStatus,
} from "../services/market.service.js";
import {
  adminListRiders,
  adminUpdateRiderVerification,
} from "../services/rider.service.js";

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
    res.status(error.statusCode || 500).json({ message: error.message || "Could not upload admin profile image" });
  }
});

router.post("/support/:conversationId/messages", requireAdmin, (req, res) => {
  try {
    const data = sendAdminSupportMessage(req.params.conversationId, req.body);
    res.status(201).json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Could not send support reply" });
  }
});

router.patch("/support/:conversationId/read", requireAdmin, (req, res) => {
  try {
    const data = markSupportConversationRead(req.params.conversationId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Could not mark support conversation as read" });
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
    res.status(error.status || error.statusCode || 500).json({ message: error.message || "Could not load markets" });
  }
});

router.post("/markets", requireAdmin, (req, res) => {
  try {
    res.status(201).json({
      success: true,
      market: adminCreateMarket(req.body || {}),
    });
  } catch (error) {
    res.status(error.status || error.statusCode || 500).json({ message: error.message || "Could not create market" });
  }
});

router.patch("/markets/:marketId", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      market: adminUpdateMarket(req.params.marketId, req.body || {}),
    });
  } catch (error) {
    res.status(error.status || error.statusCode || 500).json({ message: error.message || "Could not update market" });
  }
});

router.patch("/markets/:marketId/status", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      market: adminUpdateMarketStatus(req.params.marketId, req.body?.status),
    });
  } catch (error) {
    res.status(error.status || error.statusCode || 500).json({ message: error.message || "Could not update market status" });
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
    res.status(error.status || error.statusCode || 500).json({ message: error.message || "Could not load market sellers" });
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
    res.status(error.status || error.statusCode || 500).json({ message: error.message || "Could not update market categories" });
  }
});

router.get("/riders", requireAdmin, (req, res) => {
  try {
    res.json({
      success: true,
      riders: adminListRiders({ role: "admin" }, String(req.query.status || "")),
    });
  } catch (error) {
    res.status(error.status || error.statusCode || 500).json({ message: error.message || "Could not load riders" });
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
    res.status(error.status || error.statusCode || 500).json({ message: error.message || "Could not update rider verification" });
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
    res.status(error.statusCode || 500).json({ message: error.message || "Could not update admin record" });
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
    res.status(error.statusCode || 500).json({ message: error.message || "Could not update admin record" });
  }
});

router.delete("/:collection/:id", requireAdmin, (req, res) => {
  try {
    const { collection, id } = req.params;
    const data = deleteRecord(collection, id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || "Could not delete admin record" });
  }
});

router.post("/reset", requireAdmin, (_req, res) => {
  res.json({ success: true, data: resetAdminDataset() });
});

export default router;
