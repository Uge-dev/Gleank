import { Router } from "express";
import {
  changePasswordSchema,
  securityPasswordResetCodeSchema,
  securityPasswordResetCompleteSchema,
} from "../schemas/auth.schemas.js";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import {
  changePassword,
  completeLoggedInPasswordReset,
  getAccountSecurity,
  logoutAllDevices,
  requestLoggedInPasswordReset,
  verifyLoggedInPasswordResetCode,
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

// Kept for backward compatibility, but the UI no longer uses this direct form.
securityRouter.post(
  "/change-password",
  validate(changePasswordSchema),
  async (req, res) => {
    res.json(await changePassword(req.auth.user_id, req.body, requestMeta(req)));
  },
);

securityRouter.post("/password-reset/request", async (req, res) => {
  res.json(await requestLoggedInPasswordReset(req.auth.user_id, requestMeta(req)));
});

securityRouter.post(
  "/password-reset/verify-code",
  validate(securityPasswordResetCodeSchema),
  (req, res) => {
    res.json(
      verifyLoggedInPasswordResetCode(
        req.auth.user_id,
        req.body.code,
        requestMeta(req),
      ),
    );
  },
);

securityRouter.post(
  "/password-reset/complete",
  validate(securityPasswordResetCompleteSchema),
  async (req, res) => {
    res.json(
      await completeLoggedInPasswordReset(
        req.auth.user_id,
        req.body,
        requestMeta(req),
      ),
    );
  },
);

securityRouter.post("/logout-all", (req, res) => {
  res.json(logoutAllDevices(req.auth.user_id, req.auth.session_id, requestMeta(req)));
});
