import { Router } from "express";
import { getPublicProduct } from "../services/catalog.service.js";
import { requireAuth } from "../middleware/auth.js";
import {
  addProductComment,
  deleteProductComment,
  likeProductComment,
  likeProduct,
  recordProductShare,
  recordProductView,
  unlikeProductComment,
  unlikeProduct,
} from "../services/interaction.service.js";

export const productRouter = Router();

productRouter.get("/:id", (req, res) => {
  res.json(getPublicProduct(req.params.id, req.auth));
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
  res.status(201).json({
    comment: addProductComment(req.auth.user_id, req.params.id, req.body),
  });
});

productRouter.post("/:id/comments/:commentId/like", requireAuth, (req, res) => {
  res.json({
    comment: likeProductComment(
      req.auth.user_id,
      req.params.id,
      req.params.commentId,
    ),
  });
});

productRouter.delete("/:id/comments/:commentId/like", requireAuth, (req, res) => {
  res.json({
    comment: unlikeProductComment(
      req.auth.user_id,
      req.params.id,
      req.params.commentId,
    ),
  });
});

productRouter.delete("/:id/comments/:commentId", requireAuth, (req, res) => {
  res.json({
    comment: deleteProductComment(req.auth, req.params.id, req.params.commentId),
  });
});
