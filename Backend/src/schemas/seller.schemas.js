import { z } from "zod";

const numberValue = (minimum = 0) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : Number(value)),
    z.number().finite().min(minimum),
  );

const optionalNumberValue = (minimum = 0) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : Number(value)),
    z.number().finite().min(minimum).optional(),
  );

const optionalCoordinateValue = z.preprocess(
  (value) => (value === "" || value === undefined || value === null ? undefined : Number(value)),
  z.number().finite().optional(),
);

const booleanValue = z.preprocess(
  (value) =>
    value === true ||
    value === "true" ||
    value === "on" ||
    value === "1",
  z.boolean(),
);

const sellerTypeSchema = z
  .enum(["used_market", "campus", "local_market", "nearby"])
  .default("campus");

const availabilitySchema = z
  .enum([
    "available_now",
    "confirm_before_payment",
    "out_of_stock",
    "price_updated",
    "substitute_available",
  ])
  .default("available_now");

const returnPolicySchema = z
  .enum(["standard", "limited", "final_sale"])
  .default("standard");

export const storeUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1_500).default(""),
  campus: z.string().trim().max(80).default(""),
  category: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).default(""),
  sellerType: sellerTypeSchema,
  operatingHours: z.string().trim().max(160).optional().default(""),
  whatsappPhone: z.string().trim().max(30).optional().default(""),
  allowRiderWhatsAppContact: booleanValue.optional().default(true),
  locationArea: z.string().trim().max(160).optional().default(""),
  pickupLocation: z.string().trim().max(180).optional().default(""),
  nearestLandmark: z.string().trim().max(160).optional().default(""),
  marketId: z.string().trim().max(140).optional().default(""),
  shopStallNumber: z.string().trim().max(80).optional().default(""),
  shopSection: z.string().trim().max(120).optional().default(""),
  pickupLat: optionalCoordinateValue,
  pickupLng: optionalCoordinateValue,
  status: z.enum(["active", "paused"]).default("active"),
});

export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(3_000).default(""),
  price: numberValue(0),
  stock: numberValue(0).pipe(z.number().int()),
  status: z.enum(["draft", "active", "out_of_stock"]).default("draft"),
  availabilityStatus: availabilitySchema,
  returnPolicy: returnPolicySchema,
  isFeatured: booleanValue.optional().default(false),
  retainedImageUrls: z.string().optional().default("[]"),
});

export const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  serviceType: z.string().trim().max(80).optional().default(""),
  location: z.string().trim().max(120).optional().default(""),
  description: z.string().trim().max(3_000).default(""),
  price: numberValue(0),
  minPrice: optionalNumberValue(0).default(0),
  maxPrice: optionalNumberValue(0).default(0),
  durationMinutes: numberValue(1).pipe(z.number().int()),
  status: z.enum(["draft", "active", "paused"]).default("draft"),
  availabilityStatus: availabilitySchema,
  returnPolicy: returnPolicySchema,
  isFeatured: booleanValue.optional().default(false),
  retainedImageUrls: z.string().optional().default("[]"),
});
