import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import request from "supertest";
import crypto from "node:crypto";
process.env.NODE_ENV = "test";
process.env.DATABASE_PROVIDER = "sqlite";
process.env.DATABASE_PATH = "./data/test/commerce.sqlite";
process.env.STORAGE_PROVIDER = "local";
process.env.JWT_SECRET =
  "commerce-test-secret-at-least-forty-eight-characters-long";
process.env.AUTO_VERIFY_AUTH = "true";
process.env.PAYMENT_PROVIDER = "local";
process.env.EMAIL_PROVIDER = "";
process.env.SMTP_HOST = "";
process.env.BREVO_API_KEY = "";
process.env.PAYSTACK_SECRET_KEY = "sk_test_commerce";
for (const suffix of ["", "-wal", "-shm"])
  fs.rmSync("./data/test/commerce.sqlite" + suffix, { force: true });
const { app } = await import("../src/app.js");
const { db } = await import("../src/db/database.js");
const { createProduct } = await import("../src/services/listing.service.js");
const { productSchema } = await import("../src/schemas/seller.schemas.js");
const { adminUpdatePayout } = await import("../src/services/payout.service.js");
const { applyTransfer, settlePayout } =
  await import("../src/services/settlement.service.js");
const { env } = await import("../src/config/env.js");
const seller = request.agent(app),
  buyer = request.agent(app),
  stranger = request.agent(app);
