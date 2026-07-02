import { Router } from "express";
import rateLimit from "express-rate-limit";
import { WaitlistEntry } from "../models/WaitlistEntry.js";
import {
  cleanPhone,
  isValidEmail,
  normalizeEmail,
  normalizeText,
} from "../utils/validators.js";

export const waitlistRouter = Router();

const waitlistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many waitlist attempts. Please try again later.",
  },
});

waitlistRouter.post("/", waitlistLimiter, async (req, res, next) => {
  try {
    const name = normalizeText(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const whatsapp = cleanPhone(req.body?.whatsapp);
    const campus = normalizeText(req.body?.campus);
    const userType = normalizeText(req.body?.userType || "buyer");
    const allowedUserTypes = ["buyer", "seller", "service_provider", "rider"];

    if (!name || name.length < 2) {
      return res.status(400).json({ message: "Please enter your full name." });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Please enter a valid email address." });
    }

    if (!whatsapp || whatsapp.length < 7) {
      return res.status(400).json({ message: "Please enter a valid WhatsApp phone number." });
    }

    if (!allowedUserTypes.includes(userType)) {
      return res.status(400).json({ message: "Please select a valid waitlist type." });
    }

    const meta = {
      ipAddress: req.ip || req.socket?.remoteAddress || "",
      userAgent: req.get("user-agent") || "",
    };

    const existing = await WaitlistEntry.findOne({ email });

    if (existing) {
      existing.name = name;
      existing.whatsapp = whatsapp;
      existing.campus = campus;
      existing.userType = userType;
      existing.source = "landing_page";
      existing.ipAddress = meta.ipAddress;
      existing.userAgent = meta.userAgent;
      await existing.save();

      return res.status(200).json({
        message: "You are already on the Gleank waitlist. We updated your details.",
        alreadyJoined: true,
        entry: existing,
      });
    }

    const entry = await WaitlistEntry.create({
      name,
      email,
      whatsapp,
      campus,
      userType,
      source: "landing_page",
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    return res.status(201).json({
      message: "You have successfully joined the Gleank waitlist.",
      alreadyJoined: false,
      entry,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(200).json({
        message: "You are already on the Gleank waitlist.",
        alreadyJoined: true,
      });
    }

    return next(error);
  }
});
