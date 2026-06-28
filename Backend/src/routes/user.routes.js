import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { serializeUser } from "../lib/serializers.js";
import { updateUser } from "../repositories/user.repository.js";

export const userRouter = Router();

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  campus: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).default(""),
});

userRouter.patch(
  "/me",
  requireAuth,
  validate(profileSchema),
  (req, res) => {
    const user = updateUser(req.auth.user_id, {
      ...req.body,
      updatedAt: new Date().toISOString(),
    });

    res.json({ user: serializeUser(user) });
  },
);
