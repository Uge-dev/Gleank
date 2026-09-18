import { Router } from "express";
import { db } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import { createId } from "../lib/ids.js";
import { requireRole, requireVerifiedSellerAccess } from "../middleware/auth.js";
import {
  deleteUploadedFiles,
  upload,
  fileUrl,
} from "../middleware/upload.js";
import { validate } from "../middleware/validate.js";
import {
  serializeProduct,
  serializeService,
  serializeStore,
} from "../lib/serializers.js";
import {
  findStoreByOwnerId,
  updateStore,
} from "../repositories/store.repository.js";
import {
  productSchema,
  serviceSchema,
  storeUpdateSchema,
} from "../schemas/seller.schemas.js";
import {
  cancelSellerRiderAssignment,
  createRiderAssignment,
  getSellerAssignedRider,
  listAvailableRiders,
} from "../services/rider.service.js";
import {
  getSellerActionableOrderCount,
  listSellerOrders,
} from "../services/order.service.js";
import {
  createProduct,
  createService,
  deleteProduct,
  deleteService,
  sellerWorkspace,
  updateProduct,
  updateService,
} from "../services/listing.service.js";
import {
  applySellerToLocalMarket,
  createMarketRequestForSeller,
  getSellerMarketStatus,
  getSellerOnboardingOptions,
  listApprovedMarketsForSeller,
} from "../services/market.service.js";
import {
  getSellerReadiness,
  updateSellerOnboardingDraft,
  upsertSellerVerification,
} from "../services/seller-verification.service.js";
import { ensureSellerSubscription, getSellerSubscription } from "../services/subscription.service.js";
import { listSellerPayouts } from "../services/payout.service.js";
import {
  getSellerPickupLocation,
  upsertSellerPickupLocation,
} from "../services/location.service.js";
import { scanUploadedImagesForModeration } from "../services/ocr.service.js";

export const sellerRouter = Router();
sellerRouter.use((req,res,next)=> {
 if (/rider|^\/markets(?:\/|$)|^\/onboarding(?:\/|$)/.test(req.path)) return res.status(410).json({message:'This feature has been retired. Use your profile and selling settings.'});
 next();
});

function sellerOnboardingPayload(req, verification) {
  if (req.auth.role === "seller") {
    ensureSellerSubscription(req.auth.user_id);
  }

  return {
    verification,
    readiness: getSellerReadiness(req.auth.user_id),
    subscription: getSellerSubscription(req.auth.user_id),
    options: getSellerOnboardingOptions(req.auth.user_id),
  };
}

sellerRouter.get("/onboarding/options", requireRole("seller"), (req, res) => {
  res.json(getSellerOnboardingOptions(req.auth.user_id));
});

sellerRouter.post("/onboarding/start", requireRole("seller"), (req, res) => {
  const verification = updateSellerOnboardingDraft(req.auth.user_id, req.body || {});
  ensureSellerSubscription(req.auth.user_id);
  res.status(201).json(sellerOnboardingPayload(req, verification));
});

for (const section of ["type", "store", "location", "contact"]) {
  sellerRouter.patch(`/onboarding/${section}`, requireRole("seller"), (req, res) => {
    const verification = updateSellerOnboardingDraft(req.auth.user_id, req.body || {});
    ensureSellerSubscription(req.auth.user_id);
    res.json(sellerOnboardingPayload(req, verification));
  });
}

sellerRouter.post(
  "/onboarding/submit",
  requireRole("seller"),
  upload.single("identityProof"),
  (req, res) => {
    const identityProofUrl = req.file ? fileUrl(req, req.file) : null;
    const verification = upsertSellerVerification(req.auth.user_id, req.body || {}, identityProofUrl);
    ensureSellerSubscription(req.auth.user_id);
    res.json(sellerOnboardingPayload(req, verification));
  },
);

sellerRouter.get("/markets/available", requireRole("seller"), (req, res) => {
  res.json({
    markets: listApprovedMarketsForSeller({
      query: String(req.query.q || ""),
    }),
  });
});

sellerRouter.post("/markets/join", requireRole("seller"), (req, res) => {
  res.status(201).json(applySellerToLocalMarket(req.auth.user_id, req.body || {}));
});

sellerRouter.post(
  "/markets/request",
  requireRole("seller"),
  upload.single("marketPhoto"),
  (req, res) => {
    const request = createMarketRequestForSeller(req.auth.user_id, {
      ...(req.body || {}),
      photoUrl: req.file ? fileUrl(req, req.file) : "",
    });
    res.status(201).json({ request, status: getSellerMarketStatus(req.auth.user_id) });
  },
);

sellerRouter.get("/markets/status", requireRole("seller"), (req, res) => {
  res.json(getSellerMarketStatus(req.auth.user_id));
});

sellerRouter.use(requireRole("seller", "admin"));

sellerRouter.get("/pickup-location", (req, res) => {
  res.json(getSellerPickupLocation(req.auth));
});

sellerRouter.post("/pickup-location", (req, res) => {
  res.json(upsertSellerPickupLocation(req.auth, req.body || {}));
});

