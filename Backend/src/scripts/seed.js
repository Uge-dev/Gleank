import bcrypt from "bcryptjs";
import { db, transaction } from "../db/database.js";
import { createId, slugify } from "../lib/ids.js";

const email = "seller@gleank.local";
const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);

if (existing) {
  console.log("Demo seller already exists.");
  process.exit(0);
}

const now = new Date().toISOString();
const userId = createId("usr");
const storeId = createId("sto");
const passwordHash = await bcrypt.hash("Gleank123!", 12);

transaction(() => {
  db.prepare(`
    INSERT INTO users (
      id, name, email, password_hash, role, campus, phone,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'seller', 'FUPRE', '08000000000', ?, ?)
  `).run(userId, "Demo Seller", email, passwordHash, now, now);

  db.prepare(`
    INSERT INTO stores (
      id, owner_id, slug, name, description, campus, category, phone,
      status, verified, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'FUPRE', 'Campus Essentials', '08000000000',
      'active', 1, ?, ?)
  `).run(
    storeId,
    userId,
    slugify("Gleank Demo Store"),
    "Gleank Demo Store",
    "A ready-to-test campus store for local development.",
    now,
    now,
  );
});

console.log("Demo seller created.");
console.log("Email: seller@gleank.local");
console.log("Password: Gleank123!");
