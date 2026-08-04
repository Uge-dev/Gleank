import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { locationRouteSchema } from "../schemas/location.schemas.js";
import {
  geocodeLocation,
  getLocationCatalog,
  getAccountLocationPresence,
  reverseGeocodeLocation,
  routeLocation,
  upsertAccountLocationPresence,
} from "../services/location.service.js";

export const locationRouter = Router();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const routeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const catalogLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

// Signup must be able to load Africa country/state data before a session
// exists. Keep this read-only catalog public; all location actions below it
// remain authenticated.
locationRouter.get("/catalog", catalogLimiter, (req, res) => {
  res.json(getLocationCatalog({
    country: req.query?.country,
    stateQuery: req.query?.stateQuery,
  }));
});

locationRouter.use(requireAuth);

locationRouter.post("/geocode", geocodeLimiter, asyncRoute(async (req, res) => {
  res.json(await geocodeLocation(req.body || {}));
}));

locationRouter.post("/reverse-geocode", geocodeLimiter, asyncRoute(async (req, res) => {
  res.json(await reverseGeocodeLocation(req.body || {}));
}));

locationRouter.post(
  "/route",
  routeLimiter,
  validate(locationRouteSchema),
  asyncRoute(async (req, res) => {
    res.json(await routeLocation(req.body || {}));
  }),
);

locationRouter.get("/presence", (req, res) => {
  res.json({
    presence: getAccountLocationPresence(req.auth.user_id || req.auth.id),
  });
});

locationRouter.post("/presence", (req, res) => {
  res.json(upsertAccountLocationPresence(req.auth, req.body || {}));
});
