import { z } from "zod";
import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import { createId, slugify } from "../lib/ids.js";
import {
  createStore,
  findStoreByOwnerId,
} from "../repositories/store.repository.js";
const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,30}$/, "Use 3–30 letters, numbers or underscores."),
  displayName: z.string().trim().max(80).default(""),
  bio: z.string().trim().max(240).default(""),
  country: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  activities: z
    .array(z.enum(["selling", "dropshipping", "marketing"]))
    .max(3)
    .default([]),
  interests: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
});
export function getAccountProfile(userId) {
  const row = db
    .prepare("SELECT * FROM account_profiles WHERE user_id = ?")
    .get(userId);
  return row
    ? {
        username: row.username,
        displayName: row.display_name,
        bio: row.bio,
        activities: JSON.parse(row.activities),
        interests: JSON.parse(row.interests),
        completedAt: row.completed_at,
      }
    : null;
}
export function completeAccountProfile(userId, body) {
  const input = profileSchema.parse(body);
  const taken = db
    .prepare("SELECT user_id FROM account_profiles WHERE username = ?")
    .get(input.username);
  if (taken && taken.user_id !== userId)
    throw new HttpError(409, "That username is already in use.");
  const now = new Date().toISOString();
  transaction(() => {
    db.prepare(
      `INSERT INTO account_profiles (user_id,username,display_name,bio,activities,interests,completed_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,
    display_name=excluded.display_name,bio=excluded.bio,activities=excluded.activities,interests=excluded.interests,updated_at=excluded.updated_at`,
    ).run(
      userId,
      input.username,
      input.displayName || input.name,
      input.bio,
      JSON.stringify([...new Set(input.activities)]),
      JSON.stringify([...new Set(input.interests)]),
      now,
      now,
    );
    db.prepare(
      "UPDATE users SET name=?,country=?,state=?,city=?,updated_at=? WHERE id=?",
    ).run(input.name, input.country, input.state, input.city, now, userId);
  });
  return getAccountProfile(userId);
}
export function saveFulfillmentSettings(userId, body) {
  const input = z
    .object({
      name: z.string().trim().min(2).max(100),
      coverage: z.string().trim().min(2).max(300),
      deliveryFee: z.coerce.number().finite().min(0).max(1000000),
      deliveryDays: z.coerce.number().int().min(1).max(60),
      dispatchAddress: z.string().trim().min(5).max(300),
      phone: z.string().trim().min(7).max(30),
    })
    .parse(body);
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if (!user || !["buyer", "seller"].includes(user.role))
    throw new HttpError(403, "Use your personal account.");
  if (!getAccountProfile(userId))
    throw new HttpError(422, "Complete your profile first.");
  const now = new Date().toISOString();
  transaction(() => {
    if (!findStoreByOwnerId(userId))
      createStore({
        id: createId("sto"),
        ownerId: userId,
        slug: slugify(input.name) + "-" + createId("s").slice(-8),
        name: input.name,
        description: "",
        campus: user.city || "",
        category: "General",
        phone: input.phone,
        pickupLocation: input.dispatchAddress,
        country: user.country,
        state: user.state,
        city: user.city,
        status: "active",
        verified: false,
        createdAt: now,
        updatedAt: now,
      });
    // Legacy role remains a storage compatibility detail, never a second identity/portal.
    db.prepare(
      "UPDATE users SET role='seller',phone=?,updated_at=? WHERE id=?",
    ).run(input.phone, now, userId);
    db.prepare(
      "UPDATE stores SET name=?,phone=?,pickup_location=?,updated_at=? WHERE owner_id=?",
    ).run(input.name, input.phone, input.dispatchAddress, now, userId);
    db.prepare(
      `INSERT INTO seller_fulfillment_settings (user_id,coverage,delivery_fee_kobo,delivery_days,dispatch_address,phone,updated_at)
   VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET coverage=excluded.coverage,delivery_fee_kobo=excluded.delivery_fee_kobo,
   delivery_days=excluded.delivery_days,dispatch_address=excluded.dispatch_address,phone=excluded.phone,updated_at=excluded.updated_at`,
    ).run(
      userId,
      input.coverage,
      Math.round(input.deliveryFee * 100),
      input.deliveryDays,
      input.dispatchAddress,
      input.phone,
      now,
    );
  });
  return getFulfillmentSettings(userId);
}
export function getFulfillmentSettings(userId) {
  const row = db
    .prepare("SELECT * FROM seller_fulfillment_settings WHERE user_id=?")
    .get(userId);
  return row
    ? {
        name: findStoreByOwnerId(userId)?.name || "",
        coverage: row.coverage,
        deliveryFee: row.delivery_fee_kobo / 100,
        deliveryDays: row.delivery_days,
        dispatchAddress: row.dispatch_address,
        phone: row.phone,
      }
    : null;
}
