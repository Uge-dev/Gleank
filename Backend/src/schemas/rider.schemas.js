import { z } from "zod";
import { validatePasswordStrength } from "../lib/password-policy.js";

const email = z.string().trim().email().max(160).transform((value) => value.toLowerCase());

const password = z.string().min(8).max(72).superRefine((value, context) => {
  const policy = validatePasswordStrength(value);
  if (!policy.valid) {
    for (const issue of policy.issues) {
      context.addIssue({ code: "custom", message: issue });
    }
  }
});

const coordinate = z.preprocess((value) => {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}, z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  accuracyMeters: z.coerce.number().min(0).max(10000).optional().default(0),
}));

const uploadedFileUrl = z.string().trim().min(1).max(500).refine(
  (value) => /^https?:\/\//i.test(value) || value.startsWith("/uploads/"),
  "Upload a valid image file.",
);

const optionalUploadedFileUrl = z.union([uploadedFileUrl, z.literal("")]).optional().default("");

export const riderRegisterSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  password,
  phone: z.string().trim().min(6).max(30),
  whatsappPhone: z.string().trim().max(30).optional().default(""),
  campus: z.string().trim().max(80).optional().default("General"),
  vehicleType: z.string().trim().max(80).optional().default(""),
  vehiclePlate: z.string().trim().max(40).optional().default(""),
  coverageArea: z.string().trim().max(160).optional().default(""),
  homeAddress: z.string().trim().max(240).optional().default(""),
  transportType: z.string().trim().max(60).optional().default("motorcycle"),
  maxPackageSize: z.string().trim().max(60).optional().default("small_medium"),
  maxWeightClass: z.string().trim().max(60).optional().default("up_to_medium"),
  fragileHandlingAbility: z.string().trim().max(80).optional().default("can_handle_fragile"),
  deliveryBagType: z.string().trim().max(80).optional().default("medium_delivery_bag"),
  gpsPermissionStatus: z.string().trim().max(80).optional().default("gps_disabled"),
  canReceiveAutoDispatch: z.coerce.boolean().optional().default(true),
  emergencyContactName: z.string().trim().max(100).optional().default(""),
  emergencyContactPhone: z.string().trim().max(30).optional().default(""),
  guarantorName: z.string().trim().max(100).optional().default(""),
  guarantorPhone: z.string().trim().max(30).optional().default(""),
  identityDocumentUrl: uploadedFileUrl,
  selfieUrl: uploadedFileUrl,
  ninLast4: z.string().trim().regex(/^\d{0,4}$/).optional().default(""),
});

export const riderDocumentUploadSchema = z.object({
  identityDocumentUrl: uploadedFileUrl,
  selfieUrl: uploadedFileUrl,
});

export const riderLoginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

export const riderAvailabilitySchema = z.object({
  availability: z.enum(["offline", "online", "busy"]),
  currentLocation: coordinate.optional(),
});

export const riderLocationSchema = z.object({
  assignmentId: z.string().trim().max(140).optional().default(""),
  currentLocation: coordinate,
});

export const routeEstimateQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  target: z.enum(["pickup", "delivery"]).default("pickup"),
});

export const createRiderAssignmentSchema = z.object({
  orderId: z.string().trim().min(2).max(140),
  orderType: z.enum(["store_order", "used_order"]).default("store_order"),
  riderId: z.string().trim().min(2).max(140),
  pickupPoint: z.object({
    address: z.string().trim().min(2).max(260),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  }).optional(),
  deliveryPoint: z.object({
    address: z.string().trim().min(2).max(260),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  }).optional(),
  sellerName: z.string().trim().max(120).optional().default(""),
  sellerPhone: z.string().trim().max(30).optional().default(""),
  sellerWhatsApp: z.string().trim().max(30).optional().default(""),
  buyerName: z.string().trim().max(120).optional().default(""),
  buyerPhone: z.string().trim().max(30).optional().default(""),
  packageSummary: z.string().trim().max(500).optional().default(""),
  category: z.string().trim().max(120).optional().default(""),
  packageType: z.string().trim().max(120).optional().default(""),
  packageTags: z.array(z.string().trim().max(80)).max(12).optional().default([]),
  isHeavyFragile: z.coerce.boolean().optional().default(false),
  packageValueKobo: z.coerce.number().int().min(0).optional().default(0),
  deliveryFeeKobo: z.coerce.number().int().min(0).optional().default(0),
});

export const riderPickupSchema = z.object({
  sellerPickupCode: z.string().trim().regex(/^\d{4,8}$/, "Enter the seller pickup OTP."),
  proofUrl: optionalUploadedFileUrl,
  proofFileName: z.string().trim().min(1, "Upload pickup proof photo.").max(240),
  proofNote: z.string().trim().max(500).optional().default(""),
  locationLabel: z.string().trim().max(240).optional().default(""),
  proofLocation: coordinate,
});

export const riderCompleteDeliverySchema = z.object({
  customerDeliveryCode: z.string().trim().regex(/^\d{4,8}$/, "Enter the buyer delivery OTP.").optional().default(""),
  proofUrl: optionalUploadedFileUrl,
  proofFileName: z.string().trim().min(1, "Upload delivery proof photo.").max(240),
  proofNote: z.string().trim().max(500).optional().default(""),
  locationLabel: z.string().trim().max(240).optional().default(""),
  proofLocation: coordinate,
});

export const riderVerifyDeliveryCodeSchema = z.object({
  customerDeliveryCode: z.string().trim().regex(/^\d{4,8}$/, "Enter the buyer delivery OTP.").optional(),
  code: z.string().trim().regex(/^\d{4,8}$/, "Enter the buyer delivery OTP.").optional(),
}).refine((value) => value.customerDeliveryCode || value.code, {
  message: "Enter the buyer delivery OTP.",
  path: ["customerDeliveryCode"],
});

export const riderFailSchema = z.object({
  note: z.string().trim().min(2).max(500),
  currentLocation: coordinate.optional(),
});

export const riderSecurityReportSchema = z.object({
  type: z.enum([
    "buyer_issue",
    "seller_issue",
    "package_issue",
    "safety_threat",
    "threat",
    "accident",
    "payment_issue",
    "general",
    "other",
  ]).default("general"),
  note: z.string().trim().min(2).max(1000),
  assignmentId: z.string().trim().max(140).optional().default(""),
  orderId: z.string().trim().max(140).optional().default(""),
  location: coordinate.optional(),
});

export const riderContactAuditSchema = z.object({
  contactType: z.enum(["call", "whatsapp"]),
  contactTarget: z.enum(["seller", "buyer", "support"]).default("seller"),
});

export const riderAdminVerificationSchema = z.object({
  verificationStatus: z.enum(["draft", "pending_review", "verified", "rejected", "suspended"]),
  verificationNote: z.string().trim().max(500).optional().default(""),
  verificationLevel: z.coerce.number().int().min(1).max(3).optional(),
  maxPackageValueKobo: z.coerce.number().int().min(0).optional(),
  safetyStatus: z.enum(["normal", "flagged", "suspended"]).optional(),
});