function serializeHighlight(row) {
  return {
    id: row.id,
    storeId: row.store_id,
    title: row.title,
    category: row.category,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    count: 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getSellerStore(userId) {
  const store = findStoreByOwnerId(userId);

  if (!store) {
    throw new HttpError(404, "Seller store was not found.");
  }

  return store;
}

function listHighlights(storeId) {
  return db
    .prepare(`
      SELECT * FROM store_highlights
      WHERE store_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `)
    .all(storeId)
    .map(serializeHighlight);
}

function normalizeCategoryKey(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function canonicalStoreCategory(storeId, value) {
  const requestedCategory = String(value || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const categoryKey = normalizeCategoryKey(requestedCategory);
  const categories = db
    .prepare(`
      SELECT category FROM products WHERE store_id = ?
      UNION
      SELECT category FROM services WHERE store_id = ?
    `)
    .all(storeId, storeId)
    .map((row) => String(row.category || "").trim())
    .filter(Boolean);

  return (
    categories.find((category) => normalizeCategoryKey(category) === categoryKey) ||
    requestedCategory
  );
}

function oneWordLabel(value) {
  return String(value || "").trim().split(/\s+/).filter(Boolean)[0]?.slice(0, 24) || "";
}

function normalizeHighlightInput(body, storeId) {
  const category = canonicalStoreCategory(storeId, body.category);
  const title = oneWordLabel(body.title || category);
  const sortOrder = Number.parseInt(String(body.sortOrder ?? "0"), 10);

  if (!title) {
    throw new HttpError(400, "Highlight title is required.");
  }

  if (!category) {
    throw new HttpError(400, "Highlight category is required.");
  }

  return {
    title,
    category,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
  };
}

sellerRouter.get("/workspace", (req, res) => {
  const workspace = sellerWorkspace(req.auth.user_id);
  const highlights = listHighlights(workspace.store.id);

  res.json({
    store: serializeStore(workspace.store),
    products: workspace.products,
    services: workspace.services,
    highlights,
  });
});

sellerRouter.get("/orders/actionable-count", (req, res) => {
  res.json({ count: getSellerActionableOrderCount(req.auth) });
});

sellerRouter.get("/orders", (req, res) => {
  res.json({
    orders: listSellerOrders(req.auth, {
      view: String(req.query?.view || "active"),
    }),
  });
});

sellerRouter.get("/orders/:orderId/available-riders", (req, res) => {
  res.json({ riders: listAvailableRiders(req.auth) });
});

sellerRouter.post("/orders/:orderId/assign-rider", (req, res) => {
  res.status(201).json(createRiderAssignment(req.auth, {
    ...(req.body || {}),
    orderType: "store_order",
    orderId: req.params.orderId,
  }));
});

sellerRouter.get("/orders/:orderId/assigned-rider", (req, res) => {
  res.json({ assignedRider: getSellerAssignedRider(req.auth, req.params.orderId) });
});

sellerRouter.delete("/orders/:orderId/assigned-rider", (req, res) => {
  res.json(cancelSellerRiderAssignment(
    req.auth,
    req.params.orderId,
    String(req.body?.reason || ""),
  ));
});

sellerRouter.get("/payouts", (req, res) => {
  res.json({ payouts: listSellerPayouts(req.auth.user_id) });
});

sellerRouter.patch(
  "/store",
  upload.fields([
    { name: "logo", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  validate(storeUpdateSchema),
  (req, res) => {
    const logo = req.files?.logo?.[0];
    const cover = req.files?.cover?.[0];
    const existingStore = findStoreByOwnerId(req.auth.user_id);
    const store = updateStore(req.auth.user_id, {
      ...req.body,
      logoUrl: logo ? fileUrl(req, logo) : null,
      coverUrl: cover ? fileUrl(req, cover) : null,
      updatedAt: new Date().toISOString(),
    });

    if (logo && existingStore?.logo_url) {
      deleteUploadedFiles([existingStore.logo_url]);
    }
    if (cover && existingStore?.cover_url) {
      deleteUploadedFiles([existingStore.cover_url]);
    }

    res.json({ store: serializeStore(store) });
  },
);

sellerRouter.post("/highlights", upload.single("image"), (req, res) => {
  const store = getSellerStore(req.auth.user_id);
  const input = normalizeHighlightInput(req.body, store.id);
  const now = new Date().toISOString();
  const image = req.file ? fileUrl(req, req.file) : null;
  const maxSort = db
    .prepare(`
      SELECT COALESCE(MAX(sort_order), -1) AS value
      FROM store_highlights
      WHERE store_id = ?
    `)
    .get(store.id).value;

  const id = createId("hgl");

  db.prepare(`
    INSERT INTO store_highlights (
      id, store_id, title, category, image_url, sort_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    store.id,
    input.title,
    input.category,
    image,
    Number.isFinite(input.sortOrder) && input.sortOrder > 0
      ? input.sortOrder
      : maxSort + 1,
    now,
    now,
  );

  const highlight = db.prepare("SELECT * FROM store_highlights WHERE id = ?").get(id);

  res.status(201).json({ highlight: serializeHighlight(highlight) });
});

sellerRouter.patch("/highlights/reorder", (req, res) => {
  const store = getSellerStore(req.auth.user_id);
  const highlightIds = Array.isArray(req.body?.highlightIds)
    ? req.body.highlightIds.map((id) => String(id))
    : [];

  if (!highlightIds.length) {
    throw new HttpError(400, "Highlight order is required.");
  }

  const updateOrder = db.prepare(`
    UPDATE store_highlights
    SET sort_order = ?, updated_at = ?
    WHERE id = ? AND store_id = ?
  `);

  const now = new Date().toISOString();

  db.transaction(() => {
    highlightIds.forEach((id, index) => {
      updateOrder.run(index, now, id, store.id);
    });
  })();

  res.json({ highlights: listHighlights(store.id) });
});

sellerRouter.patch("/highlights/:id", upload.single("image"), (req, res) => {
  const store = getSellerStore(req.auth.user_id);
  const existing = db
    .prepare("SELECT * FROM store_highlights WHERE id = ? AND store_id = ?")
    .get(req.params.id, store.id);

  if (!existing) {
    throw new HttpError(404, "Highlight was not found.");
  }

  const input = normalizeHighlightInput(req.body, store.id);
  const image = req.file ? fileUrl(req, req.file) : existing.image_url;

  db.prepare(`
    UPDATE store_highlights
    SET title = ?, category = ?, image_url = ?, sort_order = ?, updated_at = ?
    WHERE id = ? AND store_id = ?
  `).run(
    input.title,
    input.category,
    image,
    input.sortOrder,
    new Date().toISOString(),
    existing.id,
    store.id,
  );

  if (req.file && existing.image_url) {
    deleteUploadedFiles([existing.image_url]);
  }

  const highlight = db.prepare("SELECT * FROM store_highlights WHERE id = ?").get(existing.id);

  res.json({ highlight: serializeHighlight(highlight) });
});

sellerRouter.delete("/highlights/:id", (req, res) => {
  const store = getSellerStore(req.auth.user_id);
  const existing = db
    .prepare("SELECT * FROM store_highlights WHERE id = ? AND store_id = ?")
    .get(req.params.id, store.id);

  if (!existing) {
    throw new HttpError(404, "Highlight was not found.");
  }

  db.prepare("DELETE FROM store_highlights WHERE id = ? AND store_id = ?").run(
    existing.id,
    store.id,
  );

  if (existing.image_url) {
    deleteUploadedFiles([existing.image_url]);
  }

  res.status(204).end();
});

sellerRouter.post(
  "/products",
  requireVerifiedSellerAccess,
  upload.array("images", 10),
  validate(productSchema),
  async (req, res) => {
    const imageModeration = await scanUploadedImagesForModeration(req.files || []);
    const product = createProduct(
      req.auth.user_id,
      req.body,
      (req.files || []).map((file) => fileUrl(req, file)),
      imageModeration,
    );
    res.status(201).json({ product });
  },
);

sellerRouter.patch(
  "/products/:id",
  requireVerifiedSellerAccess,
  upload.array("images", 10),
  validate(productSchema),
  async (req, res) => {
    const imageModeration = (req.files || []).length
      ? await scanUploadedImagesForModeration(req.files || [])
      : null;
    const product = updateProduct(
      req.auth.user_id,
      req.params.id,
      req.body,
      (req.files || []).map((file) => fileUrl(req, file)),
      imageModeration,
    );
    res.json({ product });
  },
);

sellerRouter.delete("/products/:id", (req, res) => {
  deleteProduct(req.auth.user_id, req.params.id);
  res.status(204).end();
});

sellerRouter.post(
  "/services",
  requireVerifiedSellerAccess,
  upload.array("images", 10),
  validate(serviceSchema),
  async (req, res) => {
    const imageModeration = await scanUploadedImagesForModeration(req.files || []);
    const service = createService(
      req.auth.user_id,
      req.body,
      (req.files || []).map((file) => fileUrl(req, file)),
      imageModeration,
    );
    res.status(201).json({ service });
  },
);

sellerRouter.patch(
  "/services/:id",
  requireVerifiedSellerAccess,
  upload.array("images", 10),
  validate(serviceSchema),
  async (req, res) => {
    const imageModeration = (req.files || []).length
      ? await scanUploadedImagesForModeration(req.files || [])
      : null;
    const service = updateService(
      req.auth.user_id,
      req.params.id,
      req.body,
      (req.files || []).map((file) => fileUrl(req, file)),
      imageModeration,
    );
    res.json({ service });
  },
);

sellerRouter.delete("/services/:id", (req, res) => {
  deleteService(req.auth.user_id, req.params.id);
  res.status(204).end();
});

sellerRouter.get("/store", (req, res) => {
  res.json({ store: serializeStore(findStoreByOwnerId(req.auth.user_id)) });
});
