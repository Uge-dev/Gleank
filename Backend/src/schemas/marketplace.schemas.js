import { z } from "zod";

const numberValue = (minimum = 0) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : Number(value)),
    z.number().finite().min(minimum),
  );

export const saveItemSchema = z.object({
  itemType: z.enum(["product", "store", "service", "used_listing"]),
  itemId: z.string().trim().min(2).max(120),
});

export const usedListingSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10).max(3_000),
  condition: z.enum([
    "Like New",
    "Very Good",
    "Good",
    "Fair",
    "Needs Repair",
  ]),
  price: numberValue(0),
  campus: z.string().trim().min(2).max(80),
  pickupLocation: z.string().trim().min(2).max(160),
  deliveryOption: z.enum(["Pickup", "Delivery", "Pickup & Delivery"]),
  serialNumber: z.string().trim().max(120).optional().default(""),
  reasonForSelling: z.string().trim().max(800).optional().default(""),
  defectsDisclosed: z.string().trim().max(1200).optional().default(""),
  confirmOwnership: z.union([z.literal("true"), z.literal(true)]).optional(),
  confirmOwnershipText: z.string().trim().max(300).optional().default(""),
});