let sellerId, buyerId, productId, secondProductId, orderId, labels;
const profile = (username) => ({
  name: "Commerce User",
  username,
  country: "Nigeria",
  state: "Delta",
  city: "Warri",
  activities: ["selling", "dropshipping", "marketing"],
  interests: ["Electronics"],
});
const orderBody = () => ({
  buyerName: "Buyer",
  buyerPhone: "08012345678",
  campus: "Warri",
  deliveryOption: "Delivery",
  deliveryAddress: "12 Test Street, Warri",
  paymentMethod: "pay_now",
  items: [
    { productId, quantity: 1 },
    { productId: secondProductId, quantity: 1 },
  ],
});
async function createPaidOrder() {
  const r = await buyer.post("/api/orders").send(orderBody());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const id = r.body.orders[0].id;
  const payment = await buyer
    .post("/api/payments/initialize")
    .send({ purpose: "store_order", targetId: id });
  assert.equal(payment.status, 201, JSON.stringify(payment.body));
  const verify = await buyer
    .post("/api/payments/verify")
    .send({ reference: payment.body.payment.reference });
  assert.equal(verify.status, 200, JSON.stringify(verify.body));
  return id;
}
test("signup uses one account and defers selling setup; rejects privilege escalation", async () => {
  for (const [agent, email] of [
    [seller, "seller@commerce.test"],
    [buyer, "buyer@commerce.test"],
    [stranger, "stranger@commerce.test"],
  ]) {
    const r = await agent.post("/api/auth/register").send({
      name: "Commerce User",
      email,
      password: "Commerce123!",
      role: "seller",
      storeName: "Ignored",
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.user.role, "buyer");
    assert.equal(r.body.store, null);
    assert.equal(r.body.user.profile, null);
    if (agent === seller) sellerId = r.body.user.id;
    if (agent === buyer) buyerId = r.body.user.id;
  }
  assert.equal(
    (
      await request(app).post("/api/auth/register").send({
        name: "Bad Admin",
        email: "admin@commerce.test",
        password: "Commerce123!",
        role: "admin",
      })
    ).status,
    422,
  );
});
test("onboarding validates unique username and retains multiple activities", async () => {
  assert.equal(
    (await seller.put("/api/commerce/profile").send(profile("merchant")))
      .status,
    200,
  );
  assert.equal(
    (await buyer.put("/api/commerce/profile").send(profile("merchant"))).status,
    409,
  );
  assert.equal(
    (await buyer.put("/api/commerce/profile").send(profile("shopper"))).status,
    200,
  );
  assert.equal(
    (await stranger.put("/api/commerce/profile").send(profile("outsider")))
      .status,
    200,
  );
  const r = await seller.get("/api/auth/me");
  assert.deepEqual(r.body.user.profile.activities, [
    "selling",
    "dropshipping",
    "marketing",
  ]);
  assert.equal(
    (
      await buyer
        .put("/api/commerce/profile")
        .send({ ...profile("x"), city: "" })
    ).status,
    422,
  );
});
test("selling is enabled within the same identity without a second login", async () => {
  const r = await seller.put("/api/commerce/selling").send({
    name: "Commerce Store",
    coverage: "Delta state",
    deliveryFee: 1500,
    deliveryDays: 3,
    dispatchAddress: "9 Seller Road",
    phone: "08012345678",
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const session = await seller.get("/api/auth/me");
  assert.equal(session.body.user.id, sellerId);
  assert.ok(session.body.store);
  assert.equal((await buyer.get("/api/seller/workspace")).status, 403);
  db.prepare(
    "UPDATE stores SET verified=1,verification_status='verified' WHERE owner_id=?",
  ).run(sellerId);
  for (const name of ["Test headset", "Test charger"]) {
    const product = createProduct(
      sellerId,
      productSchema.parse({
        name,
        category: "Electronics",
        description: "A good electronic device for daily use.",
        price: 10000,
        stock: 20,
        status: "active",
      }),
      ["/uploads/product.webp"],
    );
    db.prepare(
      "UPDATE products SET status='active',moderation_status='approved' WHERE id=?",
    ).run(product.id);
    if (!productId) productId = product.id;
    else secondProductId = product.id;
  }
});
test("retired rider and marketplace APIs cannot accept new activity", async () => {
  for (const url of [
    "/api/rider/auth/register",
    "/api/used-market",
    "/api/used-orders",
    "/api/market/local",
  ])
    assert.equal((await buyer.post(url).send({})).status, 404);
  assert.equal(
    (await seller.post("/api/seller/markets/join").send({})).status,
    410,
  );
  assert.equal(
    (
      await buyer
        .post("/api/payments/pay-at-delivery/initialize")
        .send({ orderId: "x" })
    ).status,
    410,
  );
});
test("checkout rejects payment on delivery and quotes seller-managed delivery", async () => {
  assert.equal(
    (
      await buyer
        .post("/api/orders")
        .send({ ...orderBody(), paymentMethod: "pay_on_delivery" })
    ).status,
    422,
  );
  const quote = await buyer
    .post("/api/commerce/quote")
    .send({ items: orderBody().items });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.sellers[0].deliveryFeeKobo, 150000);
  const r = await buyer.post("/api/orders").send(orderBody());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  orderId = r.body.orders[0].id;
  assert.equal(
    (await seller.post(`/api/commerce/orders/${orderId}/packages`)).status,
    422,
  );
});
test("platform payment creates a held payout and never creates rider dispatches", async () => {
  orderId = await createPaidOrder();
  const payout = db
    .prepare("SELECT * FROM payouts WHERE order_id=?")
    .get(orderId);
  assert.equal(payout.status, "on_hold");
  assert.equal(payout.seller_amount_kobo, 2150000);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) AS n FROM rider_assignments WHERE order_id=?")
      .get(orderId).n,
    0,
  );
});
test("only owner can generate repeatable labels; codes are not leaked to buyer or strangers", async () => {
  assert.equal(
    (await buyer.post(`/api/commerce/orders/${orderId}/packages`)).status,
    404,
  );
  const r = await seller.post(`/api/commerce/orders/${orderId}/packages`);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  labels = r.body.packages;
  assert.equal(labels.length, 2);
  assert.notEqual(labels[0].code, labels[1].code);
  const again = await seller.post(`/api/commerce/orders/${orderId}/packages`);
  assert.deepEqual(again.body.packages, labels);
  const visible = await buyer.get(`/api/commerce/orders/${orderId}/packages`);
  assert.ok(visible.body.packages.every((p) => !("code" in p)));
  assert.equal(
    (await stranger.get(`/api/commerce/orders/${orderId}/packages`)).status,
    404,
  );
  const raw = db
    .prepare("SELECT * FROM order_packages WHERE id=?")
    .get(labels[0].id);
  assert.notEqual(raw.code_cipher, labels[0].code);
  assert.equal(
    raw.code_hash,
    crypto.createHash("sha256").update(labels[0].code).digest("hex"),
  );
});
test("transport requires receipt and seller cannot bypass package confirmation through old status API", async () => {
  const endpoint = `/api/commerce/orders/${orderId}/packages/${labels[0].id}/dispatch`;
  assert.equal(
    (
      await seller
        .post(endpoint)
        .field("method", "transport")
        .field("expectedArrival", "2026-10-01")
    ).status,
    422,
  );
  assert.equal(
    (
      await seller
        .patch(`/api/orders/${orderId}/status`)
        .send({ status: "delivered" })
    ).status,
    409,
  );
  assert.equal(
    (
      await buyer
        .patch(`/api/orders/${orderId}/status`)
        .send({ status: "completed" })
    ).status,
    409,
  );
  assert.throws(
    () =>
      adminUpdatePayout(
        { role: "admin" },
        db.prepare("SELECT id FROM payouts WHERE order_id=?").get(orderId).id,
        { action: "release" },
      ),
    /Buyer-confirmed/,
  );
});
test("dispatch and reminders notify buyers without releasing funds", async () => {
  for (const label of labels)
    assert.equal(
      (
        await seller
          .post(`/api/commerce/orders/${orderId}/packages/${label.id}/dispatch`)
          .field("method", "personal")
          .field("expectedArrival", "2026-10-01")
      ).status,
      200,
    );
  const url = `/api/commerce/orders/${orderId}/packages/${labels[0].id}/remind`;
  assert.equal((await seller.post(url)).status, 200);
  assert.equal((await seller.post(url)).status, 429);
  assert.equal(
    db.prepare("SELECT status FROM payouts WHERE order_id=?").get(orderId)
      .status,
    "on_hold",
  );
});
test("confirmation requires buyer identity, explicit receipt acceptance, and correct single-use code", async () => {
  const label = labels[0],
    url = `/api/commerce/orders/${orderId}/packages/${label.id}/confirm`;
  assert.equal(
    (await seller.post(url).send({ code: label.code, confirmReceived: true }))
      .status,
    404,
  );
  assert.equal(
    (await stranger.post(url).send({ code: label.code, confirmReceived: true }))
      .status,
    404,
  );
  assert.equal(
    (await buyer.post(url).send({ code: label.code, confirmReceived: false }))
      .status,
    422,
  );
  assert.equal(
    (await buyer.post(url).send({ code: "wrong", confirmReceived: true }))
      .status,
    422,
  );
  assert.equal(
    (
      await buyer
        .post(url)
        .send({ code: label.code.toLowerCase(), confirmReceived: true })
    ).status,
    200,
  );
  assert.equal(
    (await buyer.post(url).send({ code: label.code, confirmReceived: true }))
      .status,
    409,
  );
  assert.equal(
    db.prepare("SELECT status FROM payouts WHERE order_id=?").get(orderId)
      .status,
    "on_hold",
  );
});
test("last package confirmation makes payout eligible but not released", async () => {
  const label = labels[1];
  const r = await buyer
    .post(`/api/commerce/orders/${orderId}/packages/${label.id}/confirm`)
    .send({ code: label.code, confirmReceived: true });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(
    db.prepare("SELECT status FROM orders WHERE id=?").get(orderId).status,
    "completed",
  );
  assert.equal(
    db.prepare("SELECT status FROM payouts WHERE order_id=?").get(orderId)
      .status,
    "eligible",
  );
  assert.throws(
    () =>
      adminUpdatePayout(
        { role: "admin" },
        db.prepare("SELECT id FROM payouts WHERE order_id=?").get(orderId).id,
        { action: "release" },
      ),
    /verified payout transfer/,
  );
});
test("transfer verification matches amount and recipient and handles duplicate events and reversal", async () => {
  const payout = db
    .prepare("SELECT * FROM payouts WHERE order_id=?")
    .get(orderId);
  db.prepare(
    "INSERT INTO settlement_transfers(payout_id,reference,recipient_code,status,updated_at) VALUES(?,?,?,'pending',?)",
  ).run(
    payout.id,
    "test-transfer-reference",
    "RCP_TEST",
    new Date().toISOString(),
  );
  const data = {
    reference: "test-transfer-reference",
    amount: payout.seller_amount_kobo,
    currency: "NGN",
    recipient: { recipient_code: "RCP_TEST" },
    status: "success",
    transfer_code: "TRF_TEST",
  };
  assert.throws(() => applyTransfer({ ...data, amount: 1 }), /do not match/);
  applyTransfer(data);
  applyTransfer(data);
  assert.equal(
    db.prepare("SELECT status FROM payouts WHERE id=?").get(payout.id).status,
    "released",
  );
  applyTransfer({ ...data, status: "pending" });
  assert.equal(
    db.prepare("SELECT status FROM payouts WHERE id=?").get(payout.id).status,
    "released",
  );
  applyTransfer({ ...data, status: "reversed" });
  applyTransfer(data);
  assert.equal(
    db.prepare("SELECT status FROM payouts WHERE id=?").get(payout.id).status,
    "blocked",
  );
});
test("wrong code attempts lock persistently and transport proof alone never completes delivery", async () => {
  const id = await createPaidOrder();
  const r = await seller.post(`/api/commerce/orders/${id}/packages`);
  const label = r.body.packages[0];
  const sharp = (await import("sharp")).default;
  const image = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  const dispatch = await seller
    .post(`/api/commerce/orders/${id}/packages/${label.id}/dispatch`)
    .field("method", "transport")
    .field("transportName", "Test Transport")
    .field("trackingReference", "SHIP-1")
    .field("expectedArrival", "2026-10-01")
    .attach("receipt", image, "receipt.png");
  assert.equal(dispatch.status, 200, JSON.stringify(dispatch.body));
  assert.equal(
    (
      await stranger.get(
        `/api/commerce/orders/${id}/packages/${label.id}/receipt`,
      )
    ).status,
    404,
  );
  assert.equal(
    (await buyer.get(`/api/commerce/orders/${id}/packages/${label.id}/receipt`))
      .status,
    200,
  );
  const url = `/api/commerce/orders/${id}/packages/${label.id}/confirm`;
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await buyer.post(url).send({ code: "bad", confirmReceived: true }))
        .status,
      422,
    );
  assert.equal(
    (await buyer.post(url).send({ code: label.code, confirmReceived: true }))
      .status,
    429,
  );
  assert.equal(
    db.prepare("SELECT status FROM payouts WHERE order_id=?").get(id).status,
    "on_hold",
  );
});
test("open disputes block settlement even with all package confirmations", async () => {
  const id = await createPaidOrder();
  const r = await seller.post(`/api/commerce/orders/${id}/packages`);
  for (const p of r.body.packages) {
    await seller
      .post(`/api/commerce/orders/${id}/packages/${p.id}/dispatch`)
      .field("method", "personal")
      .field("expectedArrival", "2026-10-01");
    await buyer
      .post(`/api/commerce/orders/${id}/packages/${p.id}/confirm`)
      .send({ code: p.code, confirmReceived: true });
  }
  const dispute = await buyer
    .post(`/api/orders/${id}/disputes`)
    .send({ reason: "Package contents are damaged." });
  assert.equal(dispute.status, 201, JSON.stringify(dispute.body));
  assert.equal(
    db.prepare("SELECT status FROM payouts WHERE order_id=?").get(id).status,
    "blocked",
  );
  const payout = db.prepare("SELECT id FROM payouts WHERE order_id=?").get(id);
  assert.throws(() =>
    adminUpdatePayout({ role: "admin" }, payout.id, { action: "eligible" }),
  );
});
test("profile mutations cannot make an account admin, and unauthenticated APIs stay protected", async () => {
  await buyer
    .put("/api/commerce/profile")
    .send({ ...profile("shopper"), role: "admin", verified: true });
  assert.equal((await buyer.get("/api/auth/me")).body.user.role, "buyer");
  assert.equal((await request(app).get("/api/commerce/orders")).status, 401);
  assert.equal((await buyer.get("/api/admin/overview")).status, 401);
});

