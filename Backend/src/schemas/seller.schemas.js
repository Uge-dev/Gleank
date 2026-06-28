import { z } from "zod";

const numberValue = (minimum = 0) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : Number(value)),
    z.number().finite().min(minimum),
  );

const booleanValue = z.preprocess(
  (value) =>
    value === true ||
    value === "true" ||
    value === "on" ||
    value === "1",
  z.boolean(),
);

export const storeUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1_500).default(""),
  campus: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).default(""),
  status: z.enum(["active", "paused"]).default("active"),
});

export const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(3_000).default(""),
  price: numberValue(0),
  stock: numberValue(0).pipe(z.number().int()),
  status: z.enum(["draft", "active", "out_of_stock"]).default("draft"),
  isFeatured: booleanValue.optional().default(false),
  retainedImageUrls: z.string().optional().default("[]"),
});

export const serviceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().max(3_000).default(""),
  price: numberValue(0),
  durationMinutes: numberValue(1).pipe(z.number().int()),
  status: z.enum(["draft", "active", "paused"]).default("draft"),
  isFeatured: booleanValue.optional().default(false),
  retainedImageUrls: z.string().optional().default("[]"),
});
