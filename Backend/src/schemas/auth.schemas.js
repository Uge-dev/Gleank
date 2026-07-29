import { z } from "zod";
import { validatePasswordStrength } from "../lib/password-policy.js";

const email = z
  .string()
  .trim()
  .email()
  .max(160)
  .transform((value) => value.toLowerCase());

const password = z
  .string()
  .min(8)
  .max(72)
  .superRefine((value, context) => {
    const policy = validatePasswordStrength(value);

    if (!policy.valid) {
      for (const issue of policy.issues) {
        context.addIssue({ code: "custom", message: issue });
      }
    }
  });

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email,
    password,
    role: z.enum(["buyer", "seller"]).default("buyer"),
    campus: z.string().trim().min(2).max(80),
    phone: z.string().trim().max(30).optional().default(""),
    storeName: z.string().trim().max(100).optional().default(""),
    vehicleType: z.string().trim().max(80).optional().default(""),
    vehiclePlate: z.string().trim().max(40).optional().default(""),
    coverageArea: z.string().trim().max(160).optional().default(""),
    homeAddress: z.string().trim().max(240).optional().default(""),
    transportType: z.string().trim().max(80).optional().default(""),
    maxPackageSize: z.string().trim().max(80).optional().default("small_medium"),
    maxWeightClass: z.string().trim().max(80).optional().default("up_to_medium"),
    fragileHandlingAbility: z.string().trim().max(100).optional().default("can_handle_fragile"),
    deliveryBagType: z.string().trim().max(100).optional().default("medium_delivery_bag"),
    gpsPermissionStatus: z.string().trim().max(80).optional().default("gps_disabled"),
    canReceiveAutoDispatch: z.coerce.boolean().optional().default(true),
  })
  .superRefine((value, context) => {
    if (value.role === "seller" && value.storeName.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["storeName"],
        message: "Store name is required for seller accounts.",
      });
    }

  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

export const verifyEmailSchema = z.object({
  token: z.string().trim().min(32).max(256),
});

export const forgotPasswordSchema = z.object({
  email,
  role: z.enum(["buyer", "seller", "rider"]).optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(32).max(256),
  password,
  role: z.enum(["buyer", "seller", "rider"]).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: password,
});

export const securityPasswordResetCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit verification code."),
});

export const securityPasswordResetCompleteSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit verification code."),
  newPassword: password,
});
