import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireEmailVerified } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { fileUrl, upload } from "../middleware/upload.js";
import { sessionCookieName, sessionCookieOptions } from "../lib/session.js";
import {
  acceptRiderAssignment,
  adminListRiders,
  adminUpdateRiderVerification,
  auditRiderContact,
  completeDelivery,
  cookieConfig,
  createRiderAssignment,
  createRiderSafetyReport,
  failAssignment,
  generateRiderPaymentLink,
  getRiderAssignment,
  getRiderSession,
  getRouteEstimate,
  listAvailableRiders,
  listRiderAssignments,
  loginRider,
  logoutRider,
  markRiderNotificationRead,
  registerRider,
  riderDashboard,
  updateRiderVerificationDocuments,
  updateRiderAvailability,
  updateRiderLocation,
  verifyPickup,
} from "../services/rider.service.js";
import {
  createRiderAssignmentSchema,
  riderAvailabilitySchema,
  riderCompleteDeliverySchema,
  riderDocumentUploadSchema,
  riderContactAuditSchema,
  riderFailSchema,
  riderLocationSchema,
  riderLoginSchema,
  riderPickupSchema,
  riderRegisterSchema,
  riderSecurityReportSchema,
  riderAdminVerificationSchema,
  routeEstimateQuerySchema,
} from "../schemas/rider.schemas.js";

export const riderRouter = Router();

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

function requestMeta(req) {
  return {
    ipAddress: req.ip || req.socket?.remoteAddress || "",
    userAgent: req.get("user-agent") || "",
    currentSessionId: req.auth?.session_id || "",
  };
}

function attachProofUpload(req, _res, next) {
  if (req.file) {
    req.body.proofUrl = fileUrl(req, req.file);
    req.body.proofFileName = req.file.originalname || req.file.filename;
  }
  next();
}

const riderVerificationUpload = upload.fields([
  { name: "identityDocument", maxCount: 1 },
  { name: "selfie", maxCount: 1 },
  { name: "profilePhoto", maxCount: 1 },
]);

