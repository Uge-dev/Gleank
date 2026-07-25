import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  geocodeLocation,
  reverseGeocodeLocation,
} from "../services/location.service.js";

export const locationRouter = Router();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

locationRouter.use(requireAuth);

locationRouter.post("/geocode", asyncRoute(async (req, res) => {
  res.json(await geocodeLocation(req.body || {}));
}));

locationRouter.post("/reverse-geocode", asyncRoute(async (req, res) => {
  res.json(await reverseGeocodeLocation(req.body || {}));
}));
