import { Router } from "express";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import {
  calculateCheckoutDeliveryQuote,
  calculateDeliveryQuote,
  listDeliveryZones,
} from "../services/delivery.service.js";

export const deliveryRouter = Router();

deliveryRouter.use(requireAuth, requireEmailVerified);

deliveryRouter.get("/zones", (req, res) => {
  res.json(listDeliveryZones(String(req.query?.campus || "")));
});

deliveryRouter.post("/quote", (req, res) => {
  const hasCartItems = Array.isArray(req.body?.items) && req.body.items.length > 0;
  res.json({
    quote: hasCartItems
      ? calculateCheckoutDeliveryQuote(req.auth, req.body)
      : calculateDeliveryQuote(req.body),
  });
});