function attachRiderVerificationUploads(req, _res, next) {
  const files = req.files || {};
  const identityDocument = files.identityDocument?.[0];
  const selfie = files.selfie?.[0] || files.profilePhoto?.[0];

  if (identityDocument) {
    req.body.identityDocumentUrl = fileUrl(req, identityDocument);
  }

  if (selfie) {
    req.body.selfieUrl = fileUrl(req, selfie);
  }

  next();
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const locationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

riderRouter.post(
  "/register",
  authLimiter,
  riderVerificationUpload,
  attachRiderVerificationUploads,
  validate(riderRegisterSchema),
  asyncRoute(async (req, res) => {
    const result = await registerRider(req.body, requestMeta(req));
    res.cookie(sessionCookieName, result.session.token, sessionCookieOptions());
    res.status(201).json({
      user: result.user,
      riderProfile: result.riderProfile,
      emailVerificationRequired: result.emailVerificationRequired,
      developmentEmailVerificationToken: result.developmentEmailVerificationToken,
      emailVerificationExpiresAt: result.emailVerificationExpiresAt,
    });
  }),
);

riderRouter.post(
  "/login",
  authLimiter,
  validate(riderLoginSchema),
  asyncRoute(async (req, res) => {
    const result = await loginRider(req.body, requestMeta(req));
    res.cookie(sessionCookieName, result.session.token, sessionCookieOptions());
    res.json({ user: result.user, riderProfile: result.riderProfile });
  }),
);

riderRouter.post("/logout", (req, res) => {
  logoutRider(req.cookies?.[cookieConfig().sessionCookieName]);
  res.clearCookie(cookieConfig().sessionCookieName, cookieConfig().sessionCookieOptions);
  res.status(204).end();
});

riderRouter.get("/session", requireAuth, (req, res) => {
  res.json(getRiderSession(req.auth));
});

riderRouter.use(requireAuth, requireEmailVerified);

riderRouter.get("/dashboard", (req, res) => {
  res.json(riderDashboard(req.auth));
});

riderRouter.post(
  "/verification-documents",
  riderVerificationUpload,
  attachRiderVerificationUploads,
  validate(riderDocumentUploadSchema),
  (req, res) => {
    updateRiderVerificationDocuments(req.auth, req.body);
    res.json(getRiderSession(req.auth));
  },
);

riderRouter.patch("/availability", validate(riderAvailabilitySchema), (req, res) => {
  res.json({ riderProfile: updateRiderAvailability(req.auth, req.body) });
});

riderRouter.patch("/location", locationLimiter, validate(riderLocationSchema), (req, res) => {
  res.json({ riderProfile: updateRiderLocation(req.auth, req.body) });
});

riderRouter.get("/assignments", (req, res) => {
  res.json({ assignments: listRiderAssignments(req.auth, String(req.query?.status || "")) });
});

riderRouter.get("/assignments/:assignmentId", (req, res) => {
  res.json({ assignment: getRiderAssignment(req.auth, req.params.assignmentId) });
});

riderRouter.get(
  "/assignments/:assignmentId/route-estimate",
  validate(routeEstimateQuerySchema, "query"),
  asyncRoute(async (req, res) => {
    res.json(await getRouteEstimate(req.auth, req.params.assignmentId, req.query));
  }),
);

riderRouter.post("/assignments/:assignmentId/accept", (req, res) => {
  res.json({ assignment: acceptRiderAssignment(req.auth, req.params.assignmentId) });
});

riderRouter.post(
  "/assignments/:assignmentId/pickup",
  upload.single("proofPhoto"),
  attachProofUpload,
  validate(riderPickupSchema),
  (req, res) => {
    res.json({ assignment: verifyPickup(req.auth, req.params.assignmentId, req.body) });
  },
);

riderRouter.post(
  "/orders/:orderId/complete",
  upload.single("proofPhoto"),
  attachProofUpload,
  validate(riderCompleteDeliverySchema),
  (req, res) => {
    res.json({ assignment: completeDelivery(req.auth, req.params.orderId, req.body) });
  },
);

riderRouter.post(
  "/orders/:orderId/payment-link",
  asyncRoute(async (req, res) => {
    res.status(201).json(await generateRiderPaymentLink(req.auth, req.params.orderId));
  }),
);

riderRouter.post(
  "/assignments/:assignmentId/fail",
  validate(riderFailSchema),
  (req, res) => {
    res.json({ assignment: failAssignment(req.auth, req.params.assignmentId, req.body) });
  },
);

riderRouter.post(
  "/assignments/:assignmentId/contact-audit",
  validate(riderContactAuditSchema),
  (req, res) => {
    res.json(auditRiderContact(req.auth, req.params.assignmentId, req.body));
  },
);

riderRouter.post(
  "/security-reports",
  validate(riderSecurityReportSchema),
  (req, res) => {
    res.status(201).json({ report: createRiderSafetyReport(req.auth, req.body) });
  },
);

riderRouter.patch("/notifications/:notificationId/read", (req, res) => {
  res.json(markRiderNotificationRead(req.auth, req.params.notificationId));
});



riderRouter.get("/admin/riders", (req, res) => {
  res.json({ riders: adminListRiders(req.auth, String(req.query?.status || "")) });
});

riderRouter.patch(
  "/admin/riders/:riderId/verification",
  validate(riderAdminVerificationSchema),
  (req, res) => {
    res.json({ riderProfile: adminUpdateRiderVerification(req.auth, req.params.riderId, req.body) });
  },
);

// Seller/admin delivery-assignment support. This keeps rider assignment under one backend module,
// while still allowing the seller dashboard to assign paid orders to verified online riders.
riderRouter.get("/available", (req, res) => {
  res.json({ riders: listAvailableRiders(req.auth) });
});

riderRouter.post(
  "/assignments",
  validate(createRiderAssignmentSchema),
  (req, res) => {
    res.status(201).json(createRiderAssignment(req.auth, req.body));
  },
);
