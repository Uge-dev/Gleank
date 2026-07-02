import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

let configured = false;

export function isCloudinaryEnabled() {
  return env.storageProvider === "cloudinary";
}

export function configureCloudinary() {
  if (!isCloudinaryEnabled() || configured) return;

  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
    secure: true,
  });

  configured = true;
}

export function uploadCloudinaryBuffer(buffer, options = {}) {
  configureCloudinary();

  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        folder: options.folder || env.cloudinaryFolder,
        public_id: options.publicId,
        resource_type: "image",
        overwrite: false,
        use_filename: false,
        unique_filename: true,
        format: options.format,
        tags: ["gleank", options.tag].filter(Boolean),
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(result);
      },
    );

    upload.end(buffer);
  });
}

export function destroyCloudinaryAsset(publicId) {
  if (!isCloudinaryEnabled() || !publicId) return;

  configureCloudinary();

  cloudinary.uploader.destroy(publicId).catch((error) => {
    console.error("Cloudinary delete failed:", error.message);
  });
}

export function extractCloudinaryPublicId(value) {
  if (!value || typeof value !== "string") return "";

  if (!value.includes("res.cloudinary.com") && !value.includes(env.cloudinaryFolder)) {
    return "";
  }

  try {
    const url = value.startsWith("http") ? new URL(value) : null;
    const pathname = url ? url.pathname : value;
    const uploadMarker = "/upload/";
    const markerIndex = pathname.indexOf(uploadMarker);
    const afterUpload =
      markerIndex >= 0
        ? pathname.slice(markerIndex + uploadMarker.length)
        : pathname.replace(/^\/+/, "");
    const withoutTransform = afterUpload.replace(/^v\d+\//, "");
    const withoutExtension = withoutTransform.replace(/\.[a-z0-9]+$/i, "");

    return decodeURIComponent(withoutExtension);
  } catch {
    return "";
  }
}
