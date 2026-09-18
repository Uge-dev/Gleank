import rateLimit from "express-rate-limit";
import {
  banks,
  recipient,
  saveRecipient,
} from "../services/settlement.service.js";
import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { db } from "../db/database.js";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import {
  getAccountProfile,
  completeAccountProfile,
  getFulfillmentSettings,
  saveFulfillmentSettings,
} from "../services/account-profile.service.js";
import {
  ownedOrder,
  listPackages,
  preparePackages,
  dispatchPackage,
  confirmPackage,
  remindBuyer,
} from "../services/fulfillment.service.js";
import { listOrders, listSellerOrders } from "../services/order.service.js";
import { listSellerPayouts } from "../services/payout.service.js";
export const commerceRouter = Router();
commerceRouter.use(requireAuth);
commerceRouter.get("/profile", (req, res) =>
  res.json({ profile: getAccountProfile(req.auth.user_id) }),
);
commerceRouter.put("/profile", (req, res) =>
  res.json({ profile: completeAccountProfile(req.auth.user_id, req.body) }),
);
commerceRouter.get("/selling", (req, res) =>
  res.json({ settings: getFulfillmentSettings(req.auth.user_id) }),
);
commerceRouter.put("/selling", requireEmailVerified, (req, res) =>
  res.json({ settings: saveFulfillmentSettings(req.auth.user_id, req.body) }),
);
commerceRouter.get("/orders", (req, res) =>
  res.json({
    purchases: listOrders(req.auth.user_id),
    sales: listSellerOrders({ ...req.auth, role: "seller" }),
  }),
);
commerceRouter.get("/earnings", (req, res) =>
  res.json({ payouts: listSellerPayouts(req.auth.user_id) }),
);
commerceRouter.post("/quote", (req, res) => {
  const input = z
    .object({
      items: z
        .array(
          z.object({
            productId: z.string(),
            quantity: z.number().int().min(1).max(99),
          }),
        )
        .min(1)
        .max(100),
    })
    .parse(req.body);
  const groups = new Map();
  for (const item of input.items) {
    const row = db
      .prepare(
        `SELECT products.*,stores.owner_id,stores.name AS store_name FROM products JOIN stores ON stores.id=products.store_id WHERE products.id=? AND stores.status='active'`,
      )
      .get(item.productId);
    if (!row || row.status !== "active" || row.stock < item.quantity)
      throw new HttpError(409, "A product is unavailable. Refresh your cart.");
    const settings = getFulfillmentSettings(row.owner_id);
    if (!settings)
      throw new HttpError(
        422,
        `${row.store_name} has not configured delivery yet.`,
      );
    const group = groups.get(row.store_id) || {
      storeId: row.store_id,
      storeName: row.store_name,
      subtotalKobo: 0,
      deliveryFeeKobo: Math.round(settings.deliveryFee * 100),
      coverage: settings.coverage,
      deliveryDays: settings.deliveryDays,
    };
    group.subtotalKobo += row.price_kobo * item.quantity;
    groups.set(row.store_id, group);
  }
  const sellers = [...groups.values()];
  res.json({
    sellers,
    totalKobo: sellers.reduce(
      (sum, g) => sum + g.subtotalKobo + g.deliveryFeeKobo,
      0,
    ),
  });
});
commerceRouter.use(requireEmailVerified);
commerceRouter.get("/payout/banks", async (req, res) =>
  res.json({ banks: await banks() }),
);
commerceRouter.get("/payout/account", (req, res) =>
  res.json({ account: recipient(req.auth.user_id) }),
);
commerceRouter.put(
  "/payout/account",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 5 }),
  async (req, res) =>
    res.json({ account: await saveRecipient(req.auth, req.body) }),
);
commerceRouter.get("/orders/:id/packages", (req, res) =>
  res.json({ packages: listPackages(req.auth, req.params.id) }),
);
commerceRouter.post("/orders/:id/packages", (req, res) =>
  res.status(201).json({ packages: preparePackages(req.auth, req.params.id) }),
);
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 },
}).single("receipt");
const receiptRoot = path.resolve(
  process.env.PRIVATE_RECEIPTS_PATH ||
    path.join(path.dirname(env.databasePath), "private-receipts"),
);
commerceRouter.post(
  "/orders/:id/packages/:packageId/dispatch",
  receiptUpload,
  async (req, res) => {
    ownedOrder(req.auth, req.params.id, "seller");
    let receiptPath = "";
    try {
      if (req.file) {
        // Re-encode images rather than trusting client MIME types or filenames.
        const image = sharp(req.file.buffer, { limitInputPixels: 20000000 });
        const meta = await image.metadata();
        if (!["jpeg", "png", "webp"].includes(meta.format))
          throw new HttpError(
            422,
            "Upload a JPEG, PNG or WebP transport receipt.",
          );
        fs.mkdirSync(receiptRoot, { recursive: true });
        receiptPath = path.join(receiptRoot, crypto.randomUUID() + ".webp");
        await image
          .resize({ width: 1800, withoutEnlargement: true })
          .webp()
          .toFile(receiptPath);
      }
      const packages = dispatchPackage(
        req.auth,
        req.params.id,
        req.params.packageId,
        req.body,
        receiptPath,
      );
      res.json({ packages });
    } catch (error) {
      if (receiptPath) fs.rmSync(receiptPath, { force: true });
      throw error;
    }
  },
);
commerceRouter.get("/orders/:id/packages/:packageId/receipt", (req, res) => {
  if (req.auth.role !== "admin") ownedOrder(req.auth, req.params.id);
  const row = db
    .prepare(
      "SELECT receipt_path FROM order_packages WHERE id=? AND order_id=?",
    )
    .get(req.params.packageId, req.params.id);
  if (!row?.receipt_path) throw new HttpError(404, "Receipt was not found.");
  res.setHeader("Cache-Control", "private, no-store");
  res.sendFile(row.receipt_path);
});
commerceRouter.post("/orders/:id/packages/:packageId/confirm", (req, res) =>
  res.json({
    packages: confirmPackage(
      req.auth,
      req.params.id,
      req.params.packageId,
      req.body,
    ),
  }),
);
commerceRouter.post("/orders/:id/packages/:packageId/remind", (req, res) =>
  res.json(remindBuyer(req.auth, req.params.id, req.params.packageId)),
);
