import multer from "multer";
import { HttpError } from "../lib/http-error.js";
import { deleteUploadedFiles } from "./upload.js";

export function notFoundHandler(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.path}`));
}

export function errorHandler(error, req, res, _next) {
  const files = Array.isArray(req.files)
    ? req.files
    : Object.values(req.files || {}).flat();
  deleteUploadedFiles(files);

  if (error instanceof multer.MulterError) {
    res.status(422).json({
      error: {
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "One of the selected images is too large."
            : error.message,
      },
    });
    return;
  }

  const status = error.status || 500;

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    error: {
      message: error.message || "Something went wrong.",
      details: error.details,
    },
  });
}
