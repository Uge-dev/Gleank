import { Router } from "express";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import {
  calculateDeliveryQuote,
  listDeliveryZones,
} from "../services/delivery.service.js";

export const deliveryRouter = Router();

deliveryRouter.use(requireAuth, requireEmailVerified);

deliveryRouter.get("/zones", (req, res) => {
  res.json(listDeliveryZones(String(req.query?.campus || "")));
});

deliveryRouter.post("/quote", (req, res) => {
  res.json({ quote: calculateDeliveryQuote(req.body) });
});
