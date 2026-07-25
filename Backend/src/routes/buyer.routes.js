import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  createBuyerDeliveryLocation,
  listBuyerDeliveryLocations,
} from "../services/location.service.js";

export const buyerRouter = Router();

buyerRouter.use(requireAuth);

buyerRouter.get("/delivery-locations", (req, res) => {
  res.json(listBuyerDeliveryLocations(req.auth));
});

buyerRouter.post("/delivery-location", (req, res) => {
  res.status(201).json(createBuyerDeliveryLocation(req.auth, req.body || {}));
});

buyerRouter.post("/delivery-locations", (req, res) => {
  res.status(201).json(createBuyerDeliveryLocation(req.auth, req.body || {}));
});
