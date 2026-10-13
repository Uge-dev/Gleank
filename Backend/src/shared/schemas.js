import { z } from "zod";
import { identifier, money } from "./core.js";
const text = (n) => z.string().trim().max(n);
export const componentSchema = z
  .object({
    id: identifier,
    name: text(100).min(1),
    group: text(80).default("Items"),
    unit: text(60).min(1),
    unitDescription: text(180).default(""),
    priceKobo: money,
    stock: z.number().int().min(0).max(1000000),
    min: z.number().int().min(0).max(99).default(0),
    max: z.number().int().min(1).max(99).default(99),
    required: z.boolean().default(false),
    photoId: identifier.optional(),
  })
  .strict()
  .refine((x) => x.max >= x.min, "Maximum must be at least the minimum.");
export const orderingSchema = z
  .object({
    format: z
      .enum(["single", "fixed_pack", "menu", "pack_extras"])
      .default("single"),
    unit: text(60).min(1).default("piece"),
    unitDescription: text(200).default(""),
    groups: z.array(z.object({name:text(80).min(1),min:z.number().int().min(0).max(999),max:z.number().int().min(1).max(999)}).strict().refine(g=>g.max>=g.min)).max(30).default([]),
    packSize: z.number().int().min(1).max(1000).default(1),
    components: z.array(componentSchema).max(100).default([]),
    packagingKobo: money.default(0),
    preparationMinutes: z.number().int().min(0).max(86400).default(0),
    orderingHours: text(300).default(""),
    ingredients: text(2000).default(""),
    allergens: z.array(text(100)).max(30).default([]),
    pickup: z.boolean().default(true),
    delivery: z.boolean().default(true),
  })
  .strict()
  .superRefine((x, ctx) => {
    if (["menu", "pack_extras"].includes(x.format) && !x.components.length)
      ctx.addIssue({ code: "custom", message: "Add menu components." });
    if (new Set(x.components.map((c) => c.id)).size !== x.components.length)
      ctx.addIssue({
        code: "custom",
        message: "Component IDs must be unique.",
      });
  });
export const variantSchema = z
  .object({
    id: identifier,
    labels: z.record(z.string().max(60),text(100)).default({}),
    sku: text(100).default(""),
    size: text(60).default(""),
    color: text(60).default(""),
    colorHex: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    priceKobo: money.optional(),
    stock: z.number().int().min(0).max(1000000),
    photoIds: z.array(identifier).max(10).default([]),
  })
  .strict();
export const productSchema = z
  .object({
    name: text(160).min(2),
    description: text(6000).min(1),
    category: text(100).min(1),
    priceKobo: money,
    stock: z.number().int().min(0).max(1000000),
    kind: z.enum(["physical", "digital"]).default("physical"),
    presentation: z.enum(["image", "video"]).default("image"),
    mediaIds: z.array(identifier).max(10).default([]),
    posterId: identifier.optional(),
    fileIds: z.array(identifier).max(10).default([]),
    licence: text(2000).default("Personal use"),
    attributes: z.record(z.string().max(80), text(300)).default({}),
    variants: z.array(variantSchema).max(100).default([]),
    ordering: orderingSchema.default(() => orderingSchema.parse({})),
    catalogueId: identifier.optional(),
    offersEnabled: z.boolean().default(true),
    minimumOfferPercent: z.number().int().min(80).max(100).default(80),
    reshareEnabled: z.boolean().default(true),
    returnDays: z.number().int().min(0).max(30).default(7),
    deliveryKobo: money.optional(),
    publication: z.enum(["draft", "publish", "schedule"]).default("draft"),
    publishAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((x, ctx) => {
    if (Object.keys(x.attributes).length > 50)
      ctx.addIssue({
        code: "custom",
        message: "Use at most 50 product attributes.",
      });
    if (
      new Set(x.mediaIds).size !== x.mediaIds.length ||
      new Set(x.fileIds).size !== x.fileIds.length
    )
      ctx.addIssue({ code: "custom", message: "Attach each file once." });
    if (x.publication === "schedule" && !x.publishAt)
      ctx.addIssue({
        code: "custom",
        message: "Choose a scheduled publishing time.",
      });
    if (x.kind === "digital" && !x.fileIds.length)
      ctx.addIssue({
        code: "custom",
        message: "Attach at least one private digital file.",
      });
    if (
      x.kind === "digital" &&
      (x.ordering.format !== "single" || x.variants.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Digital licences use single-item ordering.",
      });
    if (new Set(x.variants.map((v) => v.id)).size !== x.variants.length)
      ctx.addIssue({ code: "custom", message: "Variant IDs must be unique." });
  });
export const selectionSchema = z
  .object({
    productId: identifier,
    quantity: z.number().int().min(1).max(99).default(1),
    variantId: identifier.optional(),
    components: z
      .array(
        z
          .object({ id: identifier, quantity: z.number().int().min(0).max(99) })
          .strict(),
      )
      .max(100)
      .default([]),
    postId: identifier.optional(),
    offerId: identifier.optional(),
  })
  .strict();
export const checkoutSchema = z
  .object({
    items: z.array(selectionSchema).min(1).max(50).optional(),
    cartLineIds: z.array(identifier).min(1).max(50).optional(),
    address: z
      .object({
        name: text(100).min(2),
        phone: text(30).min(7),
        address: text(500).min(5),
        city: text(100).min(2),
        state: text(100).min(2),
        country: text(80).default("Nigeria"),
      })
      .strict()
      .optional(),
    method: z.enum(["wallet", "paystack"]).default("paystack"),
    clientPlatform: z.enum(["web", "android", "ios"]).default("web"),
  })
  .strict()
  .refine(
    (x) => Boolean(x.items) !== Boolean(x.cartLineIds),
    "Choose instant checkout items or selected cart lines.",
  );
