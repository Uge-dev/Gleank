import { Router } from "express";
import { getPublicProduct } from "../services/catalog.service.js";
import { requireAuth } from "../middleware/auth.js";
import {
  addProductComment,
  likeProduct,
  recordProductShare,
  recordProductView,
  unlikeProduct,
} from "../services/interaction.service.js";

export const productRouter = Router();

productRouter.get("/:id", (req, res) => {
  res.json(getPublicProduct(req.params.id, req.auth?.user_id));
});

productRouter.post("/:id/like", requireAuth, (req, res) => {
  res.json({
    interaction: likeProduct(req.auth.user_id, req.params.id),
  });
});

productRouter.delete("/:id/like", requireAuth, (req, res) => {
  res.json({
    interaction: unlikeProduct(req.auth.user_id, req.params.id),
  });
});

productRouter.post("/:id/share", (req, res) => {
  res.json({
    interaction: recordProductShare(
      req.auth?.user_id,
      req.params.id,
      req.body?.anonKey,
    ),
  });
});

productRouter.post("/:id/view", (req, res) => {
  res.json({
    interaction: recordProductView(
      req.auth?.user_id,
      req.params.id,
      req.body?.anonKey,
    ),
  });
});

productRouter.post("/:id/comments", requireAuth, (req, res) => {
  const comment = addProductComment(
    req.auth.user_id,
    req.params.id,
    req.body.body,
  );
  res.status(201).json({
    comment: {
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      user: {
        id: comment.user_id,
        name: comment.name,
        avatarUrl: comment.avatar_url || null,
      },
    },
  });
});
