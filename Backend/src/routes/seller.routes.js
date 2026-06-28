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
  createProduct,
  createService,
  deleteProduct,
  deleteService,
  sellerWorkspace,
  updateProduct,
  updateService,
} from "../services/listing.service.js";

export const sellerRouter = Router();

sellerRouter.use(requireRole("seller", "admin"));

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

function normalizeHighlightInput(body) {
  const title = String(body.title || "").trim().slice(0, 40);
  const category = String(body.category || "").trim().slice(0, 60);
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
  const input = normalizeHighlightInput(req.body);
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

  const input = normalizeHighlightInput(req.body);
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
  (req, res) => {
    const product = createProduct(
      req.auth.user_id,
      req.body,
      (req.files || []).map((file) => fileUrl(req, file)),
    );
    res.status(201).json({ product });
  },
);

sellerRouter.patch(
  "/products/:id",
  requireVerifiedSellerAccess,
  upload.array("images", 10),
  validate(productSchema),
  (req, res) => {
    const product = updateProduct(
      req.auth.user_id,
      req.params.id,
      req.body,
      (req.files || []).map((file) => fileUrl(req, file)),
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
  (req, res) => {
    const service = createService(
      req.auth.user_id,
      req.body,
      (req.files || []).map((file) => fileUrl(req, file)),
    );
    res.status(201).json({ service });
  },
);

sellerRouter.patch(
  "/services/:id",
  requireVerifiedSellerAccess,
  upload.array("images", 10),
  validate(serviceSchema),
  (req, res) => {
    const service = updateService(
      req.auth.user_id,
      req.params.id,
      req.body,
      (req.files || []).map((file) => fileUrl(req, file)),
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
