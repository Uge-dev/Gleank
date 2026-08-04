import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { serializeUser } from "../lib/serializers.js";
import { findUserById, updateUser, updateUserAvatar } from "../repositories/user.repository.js";
import { deleteUploadedFiles, fileUrl, upload } from "../middleware/upload.js";
import { HttpError } from "../lib/http-error.js";

export const userRouter = Router();

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  campus: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).default(""),
  country: z.string().trim().max(80).default("Nigeria"),
  state: z.string().trim().max(120).default(""),
  city: z.string().trim().max(120).default(""),
  address: z.string().trim().max(240).default(""),
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

userRouter.post(
  "/me/avatar",
  requireAuth,
  upload.single("avatar"),
  (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Choose an image to upload.");
    }

    const existingUser = findUserById(req.auth.user_id);
    const avatarUrl = fileUrl(req, req.file);
    const user = updateUserAvatar(
      req.auth.user_id,
      avatarUrl,
      new Date().toISOString(),
    );

    if (existingUser?.avatar_url) {
      deleteUploadedFiles([existingUser.avatar_url]);
    }

    res.json({ user: serializeUser(user) });
  },
);
