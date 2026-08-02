import { HttpError } from "../lib/http-error.js";

function asSizeList(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to the comma-separated form used by older records.
    }

    return value.split(",");
  }

  return [];
}

export function normalizeAvailableSizes(value) {
  return Array.from(
    new Set(
      asSizeList(value)
        .map((size) => String(size || "").trim())
        .filter(Boolean)
        .slice(0, 30),
    ),
  );
}

export function validateSelectedSize(product, selectedSize = "") {
  const availableSizes = normalizeAvailableSizes(
    product?.available_sizes ?? product?.availableSizes,
  );
  const normalizedSelectedSize = String(selectedSize || "").trim();

  if (!availableSizes.length) return "";

  if (!normalizedSelectedSize) {
    throw new HttpError(
      422,
      "Choose an available size before adding this product to your cart.",
    );
  }

  if (!availableSizes.includes(normalizedSelectedSize)) {
    throw new HttpError(409, "That size is no longer available for this product.");
  }

  return normalizedSelectedSize;
}
