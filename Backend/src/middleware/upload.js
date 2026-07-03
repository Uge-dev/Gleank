import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import sharp from "sharp";
import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import {
  destroyCloudinaryAsset,
  extractCloudinaryPublicId,
  isCloudinaryEnabled,
  uploadCloudinaryBuffer,
} from "../services/cloudinary.service.js";

fs.mkdirSync(env.uploadsPath, { recursive: true });

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function collectFileBuffer(file) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    file.stream.on("data", (chunk) => chunks.push(chunk));
    file.stream.on("error", reject);
    file.stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function compressImage(file, inputBuffer) {
  if (file.mimetype === "image/gif") {
    return {
      buffer: inputBuffer,
      extension: path.extname(file.originalname).toLowerCase() || ".gif",
      mimetype: file.mimetype,
    };
  }

  try {
    const outputBuffer = await sharp(inputBuffer, {
      failOn: "none",
    })
      .rotate()
      .resize({
        width: env.imageMaxWidth,
        withoutEnlargement: true,
        fit: "inside",
      })
      .webp({
        quality: env.imageWebpQuality,
        smartSubsample: true,
        effort: 5,
      })
      .toBuffer();

    return {
      buffer: outputBuffer,
      extension: ".webp",
      mimetype: "image/webp",
    };
  } catch (error) {
    if (env.nodeEnv === "test") {
      return {
        buffer: inputBuffer,
        extension: path.extname(file.originalname).toLowerCase() || ".bin",
        mimetype: file.mimetype,
      };
    }

    throw new HttpError(415, "The uploaded image could not be processed. Please choose a valid image file.");
  }
}

class GleencImageStorage {
  async _handleFile(req, file, callback) {
    try {
      const originalBuffer = await collectFileBuffer(file);
      const image = await compressImage(file, originalBuffer);
      const filename = `${Date.now()}-${nanoid(10)}${image.extension}`;

      if (isCloudinaryEnabled()) {
        const publicId = `${path.parse(filename).name}`;
        const result = await uploadCloudinaryBuffer(image.buffer, {
          folder: env.cloudinaryFolder,
          publicId,
          format: image.extension === ".webp" ? "webp" : undefined,
          tag: req.auth?.role || "upload",
        });

        callback(null, {
          filename,
          originalname: file.originalname,
          mimetype: image.mimetype,
          size: image.buffer.length,
          originalSize: originalBuffer.length,
          compressionRatio:
            originalBuffer.length > 0
              ? Number((image.buffer.length / originalBuffer.length).toFixed(4))
              : 1,
          storageProvider: "cloudinary",
          path: result.secure_url,
          url: result.secure_url,
          secure_url: result.secure_url,
          public_id: result.public_id,
          bytes: result.bytes,
          format: result.format,
          width: result.width,
          height: result.height,
        });
        return;
      }

      const target = path.join(env.uploadsPath, filename);
      await fs.promises.writeFile(target, image.buffer);

      callback(null, {
        filename,
        originalname: file.originalname,
        mimetype: image.mimetype,
        size: image.buffer.length,
        originalSize: originalBuffer.length,
        compressionRatio:
          originalBuffer.length > 0
            ? Number((image.buffer.length / originalBuffer.length).toFixed(4))
            : 1,
        storageProvider: "local",
        path: target,
      });
    } catch (error) {
      callback(error);
    }
  }

  _removeFile(_req, file, callback) {
    deleteUploadedFiles([file]);
    callback(null);
  }
}

export const upload = multer({
  storage: new GleencImageStorage(),
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

export function fileUrl(_req, file) {
  if (!file) return null;
  if (file.secure_url || file.url) return file.secure_url || file.url;
  return `/uploads/${file.filename}`;
}

export function deleteUploadedFiles(values) {
  for (const value of values.flat(Infinity).filter(Boolean)) {
    const source =
      typeof value === "string"
        ? value
        : value.secure_url ||
          value.url ||
          value.path ||
          value.filename ||
          "";

    const publicId =
      typeof value === "object" && value.public_id
        ? value.public_id
        : extractCloudinaryPublicId(source);

    if (publicId) {
      destroyCloudinaryAsset(publicId);
      continue;
    }

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
