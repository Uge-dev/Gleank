import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";

fs.mkdirSync(env.uploadsPath, { recursive: true });

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, env.uploadsPath),
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase() || ".bin";
    callback(null, `${Date.now()}-${nanoid(10)}${extension}`);
  },
});

export const upload = multer({
  storage,
  limits: {
  fileSize: env.maxUploadMb * 1024 * 1024,
  files: 15,
},
  fileFilter: (_req, file, callback) => {
    if (!allowedTypes.has(file.mimetype)) {
      callback(new HttpError(415, "Only JPEG, PNG, WebP, and GIF images are allowed."));
      return;
    }

    callback(null, true);
  },
});

export function fileUrl(req, file) {
  return `/uploads/${file.filename}`;
}

export function deleteUploadedFiles(values) {
  for (const value of values.flat(Infinity).filter(Boolean)) {
    const source =
      typeof value === "string"
        ? value
        : value.path || value.filename || "";
    const filename = path.basename(source);

    if (!filename || filename === ".gitkeep") continue;

    const target = path.resolve(env.uploadsPath, filename);
    if (!target.startsWith(`${path.resolve(env.uploadsPath)}${path.sep}`)) {
      continue;
    }

    try {
      fs.unlinkSync(target);
    } catch (error) {
      if (error.code !== "ENOENT") console.error(error);
    }
  }
}
