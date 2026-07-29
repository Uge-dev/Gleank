import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  deleteSession,
  sessionCookieName,
  sessionCookieOptions,
} from "../lib/session.js";
import { serializeStore, serializeUser } from "../lib/serializers.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { findStoreByOwnerId } from "../repositories/store.repository.js";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../schemas/auth.schemas.js";
import {
  loginUser,
  registerUser,
  requestPasswordReset,
  resendEmailVerification,
  resetPassword,
  verifyEmail,
} from "../services/auth.service.js";
import { markAuthenticatedRiderOffline } from "../services/rider-presence.service.js";

export const authRouter = Router();

function requestMeta(req) {
  return {
    ipAddress: req.ip || req.socket?.remoteAddress || "",
    userAgent: req.get("user-agent") || "",
    currentSessionId: req.auth?.session_id || "",
  };
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const emailVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 12,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1_000,
  limit: 8,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

authRouter.use(authLimiter);

authRouter.post("/register", registerLimiter, validate(registerSchema), async (req, res) => {
  const result = await registerUser(req.body, requestMeta(req));
  res.cookie(
    sessionCookieName,
    result.session.token,
    sessionCookieOptions(),
  );
  res.status(201).json({
    success: true,
    message: "Account created successfully.",
    data: {
      user: result.user,
      store: result.store,
      emailVerificationRequired: result.emailVerificationRequired,
    },
    user: result.user,
    store: result.store,
    emailVerificationRequired: result.emailVerificationRequired,
  });
});

authRouter.post("/login", loginLimiter, validate(loginSchema), async (req, res) => {
  const result = await loginUser(req.body, requestMeta(req));
  res.cookie(
    sessionCookieName,
    result.session.token,
    sessionCookieOptions(),
  );
  res.json({
    success: true,
    message: "Login successful.",
    data: { user: result.user, store: result.store },
    user: result.user,
    store: result.store,
  });
});

authRouter.post("/verify-email", emailVerificationLimiter, validate(verifyEmailSchema), (req, res) => {
  const result = verifyEmail(req.body, requestMeta(req));
  res.json(result);
});

authRouter.post("/resend-verification", emailVerificationLimiter, requireAuth, async (req, res) => {
  res.json(await resendEmailVerification(req.auth.user_id, requestMeta(req)));
});

authRouter.post(
  "/forgot-password",
  passwordResetLimiter,
  validate(forgotPasswordSchema),
  async (req, res) => {
    res.json(await requestPasswordReset(req.body, requestMeta(req)));
  },
);

authRouter.post(
  "/reset-password",
  passwordResetLimiter,
  validate(resetPasswordSchema),
  async (req, res) => {
    res.json(await resetPassword(req.body, requestMeta(req)));
  },
);

authRouter.post("/logout", (req, res) => {
  markAuthenticatedRiderOffline(req.auth, { allSessions: true });
  deleteSession(req.cookies?.[sessionCookieName]);
  res.clearCookie(sessionCookieName, sessionCookieOptions());
  res.status(204).end();
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = serializeUser(req.auth);
  const store = serializeStore(findStoreByOwnerId(req.auth.user_id));
  res.json({
    success: true,
    message: "Session loaded.",
    data: { user, store },
    user,
    store,
  });
});
