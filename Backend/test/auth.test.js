import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import request from "supertest";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const testRoot = path.join(backendRoot, "data/test");
fs.mkdirSync(testRoot, { recursive: true });
process.env.NODE_ENV = "test";
process.env.DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_PATH = "./data/test/gleank-test.sqlite";
process.env.UPLOADS_PATH = "./data/test/uploads";
process.env.STORAGE_PROVIDER = "local";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-gleank-tests";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.AUTO_VERIFY_AUTH = "true";
process.env.AUTO_ACTIVATE_SELLER_SUBSCRIPTION = "true";
process.env.AUTO_APPROVE_USED_LISTINGS = "true";
process.env.PAYMENT_PROVIDER = "local";
process.env.PAYSTACK_SECRET_KEY = "sk_test_1234567890123456789012345678901234567890";
process.env.DOJAH_WEBHOOK_SECRET = "test-dojah-webhook-secret";
process.env.EMAIL_PROVIDER = "";
process.env.BREVO_API_KEY = "";
process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.SMTP_FROM_EMAIL = "";

for (const databaseFile of [
  "gleank-test.sqlite",
  "gleank-test.sqlite-shm",
  "gleank-test.sqlite-wal",
]) {
  fs.rmSync(path.join(testRoot, databaseFile), { force: true });
}
fs.rmSync(path.join(testRoot, "uploads"), {
  recursive: true,
  force: true,
});

const { app } = await import("../src/app.js");
const { db } = await import("../src/db/database.js");
const { createId } = await import("../src/lib/ids.js");
const { env } = await import("../src/config/env.js");
async function createAdminAgent(email = "step2-admin@gleank.local", password = "AdminStepTwo123!") {
  const existing = db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(email.toLowerCase());
  if (!existing) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (
        id, name, email, password_hash, role, campus, phone,
        is_active, email_verified, email_verified_at, created_at, updated_at
      ) VALUES (?, 'Step 2 Admin', ?, ?, 'admin', '', '', 1, 1, ?, ?, ?)
    `).run(
      createId("adm"),
      email,
      await bcrypt.hash(password, 12),
      now,
      now,
      now,
    );
  }

  const agent = request.agent(app);
  const loginResponse = await agent
    .post("/api/admin/login")
    .send({ email, password });
  assert.equal(loginResponse.status, 200);
  return agent;
}

test("health endpoint responds", async () => {
  const response = await request(app).get("/api/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.status, "ok");
  assert.equal(response.body.fulfillmentModel, "seller-managed-buyer-confirmed-v1");
});


test("user can securely reset a forgotten password", async () => {
  const email = "password-reset@gleank.local";
  const originalPassword = "CampusMarket123!";
  const newPassword = "CampusMarket456!";

  const registerResponse = await request(app)
    .post("/api/auth/register")
    .send({
      name: "Password Reset User",
      email,
      password: originalPassword,
      role: "buyer",
      campus: "FUPRE",
    });

  assert.equal(registerResponse.status, 201);

  const recoveryResponse = await request(app)
    .post("/api/auth/forgot-password")
    .send({ email });

  assert.equal(recoveryResponse.status, 200);
  assert.ok(recoveryResponse.body.developmentToken);

  const resetResponse = await request(app)
    .post("/api/auth/reset-password")
    .send({
      token: recoveryResponse.body.developmentToken,
      password: newPassword,
    });

  assert.equal(resetResponse.status, 200);

  const oldLoginResponse = await request(app)
    .post("/api/auth/login")
    .send({ email, password: originalPassword });
  assert.equal(oldLoginResponse.status, 401);

  const newLoginResponse = await request(app)
    .post("/api/auth/login")
    .send({ email, password: newPassword });
  assert.equal(newLoginResponse.status, 200);

  const reusedTokenResponse = await request(app)
    .post("/api/auth/reset-password")
    .send({
      token: recoveryResponse.body.developmentToken,
      password: originalPassword,
    });
  assert.equal(reusedTokenResponse.status, 400);
});


test("critical webhook and admin fallback defaults are rejected", async () => {
  const corsResponse = await request(app)
    .get("/api/health")
    .set("Origin", "https://evil.example");
  assert.equal(corsResponse.status, 403);

  const adminLoginResponse = await request(app)
    .post("/api/admin/login")
    .send({ email: "admin@gleank.com", password: "admin12345" });
  assert.equal(adminLoginResponse.status, 401);

  const paystackWebhookResponse = await request(app)
    .post("/api/payments/webhook")
    .send({
      event: "charge.success",
      data: { reference: "missing-reference", status: "success" },
    });
  assert.equal(paystackWebhookResponse.status, 401);

  const dojahWebhookResponse = await request(app)
    .post("/api/webhooks/dojah")
    .set("x-dojah-signature", "bad-signature")
    .set("x-dojah-timestamp", String(Math.floor(Date.now() / 1000)))
    .set("x-dojah-event-id", "dojah-event-test")
    .send({
      event: "verification.completed",
      data: { reference: "missing-kyc-reference", status: "success" },
    });
  assert.equal(dojahWebhookResponse.status, 401);
});

test("admin and member sessions remain isolated with the unified account",async()=>{
 const admin=await createAdminAgent();
 assert.equal((await admin.get('/api/auth/me')).status,401);
 assert.equal((await admin.get('/api/commerce/orders')).status,401);
 const member=request.agent(app);
 await member.post('/api/auth/register').send({name:'Portal Member',email:'portal-member@gleank.local',password:'PortalMember123!'});
 assert.equal((await member.get('/api/admin/overview')).status,401);
 assert.equal((await member.get('/api/commerce/orders')).status,200);
});