test("pending transfers are verified with the same reference and only provider success releases funds", async () => {
  const id = await createPaidOrder();
  const r = await seller.post(`/api/commerce/orders/${id}/packages`);
  for (const p of r.body.packages) {
    await seller
      .post(`/api/commerce/orders/${id}/packages/${p.id}/dispatch`)
      .field("method", "personal")
      .field("expectedArrival", "2026-10-01");
    await buyer
      .post(`/api/commerce/orders/${id}/packages/${p.id}/confirm`)
      .send({ code: p.code, confirmReceived: true });
  }
  db.prepare(
    "INSERT INTO commerce_payout_recipients(user_id,recipient_code,account_name,bank_code,account_last4,updated_at) VALUES(?,?,?,?,?,?)",
  ).run(
    sellerId,
    "RCP_MOCK",
    "Test Merchant",
    "001",
    "1234",
    new Date().toISOString(),
  );
  const payout = db.prepare("SELECT * FROM payouts WHERE order_id=?").get(id);
  const previousFetch = globalThis.fetch;
  const previousProvider = env.paymentProvider;
  let posts = 0;
  let reference = "";
  env.paymentProvider = "paystack";
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/transfer")) {
      posts++;
      reference = JSON.parse(options.body).reference;
      return {
        ok: true,
        json: async () => ({
          status: true,
          data: { status: "pending", transfer_code: "TRF_MOCK" },
        }),
      };
    }
    assert.ok(String(url).endsWith("/transfer/verify/" + reference));
    return {
      ok: true,
      json: async () => ({
        status: true,
        data: {
          status: "success",
          reference,
          amount: payout.seller_amount_kobo,
          currency: "NGN",
          recipient: { recipient_code: "RCP_MOCK" },
          transfer_code: "TRF_MOCK",
        },
      }),
    };
  };
  try {
    await settlePayout(payout.id);
    assert.equal(
      db.prepare("SELECT status FROM payouts WHERE id=?").get(payout.id).status,
      "eligible",
    );
    await settlePayout(payout.id);
    await settlePayout(payout.id);
    assert.equal(posts, 1);
    assert.equal(
      db.prepare("SELECT status FROM payouts WHERE id=?").get(payout.id).status,
      "released",
    );
  } finally {
    globalThis.fetch = previousFetch;
    env.paymentProvider = previousProvider;
  }
  const payload = {
    event: "transfer.reversed",
    data: {
      status: "reversed",
      reference,
      amount: payout.seller_amount_kobo,
      currency: "NGN",
      recipient: { recipient_code: "RCP_MOCK" },
      transfer_code: "TRF_MOCK",
    },
  };
  const body = JSON.stringify(payload);
  assert.equal(
    (
      await request(app)
        .post("/api/payments/webhook")
        .set("Content-Type", "application/json")
        .send(body)
    ).status,
    401,
  );
  assert.equal(
    db.prepare("SELECT status FROM payouts WHERE id=?").get(payout.id).status,
    "released",
  );
  const signature = crypto
    .createHmac("sha512", env.paystackSecretKey)
    .update(body)
    .digest("hex");
  assert.equal(
    (
      await request(app)
        .post("/api/payments/webhook")
        .set("Content-Type", "application/json")
        .set("x-paystack-signature", signature)
        .send(body)
    ).status,
    200,
  );
  assert.equal(
    db.prepare("SELECT status FROM payouts WHERE id=?").get(payout.id).status,
    "blocked",
  );
});
test("legacy admin order actions cannot manufacture delivery confirmation", async () => {
  const { updateRecordFields } = await import("../src/data/adminStore.js");
  assert.throws(
    () => updateRecordFields("orders", orderId, { orderStatus: "completed" }),
    /buyer package confirmation/,
  );
  assert.equal(
    (await buyer.get(`/api/admin/commerce/orders/${orderId}/packages`)).status,
    401,
  );
});
test("social product likes, shares and views remain available to the same account", async () => {
  for (const action of ["like", "share", "view"]) {
    const r = await buyer.post(`/api/products/${productId}/${action}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const r = await buyer.get(`/api/products/${productId}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.interaction.likeCount >= 1);
  assert.ok(r.body.interaction.shareCount >= 1);
});
