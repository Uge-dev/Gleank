import { ZodError } from 'zod';
import multer from "multer";
import { HttpError } from "../lib/http-error.js";
import { safeErrorMessage, shouldLogTechnicalError } from "../lib/safe-error-message.js";
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
    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? "One of the selected images is too large."
        : safeErrorMessage(error, {
            status: 422,
            fallback: "One of the selected files could not be uploaded. Please check the file and try again.",
          });
    res.status(422).json({
      success: false,
      message,
      code: error.code || "UPLOAD_ERROR",
      error: {
        message,
      },
    });
    return;
  }

  if(error instanceof ZodError) return res.status(422).json({message:error.issues[0]?.message || "Check the submitted details."});
  const status = error.status || 500;

  if (shouldLogTechnicalError(error, status)) {
    console.error(error);
  }

  const message = safeErrorMessage(error, { status });

  res.status(status).json({
    success: false,
    message,
    code: error.code || (status >= 500 ? "SERVER_ERROR" : "REQUEST_ERROR"),
    error: {
      message,
      details: error.details,
    },
  });
}
