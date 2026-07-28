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

const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const allowedDocumentTypes = new Set([
  ...allowedImageTypes,
  "application/pdf",
]);
const documentFieldNames = new Set([
  "identityDocument",
  "businessDocument",
  "vehicleDocument",
  "identityProof",
  "documents",
]);

function normalizedCloudinaryFolder(req, file) {
  const root = env.cloudinaryFolder.replace(/\/+$/, "") || "gleenc";
  const field = file.fieldname || "";
  const url = req.originalUrl || "";

  if (["logo", "avatar", "profilePhoto"].includes(field)) return `${root}/profiles`;
  if (field === "cover") return `${root}/covers`;
  if (["selfie", "faceImage"].includes(field)) return `${root}/kyc/selfies`;
  if (documentFieldNames.has(field)) return `${root}/kyc/documents`;
  if (field.includes("proof") || url.includes("/complete") || url.includes("/pickup")) {
    return `${root}/delivery/proofs`;
  }
  if (url.includes("/services")) return `${root}/services`;
  if (url.includes("/used-market")) return `${root}/used-market`;
  return `${root}/products`;
}

function isDocumentUpload(file) {
  return documentFieldNames.has(file.fieldname || "");
}

function detectFileType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimetype: "image/jpeg", extension: ".jpg", resourceType: "image" };
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimetype: "image/png", extension: ".png", resourceType: "image" };
  }

  if (
    buffer.length >= 12 &&
    buffer.slice(0, 4).toString("ascii") === "RIFF" &&
    buffer.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    return { mimetype: "image/webp", extension: ".webp", resourceType: "image" };
  }

  if (buffer.slice(0, 4).toString("ascii") === "%PDF") {
    return { mimetype: "application/pdf", extension: ".pdf", resourceType: "raw" };
  }

  if (
    buffer.slice(0, 6).toString("ascii") === "GIF87a" ||
    buffer.slice(0, 6).toString("ascii") === "GIF89a"
  ) {
    return { mimetype: "image/gif", extension: ".gif", resourceType: "image" };
  }

  return null;
}

function assertSafeDetectedFile(file, buffer) {
  const detected = detectFileType(buffer);
  const allowedTypes = isDocumentUpload(file) ? allowedDocumentTypes : allowedImageTypes;

  if (!detected || !allowedTypes.has(detected.mimetype)) {
    throw new HttpError(
      415,
      isDocumentUpload(file)
        ? "Only JPEG, PNG, WebP, and PDF files are allowed for verification documents."
        : "Only JPEG, PNG, and WebP images are allowed.",
    );
  }

  if (detected.mimetype === "image/gif") {
    throw new HttpError(415, "GIF uploads are not accepted. Please upload a JPEG, PNG, or WebP image.");
  }

  if (detected.mimetype === "application/pdf") {
    const preview = buffer.slice(0, Math.min(buffer.length, 500_000)).toString("latin1");
    if (/\/(?:JavaScript|JS|OpenAction|AA)\b/i.test(preview)) {
      throw new HttpError(415, "This PDF contains active content and cannot be uploaded.");
    }
  }

  return detected;
}

function collectFileBuffer(file) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    file.stream.on("data", (chunk) => chunks.push(chunk));
    file.stream.on("error", reject);
    file.stream.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function compressImage(file, inputBuffer) {
  if (file.mimetype === "application/pdf") {
    return {
      buffer: inputBuffer,
      extension: ".pdf",
      mimetype: file.mimetype,
      resourceType: "raw",
    };
  }

  if (file.mimetype === "image/gif") {
    return {
      buffer: inputBuffer,
      extension: path.extname(file.originalname).toLowerCase() || ".gif",
      mimetype: file.mimetype,
      resourceType: "image",
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
      resourceType: "image",
    };
  } catch (error) {
    if (env.nodeEnv === "test") {
      return {
        buffer: inputBuffer,
        extension: path.extname(file.originalname).toLowerCase() || ".bin",
        mimetype: file.mimetype,
        resourceType: file.mimetype === "application/pdf" ? "raw" : "image",
      };
    }

    throw new HttpError(415, "The uploaded image could not be processed. Please choose a valid image file.");
  }
}

class GleencImageStorage {
  async _handleFile(req, file, callback) {
    try {
      const originalBuffer = await collectFileBuffer(file);
      const detected = assertSafeDetectedFile(file, originalBuffer);
      const safeFile = { ...file, mimetype: detected.mimetype };
      const image = await compressImage(safeFile, originalBuffer);
      const filename = `${Date.now()}-${nanoid(10)}${image.extension}`;

      if (isCloudinaryEnabled()) {
        const publicId = `${path.parse(filename).name}`;
        let result;

        try {
          result = await uploadCloudinaryBuffer(image.buffer, {
            folder: normalizedCloudinaryFolder(req, file),
            publicId,
            resourceType: image.resourceType || "image",
            format: image.extension === ".webp" ? "webp" : undefined,
            tag: req.auth?.role || "upload",
          });
        } catch {
          throw new HttpError(
            503,
            "The upload service could not save this file right now. Please try again.",
          );
        }

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
          moderationBuffer: image.buffer,
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
        moderationBuffer: image.buffer,
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
    const allowedTypes = isDocumentUpload(file) ? allowedDocumentTypes : allowedImageTypes;

    if (!allowedTypes.has(file.mimetype)) {
      callback(new HttpError(
        415,
        isDocumentUpload(file)
            ? "Only JPEG, PNG, WebP, and PDF files are allowed for verification documents."
          : "Only JPEG, PNG, and WebP images are allowed.",
      ));
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
