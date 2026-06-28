import { Router } from "express";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { saveItemSchema } from "../schemas/marketplace.schemas.js";
import {
  listSavedItems,
  removeSavedItem,
  saveItem,
} from "../services/saved.service.js";

export const savedRouter = Router();

savedRouter.use(requireAuth, requireEmailVerified);

savedRouter.get("/", (req, res) => {
  res.json({ savedItems: listSavedItems(req.auth.user_id) });
});

savedRouter.post("/", validate(saveItemSchema), (req, res) => {
  res.status(201).json({ savedItem: saveItem(req.auth.user_id, req.body) });
});

savedRouter.delete("/:itemType/:itemId", (req, res) => {
  removeSavedItem(req.auth.user_id, req.params.itemType, req.params.itemId);
  res.status(204).end();
});
