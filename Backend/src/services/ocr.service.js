import { db } from "../db/database.js";
import { env } from "../config/env.js";
import { createId } from "../lib/ids.js";
import { scanListingContent } from "./payment-protection.service.js";

function nowIso() {
  return new Date().toISOString();
}

function clean(value, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

function insertOcrResult({ assetUrl, provider, status, extractedText = "", riskReasons = [], errorMessage = "" }) {
  const id = createId("ocr");
  db.prepare(`
    INSERT INTO ocr_results (
      id, asset_url, provider, status, extracted_text, risk_reasons,
      error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    clean(assetUrl, 800),
    provider,
    status,
    clean(extractedText, 5000),
    JSON.stringify(riskReasons || []),
    clean(errorMessage, 1000),
    nowIso(),
  );
  return db.prepare("SELECT * FROM ocr_results WHERE id = ?").get(id);
}

function serialize(row) {
  return {
    id: row.id,
    assetUrl: row.asset_url,
    provider: row.provider,
    status: row.status,
    extractedText: row.extracted_text || "",
    riskReasons: (() => {
      try {
        return JSON.parse(row.risk_reasons || "[]");
      } catch {
        return [];
      }
    })(),
    errorMessage: row.error_message || "",
    createdAt: row.created_at,
  };
}

export async function scanAssetText(assetUrl) {
  if (!env.enableOcrModeration || env.ocrProvider === "none") {
    return serialize(insertOcrResult({
      assetUrl,
      provider: env.ocrProvider,
      status: "skipped",
    }));
  }

  if (env.ocrProvider !== "tesseract") {
    return serialize(insertOcrResult({
      assetUrl,
      provider: env.ocrProvider,
      status: "review_required",
      errorMessage: "Configured OCR provider is not implemented yet.",
    }));
  }

  try {
    const tesseract = await import("tesseract.js");
    const result = await tesseract.recognize(assetUrl, "eng");
    const extractedText = clean(result?.data?.text || "", 5000);
    const scan = scanListingContent({ description: extractedText });

    return serialize(insertOcrResult({
      assetUrl,
      provider: "tesseract",
      status: "completed",
      extractedText,
      riskReasons: scan.reasons || [],
    }));
  } catch (error) {
    return serialize(insertOcrResult({
      assetUrl,
      provider: "tesseract",
      status: "review_required",
      errorMessage: error?.message || "OCR could not run.",
    }));
  }
}

export async function scanUploadedImagesForModeration(files = []) {
  const images = (Array.isArray(files) ? files : [])
    .filter((file) => Buffer.isBuffer(file?.moderationBuffer))
    .slice(0, 10);

  if (!images.length || !env.enableOcrModeration || env.ocrProvider === "none") {
    return {
      status: "skipped",
      flagged: false,
      reviewRequired: env.isProduction,
      extractedText: "",
      reasons: [],
      resultIds: [],
    };
  }

  if (env.ocrProvider !== "tesseract") {
    return {
      status: "provider_unavailable",
      flagged: false,
      reviewRequired: true,
      extractedText: "",
      reasons: [],
      resultIds: [],
    };
  }

  let tesseract;

  try {
    tesseract = await import("tesseract.js");
  } catch {
    return {
      status: "provider_unavailable",
      flagged: false,
      reviewRequired: true,
      extractedText: "",
      reasons: [],
      resultIds: [],
    };
  }
  const textParts = [];
  const reasons = [];
  const resultIds = [];
  let failed = false;

  for (const file of images) {
    const assetUrl = file.url || file.path || file.filename || "uploaded-image";

    try {
      const result = await tesseract.recognize(file.moderationBuffer, "eng");
      const extractedText = clean(result?.data?.text || "", 5000);
      const scan = scanListingContent({ description: extractedText });
      const row = insertOcrResult({
        assetUrl,
        provider: "tesseract",
        status: "completed",
        extractedText,
        riskReasons: scan.reasons || [],
      });

      resultIds.push(row.id);
      if (extractedText) textParts.push(extractedText);
      if (scan.flagged) reasons.push(...(scan.reasons || []));
    } catch (error) {
      failed = true;
      const row = insertOcrResult({
        assetUrl,
        provider: "tesseract",
        status: "review_required",
        errorMessage: error?.message || "OCR could not run.",
      });
      resultIds.push(row.id);
    }
  }

  return {
    status: failed ? "partial" : "completed",
    flagged: reasons.length > 0,
    reviewRequired: failed,
    extractedText: clean(textParts.join("\n"), 5000),
    reasons: Array.from(new Set(reasons)),
    resultIds,
  };
}
