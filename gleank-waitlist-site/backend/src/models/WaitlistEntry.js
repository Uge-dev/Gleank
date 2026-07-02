import mongoose from "mongoose";

const waitlistEntrySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
    },
    whatsapp: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },
    campus: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    userType: {
      type: String,
      enum: ["buyer", "seller", "service_provider", "rider"],
      default: "buyer",
      index: true,
    },
    source: {
      type: String,
      default: "landing_page",
      trim: true,
    },
    status: {
      type: String,
      enum: ["new", "contacted", "converted", "ignored"],
      default: "new",
      index: true,
    },
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 1000,
    },
    ipAddress: {
      type: String,
      default: "",
    },
    userAgent: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

waitlistEntrySchema.index({ createdAt: -1 });
waitlistEntrySchema.index({ campus: 1 });

export const WaitlistEntry = mongoose.model("WaitlistEntry", waitlistEntrySchema);
