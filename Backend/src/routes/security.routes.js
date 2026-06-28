import { Router } from "express";
import { changePasswordSchema } from "../schemas/auth.schemas.js";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import {
  changePassword,
  getAccountSecurity,
  logoutAllDevices,
} from "../services/security.service.js";

export const securityRouter = Router();

function requestMeta(req) {
  return {
    ipAddress: req.ip || req.socket?.remoteAddress || "",
    userAgent: req.get("user-agent") || "",
    currentSessionId: req.auth?.session_id || "",
  };
}

securityRouter.use(requireAuth);

securityRouter.get("/me", (req, res) => {
  res.json(getAccountSecurity(req.auth));
});

securityRouter.post(
  "/change-password",
  validate(changePasswordSchema),
  async (req, res) => {
    res.json(await changePassword(req.auth.user_id, req.body, requestMeta(req)));
  },
);

securityRouter.post("/logout-all", (req, res) => {
  res.json(logoutAllDevices(req.auth.user_id, req.auth.session_id, requestMeta(req)));
});
