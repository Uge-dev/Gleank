import { Router } from "express";
import rateLimit from "express-rate-limit";
import { WaitlistEntry } from "../models/WaitlistEntry.js";
import {
  createAdminToken,
  requireAdmin,
  validateAdminCredentials,
} from "../middleware/adminAuth.js";
import { buildCsv, normalizeText } from "../utils/validators.js";

export const adminRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many admin login attempts. Please try again later.",
  },
});

adminRouter.post("/login", loginLimiter, (req, res) => {
  const email = normalizeText(req.body?.email).toLowerCase();
  const password = String(req.body?.password || "");

  if (!validateAdminCredentials(email, password)) {
    return res.status(401).json({ message: "Invalid admin email or password." });
  }

  return res.json({
    message: "Admin login successful.",
    token: createAdminToken(),
    admin: { email },
  });
});

adminRouter.get("/me", requireAdmin, (req, res) => {
  return res.json({ admin: { email: req.admin.email, role: req.admin.role } });
});

adminRouter.get("/waitlist", requireAdmin, async (req, res, next) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const skip = (page - 1) * limit;
    const search = normalizeText(req.query.search);
    const userType = normalizeText(req.query.userType);
    const status = normalizeText(req.query.status);

    const filter = {};

    if (search) {
      filter.$or = [
        { name: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
        { whatsapp: new RegExp(search, "i") },
        { campus: new RegExp(search, "i") },
      ];
    }

    if (userType) filter.userType = userType;
    if (status) filter.status = status;

    const [entries, total] = await Promise.all([
      WaitlistEntry.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WaitlistEntry.countDocuments(filter),
    ]);

    return res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      entries,
    });
  } catch (error) {
    return next(error);
  }
});

adminRouter.get("/waitlist/stats", requireAdmin, async (_req, res, next) => {
  try {
    const [total, byType, byCampus, byStatus] = await Promise.all([
      WaitlistEntry.countDocuments(),
      WaitlistEntry.aggregate([
        { $group: { _id: "$userType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      WaitlistEntry.aggregate([
        { $match: { campus: { $ne: "" } } },
        { $group: { _id: "$campus", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      WaitlistEntry.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return res.json({ total, byType, byCampus, byStatus });
  } catch (error) {
    return next(error);
  }
});

adminRouter.patch("/waitlist/:id", requireAdmin, async (req, res, next) => {
  try {
    const allowedStatus = ["new", "contacted", "converted", "ignored"];
    const update = {};

    if (req.body?.status && allowedStatus.includes(req.body.status)) {
      update.status = req.body.status;
    }

    if (typeof req.body?.notes === "string") {
      update.notes = req.body.notes.trim();
    }

    const entry = await WaitlistEntry.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    if (!entry) {
      return res.status(404).json({ message: "Waitlist entry not found." });
    }

    return res.json({ message: "Waitlist entry updated.", entry });
  } catch (error) {
    return next(error);
  }
});

adminRouter.get("/waitlist/export", requireAdmin, async (_req, res, next) => {
  try {
    const entries = await WaitlistEntry.find().sort({ createdAt: -1 }).lean();
    const csv = buildCsv(entries);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=gleank-waitlist-${new Date().toISOString().slice(0, 10)}.csv`,
    );

    return res.send(csv);
  } catch (error) {
    return next(error);
  }
});
