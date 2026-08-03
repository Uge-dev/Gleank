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
process.env.ENABLE_TEST_RIDER_DISPATCH = "true";
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
const { assertSellerVerified } = await import(
  "../src/services/seller-verification.service.js"
);
const { expireStaleRiderPresence } = await import(
  "../src/services/rider-presence.service.js"
);
const {
  backfillLegacyVerification,
  verificationRequirementDefinitions,
} = await import("../src/services/verification.service.js");
const { generateOrderVerificationCode } = await import(
  "../src/services/logistics.service.js"
);

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lxJ8qAAAAABJRU5ErkJggg==",
  "base64",
);

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
  assert.equal(response.body.riderPresenceModel, "session-heartbeat-v3");
});

test("seller can register and load workspace", async () => {
  const agent = request.agent(app);
  const registerResponse = await agent
    .post("/api/auth/register")
    .send({
      name: "Test Seller",
      email: "seller-test@gleank.local",
      password: "CampusMarket123!",
      role: "seller",
      campus: "FUPRE",
      storeName: "Test Campus Store",
      sellerType: "campus",
      country: "Nigeria",
      state: "Delta",
      city: "Effurun",
      nearestCampus: "Federal University of Petroleum Resources, Effurun (FUPRE)",
      nearestMarketplace: "Effurun Main Market",
      street: "Main Gate Road, Effurun",
      pickupPlaceId: "test-fupre-main-gate",
      pickupLat: 5.5702,
      pickupLng: 5.8385,
      locationVerifiedAt: "2026-08-01T12:00:00.000Z",
    });

  assert.equal(registerResponse.status, 201);
  assert.ok(registerResponse.headers["set-cookie"]?.[0].includes("gleank_session"));
  assert.equal(registerResponse.body.store.state, "Delta");
  assert.equal(registerResponse.body.store.city, "Effurun");
  assert.equal(registerResponse.body.store.nearestMarketplace, "Effurun Main Market");
  assert.equal(registerResponse.body.store.pickupPlaceId, "test-fupre-main-gate");
  assert.equal(registerResponse.body.store.pickupLat, 5.5702);
  assert.equal(registerResponse.body.store.pickupLng, 5.8385);

  const workspaceResponse = await agent.get("/api/seller/workspace");
  assert.equal(workspaceResponse.status, 200);
  const workspace = workspaceResponse.body;
  assert.equal(workspace.store.name, "Test Campus Store");
  assert.deepEqual(workspace.products, []);
  assert.deepEqual(workspace.services, []);

  const productResponse = await agent
    .post("/api/seller/products")
    .field("name", "Test Power Bank")
    .field("category", "Electronics")
    .field("description", "A test product.")
    .field("price", "15000")
    .field("stock", "5")
    .field("status", "active")
    .field("isFeatured", "true")
    .field("retainedImageUrls", JSON.stringify(["/uploads/test-power-bank.jpg"]));

  assert.equal(productResponse.status, 201);
  assert.equal(productResponse.body.product.stock, 5);
  assert.equal(productResponse.body.product.sellerPrice, 15000);
  assert.equal(productResponse.body.product.platformFee, 750);
  assert.equal(productResponse.body.product.price, 15750);
  assert.equal(productResponse.body.product.isFeatured, true);
  assert.equal(productResponse.body.product.status, "active");
  assert.equal(productResponse.body.product.moderationStatus, "auto_approved");
  const productId = productResponse.body.product.id;

  const serviceResponse = await agent
    .post("/api/seller/services")
    .field("name", "Test Repair")
    .field("category", "Repairs")
    .field("serviceType", "Phone repair")
    .field("location", "FUPRE campus")
    .field("description", "A test service.")
    .field("price", "5000")
    .field("durationMinutes", "45")
    .field("status", "active")
    .field("retainedImageUrls", JSON.stringify(["/uploads/test-repair.jpg"]));

  assert.equal(serviceResponse.status, 201);
  assert.equal(serviceResponse.body.service.durationMinutes, 45);

  const storeResponse = await agent
    .patch("/api/seller/store")
    .field("name", "Updated Campus Store")
    .field("description", "Updated through the API test.")
    .field("campus", "FUPRE")
    .field("category", "Student Essentials")
    .field("phone", "08000000000")
    .field("status", "active");

  assert.equal(storeResponse.status, 200);
  assert.equal(storeResponse.body.store.name, "Updated Campus Store");

  const updatedWorkspaceResponse = await agent.get("/api/seller/workspace");
  assert.equal(updatedWorkspaceResponse.status, 200);
  assert.equal(updatedWorkspaceResponse.body.products.length, 1);
  assert.equal(updatedWorkspaceResponse.body.services.length, 1);
  assert.equal(updatedWorkspaceResponse.body.store.pickupLat, 5.5702);
  assert.equal(updatedWorkspaceResponse.body.store.pickupLng, 5.8385);

  const searchResponse = await request(app)
    .get("/api/stores")
    .query({ q: "Updated Campus Store" });
  assert.equal(searchResponse.status, 200);
  assert.equal(searchResponse.body.stores.length, 1);
  assert.equal(searchResponse.body.stores[0].name, "Updated Campus Store");

  const productSearchResponse = await request(app)
    .get("/api/stores")
    .query({ q: "Power Bank" });
  assert.equal(productSearchResponse.status, 200);
  assert.equal(productSearchResponse.body.products.length, 1);
  assert.equal(
    productSearchResponse.body.products[0].storeSlug,
    "test-campus-store",
  );

  const productDetailResponse = await request(app).get(
    `/api/products/${productId}`,
  );
  assert.equal(productDetailResponse.status, 200);
  assert.equal(productDetailResponse.body.product.name, "Test Power Bank");
  assert.equal(
    productDetailResponse.body.product.store.name,
    "Updated Campus Store",
  );

  const followResponse = await agent.post(
    "/api/stores/test-campus-store/follow",
  );
  assert.equal(followResponse.status, 200);
  assert.equal(followResponse.body.interaction.isFollowing, true);
  assert.equal(followResponse.body.interaction.followerCount, 1);

  const likeResponse = await agent.post(`/api/products/${productId}/like`);
  assert.equal(likeResponse.status, 200);
  assert.equal(likeResponse.body.interaction.liked, true);
  assert.equal(likeResponse.body.interaction.likeCount, 1);

  const commentResponse = await agent
    .post(`/api/products/${productId}/comments`)
    .send({ body: "Is campus delivery available for this item?" });
  assert.equal(commentResponse.status, 201);
  assert.equal(
    commentResponse.body.comment.body,
    "Is campus delivery available for this item?",
  );

  const interactiveProductResponse = await agent.get(
    `/api/products/${productId}`,
  );
  assert.equal(interactiveProductResponse.status, 200);
  assert.equal(interactiveProductResponse.body.interaction.liked, true);
  assert.equal(interactiveProductResponse.body.interaction.commentCount, 1);
  assert.equal(
    interactiveProductResponse.body.storeInteraction.isFollowing,
    true,
  );
  assert.equal(interactiveProductResponse.body.comments.length, 1);

  const publicStoreResponse = await agent.get(
    "/api/stores/test-campus-store",
  );
  assert.equal(publicStoreResponse.status, 200);
  assert.equal(publicStoreResponse.body.interaction.followerCount, 1);
  assert.equal(publicStoreResponse.body.interaction.likesCount, 1);
  assert.ok(
    publicStoreResponse.body.highlights.some(
      (highlight) => highlight.category === "Electronics",
    ),
  );
  assert.ok(
    publicStoreResponse.body.highlights.some(
      (highlight) => highlight.category === "Favorites",
    ),
  );

  const saveResponse = await agent.post("/api/saved").send({
    itemType: "product",
    itemId: productId,
  });
  assert.equal(saveResponse.status, 201);
  assert.equal(saveResponse.body.savedItem.item.name, "Test Power Bank");

  const savedResponse = await agent.get("/api/saved");
  assert.equal(savedResponse.status, 200);
  assert.equal(savedResponse.body.savedItems.length, 1);

  const removeSavedResponse = await agent.delete(
    `/api/saved/product/${productId}`,
  );
  assert.equal(removeSavedResponse.status, 204);

  const highValueProductResponse = await agent
    .post("/api/seller/products")
    .field("name", "High Value Test Laptop")
    .field("category", "Electronics")
    .field("description", "A high-value product that must wait for admin review.")
    .field("price", "600000")
    .field("stock", "1")
    .field("status", "active")
    .field(
      "retainedImageUrls",
      JSON.stringify(["/uploads/high-value-test-laptop.jpg"]),
    );

  assert.equal(highValueProductResponse.status, 201);
  assert.equal(
    highValueProductResponse.body.product.moderationStatus,
    "pending_review",
  );
  assert.equal(highValueProductResponse.body.product.status, "draft");

  const usedListingResponse = await agent
    .post("/api/used-market")
    .field("name", "Used Test Desk Chair")
    .field("category", "Furniture")
    .field("description", "A clean test chair with no hidden faults.")
    .field("condition", "Very Good")
    .field("price", "180000")
    .field("quantity", "6")
    .field("campus", "FUPRE")
    .field("areaLocation", "FUPRE main campus")
    .field("pickupLocation", "Main gate")
    .field("deliveryOption", "Pickup")
    .field("serialNumber", "TEST-123")
    .field("defectsDisclosed", "No defects")
    .field("reasonForSelling", "Testing the protected used market flow.")
    .field("returnDays", "7")
    .field("confirmOwnership", "true")
    .field("confirmOwnershipText", "Seller confirmed ownership and truthful disclosure.")
    .field("fullName", "Test Seller")
    .field("trustPhone", "08000000000")
    .field("trustCampus", "FUPRE")
    .field("faceVerified", "true")
    .field("faceProvider", "local")
    .field("faceReference", "local-face-test")
    .field("bankName", "Test Bank")
    .field("accountName", "TEST SELLER")
    .field("accountNumber", "0123456789")
    .attach("images", tinyPng, {
      filename: "used-item-front.png",
      contentType: "image/png",
    })
    .attach("images", tinyPng, {
      filename: "used-item-back.png",
      contentType: "image/png",
    })
    .attach("images", tinyPng, {
      filename: "used-item-side.png",
      contentType: "image/png",
    })
    .attach("ownershipProof", tinyPng, {
      filename: "proof.png",
      contentType: "image/png",
    })
    .attach("identityProof", tinyPng, {
      filename: "identity-proof.png",
      contentType: "image/png",
    });

  assert.equal(usedListingResponse.status, 201);
  assert.equal(usedListingResponse.body.listing.status, "active");
  assert.equal(usedListingResponse.body.listing.availableQuantity, 6);
  const usedListingId = usedListingResponse.body.listing.id;

  const usedBuyerAgent = request.agent(app);
  const usedBuyerRegister = await usedBuyerAgent
    .post("/api/auth/register")
    .send({
      name: "Used Quantity Buyer",
      email: "used-quantity-buyer@gleank.local",
      password: "UsedQuantityBuyer123!",
      role: "buyer",
      campus: "FUPRE",
    });
  assert.equal(usedBuyerRegister.status, 201);

  const sizeProductResponse = await agent
    .post("/api/seller/products")
    .field("name", "Test Campus Jacket")
    .field("category", "Fashion")
    .field("description", "A size-aware test product.")
    .field("price", "22000")
    .field("stock", "4")
    .field("status", "active")
    .field("availableSizes", JSON.stringify(["M", "L"]))
    .field("retainedImageUrls", JSON.stringify(["/uploads/test-campus-jacket.jpg"]));
  assert.equal(sizeProductResponse.status, 201);
  assert.deepEqual(sizeProductResponse.body.product.availableSizes, ["M", "L"]);
  const sizeProductId = sizeProductResponse.body.product.id;

  const missingSizeCart = await usedBuyerAgent
    .post("/api/cart/items")
    .send({ productId: sizeProductId, quantity: 1 });
  assert.equal(missingSizeCart.status, 422);

  const validSizeCart = await usedBuyerAgent
    .post("/api/cart/items")
    .send({ productId: sizeProductId, quantity: 1, selectedSize: "M" });
  assert.equal(validSizeCart.status, 201);
  assert.equal(validSizeCart.body.cartItems[0].selectedSize, "M");

  const invalidSizeCart = await usedBuyerAgent
    .post("/api/cart/items")
    .send({ productId: sizeProductId, quantity: 1, selectedSize: "XXL" });
  assert.equal(invalidSizeCart.status, 409);

  const sizeOrder = await usedBuyerAgent
    .post("/api/orders")
    .send({
      items: [{ productId: sizeProductId, quantity: 1, selectedSize: "M" }],
      buyerName: "Used Quantity Buyer",
      buyerPhone: "08000000099",
      campus: "FUPRE",
      deliveryOption: "Pickup",
      pickupLocation: "FUPRE main gate",
      paymentMethod: "pay_now",
    });
  assert.equal(sizeOrder.status, 201);
  assert.equal(
    db
      .prepare("SELECT selected_size FROM order_items WHERE order_id = ?")
      .get(sizeOrder.body.orders[0].id).selected_size,
    "M",
  );

  const firstUsedOrder = await usedBuyerAgent
    .post("/api/used-orders")
    .send({
      listingId: usedListingId,
      quantity: 1,
      buyerName: "Used Quantity Buyer",
      buyerPhone: "08000000099",
      campus: "FUPRE",
      deliveryOption: "Pickup",
      pickupLocation: "FUPRE main gate",
    });
  assert.equal(firstUsedOrder.status, 201);
  assert.equal(firstUsedOrder.body.order.quantity, 1);
  assert.equal(firstUsedOrder.body.order.returnDays, 7);
  const afterFirstUsedOrder = db
    .prepare("SELECT quantity, reserved_quantity, status FROM used_listings WHERE id = ?")
    .get(usedListingId);
  assert.deepEqual(afterFirstUsedOrder, { quantity: 6, reserved_quantity: 1, status: "active" });

  const oversizedUsedOrder = await usedBuyerAgent
    .post("/api/used-orders")
    .send({
      listingId: usedListingId,
      quantity: 6,
      buyerName: "Used Quantity Buyer",
      buyerPhone: "08000000099",
      campus: "FUPRE",
      deliveryOption: "Pickup",
      pickupLocation: "FUPRE main gate",
    });
  assert.equal(oversizedUsedOrder.status, 409);
  const afterOversizedUsedOrder = db
    .prepare("SELECT quantity, reserved_quantity, status FROM used_listings WHERE id = ?")
    .get(usedListingId);
  assert.deepEqual(afterOversizedUsedOrder, { quantity: 6, reserved_quantity: 1, status: "active" });

  const usedMarketResponse = await request(app)
    .get("/api/used-market")
    .query({ q: "Test Chair" });
  assert.equal(usedMarketResponse.status, 200);
  assert.equal(usedMarketResponse.body.listings.length, 1);

  const globalUsedSearchResponse = await request(app)
    .get("/api/stores")
    .query({ q: "Test Chair" });
  assert.equal(globalUsedSearchResponse.status, 200);
  assert.equal(globalUsedSearchResponse.body.usedListings.length, 1);
  assert.equal(
    globalUsedSearchResponse.body.usedListings[0].sellerStoreSlug,
    "test-campus-store",
  );
  assert.equal(globalUsedSearchResponse.body.usedListings[0].sellerRole, "seller");
  assert.equal(
    globalUsedSearchResponse.body.usedListings[0].interaction.likeCount,
    0,
  );

  const likeUsedResponse = await agent.post(
    `/api/used-market/${usedListingId}/like`,
  );
  assert.equal(likeUsedResponse.status, 200);
  assert.equal(likeUsedResponse.body.interaction.likeCount, 1);

  const usedCommentResponse = await agent
    .post(`/api/used-market/${usedListingId}/comments`)
    .send({ body: "Is this item still available?" });
  assert.equal(usedCommentResponse.status, 201);
  assert.equal(usedCommentResponse.body.comment.body, "Is this item still available?");

  const usedDetailsResponse = await agent.get(
    `/api/used-market/${usedListingId}`,
  );
  assert.equal(usedDetailsResponse.status, 200);
  assert.equal(usedDetailsResponse.body.listing.interaction.commentCount, 1);
  assert.equal(usedDetailsResponse.body.listing.comments.length, 1);

  const usedSaveResponse = await agent.post("/api/saved").send({
    itemType: "used_listing",
    itemId: usedListingId,
  });
  assert.equal(usedSaveResponse.status, 201);

  const soldResponse = await agent
    .patch(`/api/used-market/${usedListingId}/status`)
    .send({ status: "sold" });
  assert.equal(soldResponse.status, 200);
  assert.equal(soldResponse.body.listing.status, "sold");
});

test("seller verification advances through three admin-approved stages", async () => {
  const sellerAgent = request.agent(app);
  const registerResponse = await sellerAgent
    .post("/api/auth/register")
    .send({
      name: "Three Stage Seller",
      email: "three-stage-seller@gleank.local",
      password: "SellerStages123!",
      phone: "08000000071",
      role: "seller",
      campus: "FUPRE",
      storeName: "Three Stage Store",
    });
  assert.equal(registerResponse.status, 201);
  const sellerId = registerResponse.body.user.id;

  const stageOneSubmit = await sellerAgent
    .post("/api/seller-verification/me/stages/1/submit")
    .send({
      sellerType: "campus",
      storeName: "Three Stage Store",
      storeCategory: "Electronics",
      fullName: "Three Stage Seller",
      phone: "08000000071",
      campus: "FUPRE",
      country: "Nigeria",
      state: "Delta",
      city: "Effurun",
      nearestCampus: "FUPRE",
      nearestMarketplace: "Effurun Main Market",
      street: "Main Gate Road, Effurun",
      pickupPlaceId: "test-place-fupre-main-gate",
      pickupLat: 5.5701,
      pickupLng: 5.8298,
      locationVerifiedAt: new Date().toISOString(),
      locationArea: "FUPRE campus",
      pickupLocation: "Main gate seller pickup desk",
      nearestLandmark: "FUPRE library",
      operatingHours: "Monday to Saturday, 8am to 6pm",
      currentStep: "1",
    });
  assert.equal(stageOneSubmit.status, 200);

  const stageOneCenter = await sellerAgent.get(
    "/api/verification/me?role=seller&history=true",
  );
  assert.equal(stageOneCenter.status, 200);
  assert.equal(stageOneCenter.body.case.currentVerifiedLevel, 0);
  assert.equal(
    stageOneCenter.body.case.stageReadiness.find(
      (stage) => stage.stage === 1,
    ).approvalReady,
    true,
  );

  const adminAgent = await createAdminAgent(
    "seller-stage-admin@gleank.local",
    "SellerStageAdmin123!",
  );
  const sellerQueues = await adminAgent.get(
    "/api/verification/admin/queues?role=seller",
  );
  const sellerCase = sellerQueues.body.cases.find(
    (item) => item.userId === sellerId,
  );
  assert.ok(sellerCase?.id);

  const stageOneApproval = await adminAgent
    .patch(`/api/verification/admin/cases/${sellerCase.id}/level`)
    .send({ level: 1, reason: "Seller store and pickup details approved." });
  assert.equal(stageOneApproval.status, 200);
  assert.equal(stageOneApproval.body.case.currentVerifiedLevel, 1);

  const authRow = db.prepare("SELECT * FROM users WHERE id = ?").get(sellerId);
  const originalAutoActivation = env.autoActivateSellerSubscription;
  try {
    env.autoActivateSellerSubscription = false;
    assert.throws(
      () => assertSellerVerified(authRow),
      /Stage 2/,
    );
  } finally {
    env.autoActivateSellerSubscription = originalAutoActivation;
  }

  const stageTwoSubmit = await sellerAgent
    .post("/api/seller-verification/me/stages/2/submit")
    .field("sellerType", "campus")
    .field("campus", "FUPRE")
    .field("faceVerified", "true")
    .field("faceProvider", "local")
    .field("faceReference", "seller-live-face-stage-two")
    .field(
      "businessDescription",
      "We sell verified electronics and prepare every order from our campus pickup desk.",
    )
    .field("agreementAccepted", "true")
    .field("currentStep", "2")
    .attach("identityProof", tinyPng, {
      filename: "three-stage-seller-id.png",
      contentType: "image/png",
    });
  assert.equal(stageTwoSubmit.status, 200);

  const refreshedSellerQueues = await adminAgent.get(
    "/api/verification/admin/queues?role=seller",
  );
  const stageTwoCase = refreshedSellerQueues.body.cases.find(
    (item) => item.userId === sellerId,
  );
  const stageTwoApproval = await adminAgent
    .patch(`/api/verification/admin/cases/${stageTwoCase.id}/level`)
    .send({ level: 2, reason: "Seller identity and trust checks approved." });
  assert.equal(stageTwoApproval.status, 200);
  assert.equal(stageTwoApproval.body.case.currentVerifiedLevel, 2);

  try {
    env.autoActivateSellerSubscription = false;
    assert.doesNotThrow(() => assertSellerVerified(authRow));
  } finally {
    env.autoActivateSellerSubscription = originalAutoActivation;
  }

  const stageTwoStore = db
    .prepare("SELECT * FROM stores WHERE owner_id = ?")
    .get(sellerId);
  assert.equal(Number(stageTwoStore.verified), 0);
  assert.equal(stageTwoStore.verification_status, "stage_2_approved");

  const payoutResponse = await sellerAgent
    .put("/api/trust/payout")
    .send({
      bankName: "Test Bank",
      accountName: "THREE STAGE SELLER",
      accountNumber: "0123456789",
    });
  assert.equal(payoutResponse.status, 200);

  const finalSubmit = await sellerAgent
    .post("/api/seller-verification/me/submit")
    .field("sellerType", "campus")
    .field("currentStep", "3");
  assert.equal(finalSubmit.status, 200);
  assert.equal(finalSubmit.body.verification.status, "pending_verification");

  const finalQueues = await adminAgent.get(
    "/api/verification/admin/queues?role=seller",
  );
  const finalCase = finalQueues.body.cases.find(
    (item) => item.userId === sellerId,
  );
  const finalApproval = await adminAgent
    .patch(`/api/verification/admin/cases/${finalCase.id}/level`)
    .send({ level: 3, reason: "Payout and operating agreement approved." });
  assert.equal(finalApproval.status, 200);
  assert.equal(finalApproval.body.case.currentVerifiedLevel, 3);

  const verifiedStore = db
    .prepare("SELECT * FROM stores WHERE owner_id = ?")
    .get(sellerId);
  assert.equal(Number(verifiedStore.verified), 1);
  assert.equal(verifiedStore.verification_status, "verified");
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

test("rider account cannot be silently converted to seller", async () => {
  const riderAgent = request.agent(app);

  const registerResponse = await riderAgent
    .post("/api/rider/register")
    .field("name", "Secure Rider")
    .field("email", "secure-rider@gleank.local")
    .field("password", "CampusRider123!")
    .field("phone", "08000000001")
    .field("campus", "FUPRE")
    .field("vehicleType", "Bike")
    .field("vehiclePlate", "RID-123")
    .field("coverageArea", "FUPRE")
    .field("homeAddress", "FUPRE road")
    .field("gpsPermissionStatus", "gps_enabled")
    .attach("identityDocument", tinyPng, {
      filename: "rider-id.png",
      contentType: "image/png",
    })
    .attach("selfie", tinyPng, {
      filename: "rider-selfie.png",
      contentType: "image/png",
    });

  assert.equal(registerResponse.status, 201);
  assert.equal(registerResponse.body.user.role, "rider");
  assert.ok(
    registerResponse.headers["set-cookie"]?.some((cookie) =>
      cookie.includes("gleank_rider_session="),
    ),
  );

  const dashboardResponse = await riderAgent.get("/api/rider/dashboard");
  assert.equal(dashboardResponse.status, 200);

  const sellerStartResponse = await riderAgent
    .post("/api/seller/onboarding/start")
    .send({ storeName: "Should Not Convert Rider" });
  assert.equal(sellerStartResponse.status, 401);

  const sessionResponse = await riderAgent.get("/api/rider/session");
  assert.equal(sessionResponse.status, 200);
  assert.equal(sessionResponse.body.user.role, "rider");
});

test("buyer cannot access seller or rider operations", async () => {
  const buyerAgent = request.agent(app);

  const registerResponse = await buyerAgent
    .post("/api/auth/register")
    .send({
      name: "Buyer Guard",
      email: "buyer-guard@gleank.local",
      password: "CampusBuyer123!",
      role: "buyer",
      campus: "FUPRE",
    });

  assert.equal(registerResponse.status, 201);
  assert.ok(
    registerResponse.headers["set-cookie"]?.some((cookie) =>
      cookie.includes("gleank_session="),
    ),
  );

  const sellerResponse = await buyerAgent
    .post("/api/seller/onboarding/start")
    .send({ storeName: "Buyer Store Attempt" });
  assert.equal(sellerResponse.status, 403);

  const riderResponse = await buyerAgent.get("/api/rider/dashboard");
  assert.equal(riderResponse.status, 401);
});

test("buyer, rider, and admin sessions remain isolated in one browser", async () => {
  const browser = request.agent(app);
  const buyerRegistration = await browser
    .post("/api/auth/register")
    .send({
      name: "Portal Isolation Buyer",
      email: "portal-isolation-buyer@gleank.local",
      password: "PortalBuyer123!",
      role: "buyer",
      campus: "Warri",
    });
  assert.equal(buyerRegistration.status, 201);

  const riderRegistration = await browser
    .post("/api/rider/register")
    .field("name", "Portal Isolation Rider")
    .field("email", "portal-isolation-rider@gleank.local")
    .field("password", "PortalRider123!")
    .field("phone", "08000000061")
    .field("campus", "Warri")
    .field("vehicleType", "Bike")
    .field("vehiclePlate", "ISO-601")
    .field("coverageArea", "Warri")
    .field("homeAddress", "Warri, Delta State")
    .field("gpsPermissionStatus", "gps_enabled")
    .attach("identityDocument", tinyPng, {
      filename: "portal-rider-id.png",
      contentType: "image/png",
    })
    .attach("selfie", tinyPng, {
      filename: "portal-rider-selfie.png",
      contentType: "image/png",
    });
  assert.equal(riderRegistration.status, 201);

  const adminEmail = "portal-isolation-admin@gleank.local";
  const adminPassword = "PortalAdmin123!";
  await createAdminAgent(adminEmail, adminPassword);
  const adminLogin = await browser
    .post("/api/admin/login")
    .send({ email: adminEmail, password: adminPassword });
  assert.equal(adminLogin.status, 200);

  const userSession = await browser
    .get("/api/auth/me")
    .set("X-Gleenc-Portal", "user");
  assert.equal(userSession.status, 200);
  assert.equal(userSession.body.user.email, "portal-isolation-buyer@gleank.local");

  const riderSession = await browser
    .get("/api/rider/session")
    .set("X-Gleenc-Portal", "rider");
  assert.equal(riderSession.status, 200);
  assert.equal(riderSession.body.user.email, "portal-isolation-rider@gleank.local");

  const adminSession = await browser
    .get("/api/admin/profile")
    .set("X-Gleenc-Portal", "admin");
  assert.equal(adminSession.status, 200);
  assert.equal(adminSession.body.admin.email, adminEmail);

  const userSessionAfterAdminRefresh = await browser
    .get("/api/auth/me")
    .set("X-Gleenc-Portal", "user");
  assert.equal(userSessionAfterAdminRefresh.status, 200);
  assert.equal(
    userSessionAfterAdminRefresh.body.user.email,
    "portal-isolation-buyer@gleank.local",
  );
});

test("rider verification locks approved stages and requires admin-approved resubmission", async () => {
  const riderAgent = request.agent(app);

  const registerResponse = await riderAgent
    .post("/api/rider/register")
    .field("name", "Step Two Rider")
    .field("email", "step-two-rider@gleank.local")
    .field("password", "CampusRider456!")
    .field("phone", "08000000021")
    .field("campus", "FUPRE")
    .field("vehicleType", "Bike")
    .field("vehiclePlate", "STP-200")
    .field("coverageArea", "FUPRE")
    .field("homeAddress", "Rider test address")
    .field("emergencyContactName", "Emergency Person")
    .field("emergencyContactPhone", "08000000022")
    .field("guarantorName", "Guarantor Person")
    .field("guarantorPhone", "08000000023")
    .attach("identityDocument", tinyPng, {
      filename: "step2-rider-id.png",
      contentType: "image/png",
    })
    .attach("selfie", tinyPng, {
      filename: "step2-rider-selfie.png",
      contentType: "image/png",
    });

  assert.equal(registerResponse.status, 201);
  const riderId = registerResponse.body.user.id;

  const centerResponse = await riderAgent.get("/api/verification/me?role=rider&history=true");
  assert.equal(centerResponse.status, 200);
  const initialRequirements = centerResponse.body.case.requirements;
  const initialStageOne = centerResponse.body.case.stageReadiness.find(
    (stage) => stage.stage === 1,
  );
  assert.equal(initialStageOne.approvalReady, false);
  assert.ok(initialStageOne.missingRequirementCodes.length > 0);
  const governmentId = initialRequirements.find((item) => item.code === "rider_government_id");
  const identitySelfie = initialRequirements.find((item) => item.code === "rider_identity_selfie");
  const liveFace = initialRequirements.find((item) => item.code === "rider_live_face");

  assert.ok(governmentId);
  assert.ok(identitySelfie);
  assert.ok(liveFace);
  assert.equal(governmentId.latestSubmission, null);
  assert.equal(identitySelfie.latestSubmission.version, 1);
  assert.notEqual(liveFace.status, "approved");

  const blockedFutureStage = await riderAgent
    .post("/api/verification/requirements/rider_government_id/submissions")
    .field("payload", JSON.stringify({ idType: "NIN", idNumberReference: "ending-1234" }))
    .attach("identityDocument", tinyPng, {
      filename: "step2-rider-id-replacement.png",
      contentType: "image/png",
    });

  assert.equal(blockedFutureStage.status, 403);

  for (const [code, payload] of [
    [
      "rider_personal_profile",
      {
        fullLegalName: "Step Two Rider",
        homeAddress: "Rider test address",
        state: "Delta",
        cityLga: "Uvwie",
        nearestLandmark: "FUPRE main gate",
      },
    ],
    [
      "rider_vehicle_capacity",
      {
        vehicleType: "Bike",
        plateInformation: "STP-200",
        packageSizes: "Small and medium",
        weightLimit: "20kg",
        fragileCapability: "Yes",
      },
    ],
    [
      "rider_service_zone",
      {
        serviceZones: "FUPRE",
        locationPermissionState: "enabled",
      },
    ],
  ]) {
    const stageSubmission = await riderAgent
      .post(`/api/verification/requirements/${code}/submissions`)
      .field("payload", JSON.stringify(payload));
    assert.equal(stageSubmission.status, 201);
  }

  const stageReadyResponse = await riderAgent.get(
    "/api/verification/me?role=rider&history=true",
  );
  const stageOneReady = stageReadyResponse.body.case.stageReadiness.find(
    (stage) => stage.stage === 1,
  );
  assert.equal(stageOneReady.approvalReady, true);

  const adminAgent = await createAdminAgent();
  db.prepare("UPDATE rider_profiles SET availability = 'offline', availability_mode = 'offline' WHERE user_id = ?").run(riderId);
  db.prepare(`
    UPDATE rider_presence_instances
    SET status = 'offline', updated_at = ?
    WHERE rider_id = ?
  `).run(new Date().toISOString(), riderId);

  const adminQueues = await adminAgent.get("/api/verification/admin/queues?role=rider");
  assert.equal(adminQueues.status, 200);
  const adminCase = adminQueues.body.cases.find((item) => item.userId === riderId);
  const adminLiveFace = adminCase.requirements.find((item) => item.code === "rider_live_face");

  const liveFaceApproveResponse = await adminAgent
    .patch(`/api/verification/admin/requirements/${adminLiveFace.id}/review`)
    .send({ action: "approve", feedback: "Attempting to approve static selfie as liveness." });
  assert.equal(liveFaceApproveResponse.status, 422);

  const stageApproveResponse = await adminAgent
    .patch(`/api/verification/admin/cases/${adminCase.id}/level`)
    .send({ level: 1, reason: "Stage 1 requirements completed and approved." });
  assert.equal(stageApproveResponse.status, 200);
  assert.equal(stageApproveResponse.body.case.currentVerifiedLevel, 1);

  const profile = db.prepare("SELECT * FROM rider_profiles WHERE user_id = ?").get(riderId);
  assert.equal(profile.verification_status, "verified");
  assert.equal(profile.availability, "offline");

  const governmentSubmit = await riderAgent
    .post("/api/verification/requirements/rider_government_id/submissions")
    .field("actorRole", "rider")
    .field("payload", JSON.stringify({ idType: "NIN", idNumberReference: "ending-1234" }))
    .attach("identityDocument", tinyPng, {
      filename: "step2-rider-id-replacement.png",
      contentType: "image/png",
    });
  assert.equal(governmentSubmit.status, 201);
  const submittedGovernment = governmentSubmit.body.case.requirements.find(
    (item) => item.code === "rider_government_id",
  );
  assert.equal(submittedGovernment.latestSubmission.version, 1);
  assert.equal(submittedGovernment.isLocked, true);

  const blockedDuringReview = await riderAgent
    .post("/api/verification/requirements/rider_government_id/submissions")
    .field("actorRole", "rider")
    .field("payload", JSON.stringify({ idType: "NIN", idNumberReference: "ending-5678" }))
    .attach("identityDocument", tinyPng, {
      filename: "step2-rider-id-second-version.png",
      contentType: "image/png",
    });
  assert.equal(blockedDuringReview.status, 409);

  const reviewResponse = await adminAgent
    .patch(`/api/verification/admin/requirements/${submittedGovernment.id}/review`)
    .send({ action: "approve", feedback: "Government ID approved after admin review." });
  assert.equal(reviewResponse.status, 200);
  const approvedGovernment = reviewResponse.body.case.requirements.find(
    (item) => item.code === "rider_government_id",
  );
  assert.equal(approvedGovernment.status, "approved");
  assert.equal(approvedGovernment.isLocked, true);
  assert.equal(approvedGovernment.canRequestResubmission, true);

  const blockedApprovedEdit = await riderAgent
    .post("/api/verification/requirements/rider_government_id/submissions")
    .field("actorRole", "rider")
    .field("payload", JSON.stringify({ idType: "NIN", idNumberReference: "ending-9999" }))
    .attach("identityDocument", tinyPng, {
      filename: "step2-rider-id-blocked-approved.png",
      contentType: "image/png",
    });
  assert.equal(blockedApprovedEdit.status, 409);

  const resubmissionRequest = await riderAgent
    .post(`/api/verification/requirements/${approvedGovernment.id}/resubmission-request`)
    .send({
      actorRole: "rider",
      reason: "My ID reference was entered incorrectly and needs to be replaced.",
    });
  assert.equal(resubmissionRequest.status, 201);
  const requestedGovernment = resubmissionRequest.body.case.requirements.find(
    (item) => item.code === "rider_government_id",
  );
  assert.equal(requestedGovernment.status, "approved");
  assert.equal(requestedGovernment.isLocked, true);
  assert.equal(requestedGovernment.resubmissionRequest.status, "pending");

  const resubmissionQueues = await adminAgent.get("/api/verification/admin/queues?role=rider");
  const queuedCase = resubmissionQueues.body.queues.resubmissionRequests.find(
    (item) => item.userId === riderId,
  );
  const queuedGovernment = queuedCase.requirements.find(
    (item) => item.code === "rider_government_id",
  );
  const reopenResponse = await adminAgent
    .patch(
      `/api/verification/admin/resubmission-requests/${queuedGovernment.resubmissionRequest.id}`,
    )
    .send({
      action: "approve",
      feedback: "Reason accepted. Upload the corrected government identity document.",
    });
  assert.equal(reopenResponse.status, 200);
  const reopenedGovernment = reopenResponse.body.case.requirements.find(
    (item) => item.code === "rider_government_id",
  );
  assert.equal(reopenedGovernment.status, "needs_information");
  assert.equal(reopenedGovernment.isLocked, false);
  assert.equal(reopenedGovernment.canSubmit, true);

  const correctedGovernmentSubmit = await riderAgent
    .post("/api/verification/requirements/rider_government_id/submissions")
    .field("actorRole", "rider")
    .field("payload", JSON.stringify({ idType: "NIN", idNumberReference: "ending-5678" }))
    .attach("identityDocument", tinyPng, {
      filename: "step2-rider-id-corrected.png",
      contentType: "image/png",
    });
  assert.equal(correctedGovernmentSubmit.status, 201);
  const correctedGovernment = correctedGovernmentSubmit.body.case.requirements.find(
    (item) => item.code === "rider_government_id",
  );
  assert.equal(correctedGovernment.latestSubmission.version, 2);
  assert.equal(correctedGovernment.status, "submitted");
  assert.equal(correctedGovernment.resubmissionRequest.status, "completed");

  const eligibilityResponse = await riderAgent.get("/api/rider/eligibility");
  assert.equal(eligibilityResponse.status, 200);
  assert.equal(eligibilityResponse.body.eligible, false);
  assert.ok(
    eligibilityResponse.body.blockingReasons.some((reason) => reason.code === "RIDER_OFFLINE"),
  );
});

test("verification definitions and legacy backfill are safe and idempotent", () => {
  const definitions = verificationRequirementDefinitions();
  const riderCodes = new Set(definitions.filter((item) => item.role === "rider").map((item) => item.code));
  const sellerCodes = new Set(definitions.filter((item) => item.role === "seller").map((item) => item.code));

  for (const code of [
    "rider_personal_profile",
    "rider_emergency_contact",
    "rider_guarantor",
    "rider_government_id",
    "rider_identity_selfie",
    "rider_live_face",
    "rider_vehicle_capacity",
  ]) {
    assert.ok(riderCodes.has(code), `${code} should have a rider workflow`);
  }

  for (const code of [
    "seller_identity_selfie",
    "seller_store_identity",
    "seller_pickup_information",
    "seller_payout_account",
    "seller_campus_identity",
    "seller_market_selection",
  ]) {
    assert.ok(sellerCodes.has(code), `${code} should have a seller workflow`);
  }

  const before = db.prepare("SELECT COUNT(*) AS count FROM verification_submissions").get().count;
  const first = backfillLegacyVerification({ dryRun: false });
  const afterFirst = db.prepare("SELECT COUNT(*) AS count FROM verification_submissions").get().count;
  const second = backfillLegacyVerification({ dryRun: false });
  const afterSecond = db.prepare("SELECT COUNT(*) AS count FROM verification_submissions").get().count;

  assert.equal(first.dryRun, false);
  assert.equal(second.dryRun, false);
  assert.ok(afterFirst >= before);
  assert.equal(afterSecond, afterFirst);
});

test("public payment verification confirms local payment and protects buyer OTP", async () => {
  const sellerAgent = request.agent(app);
  const buyerAgent = request.agent(app);

  const sellerRegister = await sellerAgent
    .post("/api/auth/register")
    .send({
      name: "Payment Seller",
      email: "payment-seller@gleank.local",
      password: "CampusSeller123!",
      role: "seller",
      campus: "FUPRE",
      storeName: "Payment Test Store",
    });
  assert.equal(sellerRegister.status, 201);

  const productResponse = await sellerAgent
    .post("/api/seller/products")
    .field("name", "Payment Test Product")
    .field("category", "Electronics")
    .field("description", "Product for secure payment callback test.")
    .field("price", "10000")
    .field("stock", "6")
    .field("status", "active")
    .field("retainedImageUrls", JSON.stringify(["/uploads/payment-test-product.jpg"]));

  assert.equal(productResponse.status, 201);
  const productId = productResponse.body.product.id;

  const buyerRegister = await buyerAgent
    .post("/api/auth/register")
    .send({
      name: "Payment Buyer",
      email: "payment-buyer@gleank.local",
      password: "CampusBuyer456!",
      role: "buyer",
      campus: "FUPRE",
    });
  assert.equal(buyerRegister.status, 201);

  const orderResponse = await buyerAgent
    .post("/api/orders")
    .send({
      items: [{ productId, quantity: 1 }],
      buyerName: "Payment Buyer",
      buyerPhone: "08000000002",
      campus: "FUPRE",
      deliveryOption: "Pickup",
      pickupLocation: "FUPRE main gate",
      paymentMethod: "pay_now",
    });

  assert.equal(orderResponse.status, 201);
  const orderId = orderResponse.body.orders[0].id;

  const initializeResponse = await buyerAgent
    .post("/api/payments/initialize")
    .send({ purpose: "store_order", targetId: orderId });

  assert.equal(initializeResponse.status, 201);
  const reference = initializeResponse.body.payment.reference;

  const publicVerifyResponse = await request(app)
    .post("/api/payments/public/verify")
    .send({ reference });

  assert.equal(publicVerifyResponse.status, 200);
  assert.equal(publicVerifyResponse.body.payment.status, "paid");
  assert.equal(publicVerifyResponse.body.payment.userId, undefined);
  assert.match(publicVerifyResponse.body.payment.successPath, /^\/order-success\?paymentRef=/);
  assert.equal(publicVerifyResponse.body.payment.summary, null);

  const ownerVerifyResponse = await buyerAgent
    .post("/api/payments/public/verify")
    .send({ reference });
  assert.equal(ownerVerifyResponse.status, 200);
  assert.equal(ownerVerifyResponse.body.payment.summary.orderId, orderId);

  const buyerOrderResponse = await buyerAgent.get(`/api/orders/${orderId}`);
  assert.equal(buyerOrderResponse.status, 200);
  assert.ok(buyerOrderResponse.body.order.verificationCode);
  assert.equal(buyerOrderResponse.body.order.buyerPhone, "");
  assert.equal(buyerOrderResponse.body.order.sellerPhone, "");

  const sellerOrderResponse = await sellerAgent.get(`/api/orders/${orderId}`);
  assert.equal(sellerOrderResponse.status, 200);
  assert.equal(sellerOrderResponse.body.order.verificationCode, "");
  assert.equal(sellerOrderResponse.body.order.buyerPhone, "");
  assert.equal(sellerOrderResponse.body.order.sellerPhone, "");

  const sellerPurchaseHistory = await sellerAgent.get("/api/orders");
  assert.equal(sellerPurchaseHistory.status, 200);
  assert.equal(sellerPurchaseHistory.body.orders.length, 0);

  const sellerBuyerOrders = await sellerAgent.get("/api/seller/orders");
  assert.equal(sellerBuyerOrders.status, 200);
  assert.ok(
    sellerBuyerOrders.body.orders.some((order) => order.id === orderId),
  );
  const sellerVisibleOrder = sellerBuyerOrders.body.orders.find(
    (order) => order.id === orderId,
  );
  assert.equal(sellerVisibleOrder.buyerPhone, "");
  assert.equal(sellerVisibleOrder.status, "paid");
  assert.equal(sellerVisibleOrder.sellerConfirmedAt, null);

  const purchasingSellerAgent = request.agent(app);
  const purchasingSellerRegister = await purchasingSellerAgent
    .post("/api/auth/register")
    .send({
      name: "Purchasing Seller",
      email: "purchasing-seller@gleank.local",
      password: "CampusSeller456!",
      role: "seller",
      campus: "FUPRE",
      storeName: "Purchasing Seller Store",
    });
  assert.equal(purchasingSellerRegister.status, 201);

  const sellerPurchaseOrder = await purchasingSellerAgent
    .post("/api/orders")
    .send({
      items: [{ productId, quantity: 1 }],
      buyerName: "Purchasing Seller",
      buyerPhone: "08000000004",
      campus: "FUPRE",
      deliveryOption: "Pickup",
      pickupLocation: "FUPRE main gate",
      paymentMethod: "pay_now",
    });
  assert.equal(
    sellerPurchaseOrder.status,
    201,
    JSON.stringify(sellerPurchaseOrder.body),
  );
  const sellerPurchaseOrderId = sellerPurchaseOrder.body.orders[0].id;

  const sellerPurchasePayment = await purchasingSellerAgent
    .post("/api/payments/initialize")
    .send({ purpose: "store_order", targetId: sellerPurchaseOrderId });
  assert.equal(sellerPurchasePayment.status, 201);

  const sellerPurchasePaymentVerify = await purchasingSellerAgent
    .post("/api/payments/public/verify")
    .send({ reference: sellerPurchasePayment.body.payment.reference });
  assert.equal(sellerPurchasePaymentVerify.status, 200);
  assert.equal(sellerPurchasePaymentVerify.body.payment.status, "paid");

  const purchasingSellerYourOrders = await purchasingSellerAgent.get("/api/orders");
  assert.equal(purchasingSellerYourOrders.status, 200);
  assert.ok(
    purchasingSellerYourOrders.body.orders.some(
      (order) => order.id === sellerPurchaseOrderId,
    ),
  );

  const purchasingSellerSales = await purchasingSellerAgent.get(
    "/api/seller/orders",
  );
  assert.equal(purchasingSellerSales.status, 200);
  assert.equal(
    purchasingSellerSales.body.orders.some(
      (order) => order.id === sellerPurchaseOrderId,
    ),
    false,
  );

  const originalSellerIncomingOrders = await sellerAgent.get(
    "/api/seller/orders",
  );
  assert.ok(
    originalSellerIncomingOrders.body.orders.some(
      (order) => order.id === sellerPurchaseOrderId,
    ),
  );

  const purchasingSellerCannotFulfilOwnPurchase = await purchasingSellerAgent
    .post(`/api/orders/${sellerPurchaseOrderId}/seller-confirm`)
    .send({ note: "This seller is the buyer, not the fulfilment seller." });
  assert.equal(purchasingSellerCannotFulfilOwnPurchase.status, 403);

  const confirmationWithoutPickupPin = await sellerAgent
    .post(`/api/orders/${orderId}/seller-confirm`)
    .send({ note: "Missing the verified pickup pin." });
  assert.equal(confirmationWithoutPickupPin.status, 422);
  assert.match(confirmationWithoutPickupPin.body.message, /precise location/i);

  const paidOrderConfirmation = await sellerAgent
    .post(`/api/orders/${orderId}/seller-confirm`)
    .send({
      note: "Paid order stock confirmed by seller.",
      sellerLocation: {
        lat: 5.5737,
        lng: 5.8446,
        accuracyMeters: 12,
        address: "FUPRE, Ugbomro, Delta State, Nigeria",
      },
    });
  assert.equal(paidOrderConfirmation.status, 200);
  assert.equal(paidOrderConfirmation.body.order.status, "ready_for_delivery");
  assert.equal(
    paidOrderConfirmation.body.order.fulfillmentStatus,
    "package_ready",
  );
  assert.ok(paidOrderConfirmation.body.order.sellerConfirmedAt);

  const confirmedPickupTask = db
    .prepare("SELECT * FROM pickup_tasks WHERE order_id = ?")
    .get(orderId);
  assert.ok(confirmedPickupTask?.id);
  assert.equal(Number(confirmedPickupTask.seller_confirmed_availability), 1);
  const paidConfirmedCoordinates = db
    .prepare("SELECT pickup_location, pickup_lat, pickup_lng FROM orders WHERE id = ?")
    .get(orderId);
  assert.equal(paidConfirmedCoordinates.pickup_location, "FUPRE, Ugbomro, Delta State, Nigeria");
  assert.equal(Number(paidConfirmedCoordinates.pickup_lat), 5.5737);
  assert.equal(Number(paidConfirmedCoordinates.pickup_lng), 5.8446);

  const paymentOnDeliveryOrder = await buyerAgent
    .post("/api/orders")
    .send({
      items: [{ productId, quantity: 1 }],
      buyerName: "Payment Buyer",
      buyerPhone: "08000000002",
      campus: "FUPRE",
      deliveryOption: "Delivery",
      deliveryAddress: "Library road, FUPRE",
      deliveryDetails: "Engineering Faculty reception",
      deliveryLandmark: "Beside the main library",
      nearestBusStop: "FUPRE Main Gate",
      deliveryLat: 5.5662,
      deliveryLng: 5.8461,
      paymentMethod: "pay_on_delivery",
    });
  assert.equal(paymentOnDeliveryOrder.status, 201);
  assert.equal(paymentOnDeliveryOrder.body.orders[0].status, "pending_payment");
  assert.equal(paymentOnDeliveryOrder.body.orders[0].paymentMethod, "pay_on_delivery");
  assert.equal(paymentOnDeliveryOrder.body.orders[0].sellerConfirmedAt, null);

  const blockedDirectPaymentOnDelivery = await buyerAgent
    .post("/api/payments/initialize")
    .send({
      purpose: "store_order",
      targetId: paymentOnDeliveryOrder.body.orders[0].id,
    });
  assert.equal(blockedDirectPaymentOnDelivery.status, 422);

  const blockedEarlyPaymentOnDelivery = await buyerAgent
    .post("/api/payments/pay-at-delivery/initialize")
    .send({ orderId: paymentOnDeliveryOrder.body.orders[0].id });
  assert.equal(blockedEarlyPaymentOnDelivery.status, 422);

  const stalePaymentOnDeliverySetup = db
    .prepare(
      "SELECT delivery_batch_id, pickup_task_id FROM orders WHERE id = ?",
    )
    .get(paymentOnDeliveryOrder.body.orders[0].id);
  assert.ok(stalePaymentOnDeliverySetup?.pickup_task_id);
  db.prepare("DELETE FROM pickup_tasks WHERE id = ?").run(
    stalePaymentOnDeliverySetup.pickup_task_id,
  );

  const paymentOnDeliveryConfirmation = await sellerAgent
    .post(`/api/orders/${paymentOnDeliveryOrder.body.orders[0].id}/seller-confirm`)
    .send({
      note: "Payment on Delivery stock confirmed.",
      sellerLocation: {
        lat: 5.5737,
        lng: 5.8446,
        accuracyMeters: 12,
        address: "FUPRE, Ugbomro, Delta State, Nigeria",
      },
    });
  assert.equal(paymentOnDeliveryConfirmation.status, 200);
  assert.equal(
    paymentOnDeliveryConfirmation.body.order.status,
    "ready_for_delivery",
  );
  assert.ok(paymentOnDeliveryConfirmation.body.order.sellerConfirmedAt);
  const allowedPaymentOnDelivery = await buyerAgent
    .post("/api/payments/pay-at-delivery/initialize")
    .send({ orderId: paymentOnDeliveryOrder.body.orders[0].id });
  assert.equal(allowedPaymentOnDelivery.status, 201);
  const paymentOnDeliveryTask = db
    .prepare("SELECT * FROM pickup_tasks WHERE order_id = ?")
    .get(paymentOnDeliveryOrder.body.orders[0].id);
  assert.ok(paymentOnDeliveryTask?.id);
  assert.notEqual(
    paymentOnDeliveryTask.delivery_batch_id,
    stalePaymentOnDeliverySetup.delivery_batch_id,
  );
  const paymentOnDeliveryReady = await sellerAgent
    .post(
      `/api/seller/pickup-tasks/${paymentOnDeliveryTask.id}/mark-ready`,
    )
    .send({
      packageSize: "small",
      packageWeightClass: "light",
      handlingClass: "not_fragile",
      pickupPointConfirmed: true,
    });
  assert.equal(paymentOnDeliveryReady.status, 200);
  const paymentOnDeliveryRow = db
    .prepare("SELECT payment_status, status FROM orders WHERE id = ?")
    .get(paymentOnDeliveryOrder.body.orders[0].id);
  assert.notEqual(paymentOnDeliveryRow.payment_status, "paid");
  assert.equal(paymentOnDeliveryRow.status, "ready_for_delivery");

  const unavailablePaidOrder = await buyerAgent
    .post("/api/orders")
    .send({
      items: [{ productId, quantity: 1 }],
      buyerName: "Payment Buyer",
      buyerPhone: "08000000002",
      campus: "FUPRE",
      deliveryOption: "Pickup",
      pickupLocation: "FUPRE main gate",
      paymentMethod: "pay_now",
    });
  assert.equal(unavailablePaidOrder.status, 201);
  const unavailablePaidOrderId = unavailablePaidOrder.body.orders[0].id;
  const unavailablePayment = await buyerAgent
    .post("/api/payments/initialize")
    .send({ purpose: "store_order", targetId: unavailablePaidOrderId });
  assert.equal(unavailablePayment.status, 201);
  const unavailablePaymentVerify = await request(app)
    .post("/api/payments/public/verify")
    .send({ reference: unavailablePayment.body.payment.reference });
  assert.equal(unavailablePaymentVerify.status, 200);
  const unavailableReject = await sellerAgent
    .post(`/api/orders/${unavailablePaidOrderId}/seller-reject`)
    .send({ note: "Item unavailable after final stock inspection." });
  assert.equal(unavailableReject.status, 200);
  assert.equal(unavailableReject.body.order.status, "cancelled");
  const unavailablePayout = db
    .prepare(
      "SELECT status FROM payouts WHERE source_type = 'store_order' AND order_id = ?",
    )
    .get(unavailablePaidOrderId);
  assert.equal(unavailablePayout.status, "blocked");

  const highValueProductResponse = await sellerAgent
    .post("/api/seller/products")
    .field("name", "High Value Checkout Product")
    .field("category", "Office equipment")
    .field("description", "Product used to verify the one hundred thousand naira limit.")
    .field("price", "1000000")
    .field("stock", "2")
    .field("status", "active")
    .field(
      "retainedImageUrls",
      JSON.stringify(["/uploads/high-value-checkout-product.jpg"]),
    );
  assert.equal(highValueProductResponse.status, 201);
  const highValueProductId = highValueProductResponse.body.product.id;
  db.prepare(`
    UPDATE products
    SET status = 'active',
        moderation_status = 'auto_approved',
        availability_status = 'confirm_before_payment',
        seller_confirmation_required = 1
    WHERE id = ?
  `).run(highValueProductId);

  const blockedHighValuePaymentOnDelivery = await buyerAgent
    .post("/api/orders")
    .send({
      items: [{ productId: highValueProductId, quantity: 1 }],
      buyerName: "Payment Buyer",
      buyerPhone: "08000000002",
      campus: "FUPRE",
      deliveryOption: "Pickup",
      pickupLocation: "FUPRE main gate",
      paymentMethod: "pay_on_delivery",
    });
  assert.equal(blockedHighValuePaymentOnDelivery.status, 422);
  assert.match(
    blockedHighValuePaymentOnDelivery.body.message,
    /Payment on Delivery.*below ₦100,000/i,
  );

  const blockedHighValueDoorstep = await buyerAgent
    .post("/api/orders")
    .send({
      items: [{ productId: highValueProductId, quantity: 1 }],
      buyerName: "Payment Buyer",
      buyerPhone: "08000000002",
      campus: "FUPRE",
      deliveryOption: "Delivery",
      deliveryAddress: "Library road, FUPRE",
      deliveryDetails: "Engineering Faculty reception",
      deliveryLandmark: "Beside the main library",
      nearestBusStop: "FUPRE Main Gate",
      deliveryLat: 5.5662,
      deliveryLng: 5.8461,
      paymentMethod: "pay_on_delivery",
    });
  assert.equal(blockedHighValueDoorstep.status, 422);
  assert.match(
    blockedHighValueDoorstep.body.message,
    /Payment on Delivery.*below ₦100,000/i,
  );

  const highValuePayNowOrder = await buyerAgent
    .post("/api/orders")
    .send({
      items: [{ productId: highValueProductId, quantity: 1 }],
      buyerName: "Payment Buyer",
      buyerPhone: "08000000002",
      campus: "FUPRE",
      deliveryOption: "Pickup",
      pickupLocation: "FUPRE main gate",
      paymentMethod: "pay_now",
    });
  assert.equal(highValuePayNowOrder.status, 201);
  assert.equal(highValuePayNowOrder.body.orders[0].sellerConfirmationRequired, true);
  const sellerActionCountBeforePayment = await sellerAgent.get(
    "/api/seller/orders/actionable-count",
  );
  assert.equal(sellerActionCountBeforePayment.status, 200);
  assert.ok(sellerActionCountBeforePayment.body.count > 0);
  const highValuePayment = await buyerAgent
    .post("/api/payments/initialize")
    .send({
      purpose: "store_order",
      targetId: highValuePayNowOrder.body.orders[0].id,
    });
  assert.equal(highValuePayment.status, 201);

  const storeId = db.prepare("SELECT id FROM stores WHERE owner_id = ?").get(
    sellerRegister.body.user.id,
  ).id;
  const nearbyBuyerPresence = await buyerAgent
    .post("/api/location/presence")
    .send({
      permissionStatus: "granted",
      source: "nearby_privacy_test",
      currentLocation: { lat: 5.575, lng: 5.84, accuracyMeters: 20 },
    });
  assert.equal(nearbyBuyerPresence.status, 200);
  const publicNearbyStoreResponse = await buyerAgent.get(
    "/api/market/nearby?q=Payment%20Test%20Store",
  );
  assert.equal(publicNearbyStoreResponse.status, 200);
  const publicNearbyStore = publicNearbyStoreResponse.body.sellers.find(
    (store) => store.id === storeId,
  );
  assert.ok(publicNearbyStore);
  assert.equal(publicNearbyStore.pickupLat, null);
  assert.equal(publicNearbyStore.pickupLng, null);
  assert.equal(publicNearbyStore.pickupPlaceId, "");
  assert.equal(publicNearbyStore.street, "");
  assert.equal(publicNearbyStore.ownerEmail, "");
  assert.equal(publicNearbyStore.ownerPhone, "");
  assert.equal(typeof publicNearbyStore.distanceKm, "number");
  const orderConversation = await buyerAgent
    .post("/api/messages/conversations")
    .send({ contextType: "order", contextId: orderId });
  assert.equal(orderConversation.status, 201);
  const storeConversation = await buyerAgent
    .post("/api/messages/conversations")
    .send({ contextType: "store", contextId: storeId });
  assert.equal(storeConversation.status, 201);
  assert.equal(
    storeConversation.body.conversation.id,
    orderConversation.body.conversation.id,
  );
  const productConversation = await buyerAgent
    .post("/api/messages/conversations")
    .send({ contextType: "product", contextId: productId });
  assert.equal(productConversation.status, 201);
  assert.equal(
    productConversation.body.conversation.id,
    orderConversation.body.conversation.id,
  );
  assert.equal(productConversation.body.draftContext.id, productId);
  assert.equal(productConversation.body.draftContext.name, "Payment Test Product");
  assert.equal(productConversation.body.draftContext.priceKobo, 1050000);

  const productMessage = await buyerAgent
    .post(`/api/messages/conversations/${orderConversation.body.conversation.id}/messages`)
    .field("body", "I'm interested in this product.")
    .field("contextType", "product")
    .field("contextId", productId);
  assert.equal(productMessage.status, 201);
  assert.equal(productMessage.body.message.context.id, productId);
  assert.equal(productMessage.body.message.context.name, "Payment Test Product");

  const foreignProduct = db.prepare(`
    SELECT products.id
    FROM products
    JOIN stores ON stores.id = products.store_id
    WHERE stores.owner_id != ?
      AND products.status IN ('active', 'out_of_stock')
    ORDER BY products.created_at ASC
    LIMIT 1
  `).get(sellerRegister.body.user.id);
  assert.ok(foreignProduct?.id);
  const blockedForeignProductContext = await buyerAgent
    .post(`/api/messages/conversations/${orderConversation.body.conversation.id}/messages`)
    .field("body", "Attempted unrelated product context.")
    .field("contextType", "product")
    .field("contextId", foreignProduct.id);
  assert.equal(blockedForeignProductContext.status, 404);

  db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(
    "/uploads/payment-buyer-avatar.jpg",
    buyerRegister.body.user.id,
  );
  const sellerInbox = await sellerAgent.get("/api/messages/conversations");
  assert.equal(sellerInbox.status, 200);
  const buyerConversation = sellerInbox.body.conversations.find(
    (conversation) => conversation.id === orderConversation.body.conversation.id,
  );
  assert.equal(buyerConversation.otherUserName, "Payment Buyer");
  assert.equal(
    buyerConversation.otherUserAvatarUrl,
    "/uploads/payment-buyer-avatar.jpg",
  );
  const directConversationCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM conversations
    WHERE context_type != 'support'
      AND ((buyer_id = ? AND seller_id = ?) OR (buyer_id = ? AND seller_id = ?))
  `).get(
    buyerRegister.body.user.id,
    sellerRegister.body.user.id,
    sellerRegister.body.user.id,
    buyerRegister.body.user.id,
  );
  assert.equal(directConversationCount.count, 1);
  const sellerConversation = await sellerAgent
    .post("/api/messages/conversations")
    .send({ contextType: "order", contextId: orderId });
  assert.equal(sellerConversation.status, 201);
  assert.equal(
    sellerConversation.body.conversation.id,
    orderConversation.body.conversation.id,
  );

  const sellerDeliveryAttempt = await sellerAgent
    .post(`/api/orders/${orderId}/verify-delivery`)
    .send({ verificationCode: buyerOrderResponse.body.order.verificationCode });
  assert.equal(sellerDeliveryAttempt.status, 403);

  const lifecycleNow = new Date().toISOString();
  db.prepare(`
    UPDATE orders
    SET status = 'completed',
        fulfillment_status = 'completed',
        delivery_status = 'completed',
        updated_at = ?
    WHERE id = ?
  `).run(lifecycleNow, orderId);
  db.prepare(`
    UPDATE orders
    SET status = 'cancelled',
        fulfillment_status = 'cancelled',
        delivery_status = 'cancelled',
        updated_at = ?
    WHERE id = ?
  `).run(lifecycleNow, paymentOnDeliveryOrder.body.orders[0].id);

  const activeSellerOrders = await sellerAgent.get(
    "/api/seller/orders?view=active",
  );
  assert.equal(activeSellerOrders.status, 200);
  assert.equal(
    activeSellerOrders.body.orders.some((order) => order.id === orderId),
    false,
  );
  assert.equal(
    activeSellerOrders.body.orders.some(
      (order) => order.id === paymentOnDeliveryOrder.body.orders[0].id,
    ),
    false,
  );
  assert.equal(
    activeSellerOrders.body.orders.some(
      (order) => order.id === unavailablePaidOrderId,
    ),
    false,
  );

  const successfulSellerOrders = await sellerAgent.get(
    "/api/seller/orders?view=successful",
  );
  assert.equal(successfulSellerOrders.status, 200);
  assert.equal(
    successfulSellerOrders.body.orders.some((order) => order.id === orderId),
    true,
  );
  assert.equal(
    successfulSellerOrders.body.orders.some(
      (order) => order.id === paymentOnDeliveryOrder.body.orders[0].id,
    ),
    false,
  );
});

test("seller-ready dispatch uses privacy-safe rider offers before assignment", async () => {
  const sellerAgent = request.agent(app);
  const buyerAgent = request.agent(app);
  const riderAgent = request.agent(app);

  const sellerRegister = await sellerAgent
    .post("/api/auth/register")
    .send({
      name: "Step Three Seller",
      email: "step3-seller@gleank.local",
      password: "CampusSeller789!",
      role: "seller",
      campus: "FUPRE",
      storeName: "Step Three Store",
    });
  assert.equal(sellerRegister.status, 201);
  const sellerId = sellerRegister.body.user.id;
  db.prepare("UPDATE users SET phone = ? WHERE id = ?").run(
    "08000000030",
    sellerId,
  );

  const productResponse = await sellerAgent
    .post("/api/seller/products")
    .field("name", "Step Three Package")
    .field("category", "Food")
    .field("description", "Package for dispatch offer test.")
    .field("price", "2500")
    .field("stock", "4")
    .field("status", "active")
    .field("retainedImageUrls", JSON.stringify(["/uploads/step-three-package.jpg"]));
  assert.equal(productResponse.status, 201);
  const productId = productResponse.body.product.id;

  const buyerRegister = await buyerAgent
    .post("/api/auth/register")
    .send({
      name: "Step Three Buyer",
      email: "step3-buyer@gleank.local",
      password: "CampusBuyer789!",
      role: "buyer",
      campus: "FUPRE",
    });
  assert.equal(buyerRegister.status, 201);
  const buyerId = buyerRegister.body.user.id;

  const riderRegister = await riderAgent
    .post("/api/rider/register")
    .field("name", "Step Three Rider")
    .field("email", "step3-rider@gleank.local")
    .field("password", "CampusRider789!")
    .field("phone", "08000000031")
    .field("campus", "FUPRE")
    .field("vehicleType", "Bike")
    .field("vehiclePlate", "STP-300")
    .field("coverageArea", "FUPRE")
    .field("homeAddress", "Rider dispatch address")
    .field("gpsPermissionStatus", "gps_enabled")
    .field("transportType", "motorcycle")
    .field("maxPackageSize", "small_medium")
    .field("maxWeightClass", "up_to_medium")
    .field("fragileHandlingAbility", "can_handle_fragile")
    .field("deliveryBagType", "medium_delivery_bag")
    .attach("identityDocument", tinyPng, {
      filename: "step3-rider-id.png",
      contentType: "image/png",
    })
    .attach("selfie", tinyPng, {
      filename: "step3-rider-selfie.png",
      contentType: "image/png",
    });
  assert.equal(riderRegister.status, 201);
  const riderId = riderRegister.body.user.id;
  const now = new Date().toISOString();
  db.prepare("UPDATE users SET phone_verified = 1, phone_verified_at = ?, email_verified = 1, email_verified_at = ? WHERE id = ?").run(now, now, riderId);
  db.prepare(`
    UPDATE rider_profiles
    SET verification_status = 'verified',
        availability = 'online',
        availability_mode = 'online_gps_active',
        gps_permission_status = 'gps_enabled',
        service_zone_ids = '["zone_fupre"]',
        current_zone_id = 'zone_fupre',
        last_location_at = ?,
        can_receive_auto_dispatch = 1,
        current_active_batch_count = 0,
        updated_at = ?
    WHERE user_id = ?
  `).run(now, now, riderId);

  const sellerLocation = await sellerAgent
    .post("/api/location/presence")
    .send({
      permissionStatus: "granted",
      source: "browser_login",
      currentLocation: { lat: 5.5701, lng: 5.8298, accuracyMeters: 20 },
    });
  assert.equal(sellerLocation.status, 200);
  const buyerLocation = await buyerAgent
    .post("/api/location/presence")
    .send({
      permissionStatus: "granted",
      source: "browser_login",
      currentLocation: { lat: 5.575, lng: 5.835, accuracyMeters: 18 },
    });
  assert.equal(buyerLocation.status, 200);
  const riderLocation = await riderAgent
    .post("/api/location/presence")
    .send({
      permissionStatus: "granted",
      source: "browser_login",
      currentLocation: { lat: 5.568, lng: 5.827, accuracyMeters: 12 },
    });
  assert.equal(riderLocation.status, 200);

  const nationwideCheckoutQuote = await buyerAgent
    .post("/api/delivery/quote")
    .send({
      items: [{ productId, quantity: 1 }],
      campus: "Nigeria",
      deliveryOption: "Delivery",
      destination: "My exact typed street address, Ugbomro, Delta State",
      destinationLat: 5.575,
      destinationLng: 5.835,
    });
  assert.equal(nationwideCheckoutQuote.status, 200);
  assert.ok(nationwideCheckoutQuote.body.quote.distanceKm > 0);
  assert.ok(nationwideCheckoutQuote.body.quote.feeKobo > 0);
  assert.equal(nationwideCheckoutQuote.body.quote.sellerRoutes.length, 1);
  assert.equal(
    nationwideCheckoutQuote.body.quote.sellerRoutes[0].storeId,
    productResponse.body.product.storeId,
  );

  const orderResponse = await buyerAgent
    .post("/api/orders")
    .send({
      items: [{ productId, quantity: 1 }],
      buyerName: "Step Three Buyer",
      buyerPhone: "08000000032",
      campus: "FUPRE",
      deliveryOption: "Delivery",
      deliveryAddress: "Engineering Faculty, FUPRE, Delta State, Nigeria",
      deliveryDetails: "Reception desk, ground floor",
      deliveryLandmark: "Beside the main library",
      nearestBusStop: "FUPRE Main Gate",
      deliveryLat: 5.575,
      deliveryLng: 5.835,
      paymentMethod: "pay_now",
  });
  assert.equal(orderResponse.status, 201);
  const orderId = orderResponse.body.orders[0].id;
  const orderRow = db
    .prepare(
      "SELECT delivery_batch_id, pickup_lat, pickup_lng, delivery_lat, delivery_lng FROM orders WHERE id = ?",
    )
    .get(orderId);
  assert.ok(orderRow?.delivery_batch_id);
  assert.equal(Number(orderRow.pickup_lat), 5.5701);
  assert.equal(Number(orderRow.pickup_lng), 5.8298);
  assert.equal(Number(orderRow.delivery_lat), 5.575);
  assert.equal(Number(orderRow.delivery_lng), 5.835);

  const blockedStart = await sellerAgent.post(`/api/dispatch/batches/${orderRow.delivery_batch_id}/start`);
  assert.equal(blockedStart.status, 422);

  const initializeResponse = await buyerAgent
    .post("/api/payments/initialize")
    .send({ purpose: "store_order", targetId: orderId });
  assert.equal(initializeResponse.status, 201);

  const publicVerifyResponse = await request(app)
    .post("/api/payments/public/verify")
    .send({ reference: initializeResponse.body.payment.reference });
  assert.equal(publicVerifyResponse.status, 200);

  const item = db.prepare("SELECT id FROM order_items WHERE order_id = ? LIMIT 1").get(orderId);
  assert.ok(item?.id);

  const confirmResponse = await sellerAgent
    .post(`/api/seller/order-items/${item.id}/confirm-availability`)
    .send({ note: "Available for dispatch." });
  assert.equal(confirmResponse.status, 200);
  const pickupTaskId = confirmResponse.body.pickupTask.id;
  const batchId = confirmResponse.body.pickupTask.deliveryBatchId;

  const readyResponse = await sellerAgent
    .post(`/api/seller/pickup-tasks/${pickupTaskId}/mark-ready`)
    .send({
      packageSize: "small",
      packageWeightClass: "light",
      handlingClass: "not_fragile",
      pickupPointConfirmed: true,
    });
  assert.equal(readyResponse.status, 200);

  const dispatchesBeforeSelection = await riderAgent.get(
    "/api/rider/dispatches/active",
  );
  assert.equal(dispatchesBeforeSelection.status, 200);
  assert.equal(dispatchesBeforeSelection.body.dispatches.length, 0);

  const automaticStart = await sellerAgent.post(
    `/api/dispatch/batches/${batchId}/start`,
  );
  assert.equal(automaticStart.status, 200);

  const riderDispatches = await riderAgent.get("/api/rider/dispatches/active");
  assert.equal(riderDispatches.status, 200);
  assert.equal(riderDispatches.body.dispatches.length, 1);
  const automaticOffer = riderDispatches.body.dispatches[0];
  assert.equal(automaticOffer.riderId, riderId);
  assert.equal(automaticOffer.status, "offered");
  assert.equal(automaticOffer.assignmentMode, "automatic");
  assert.equal(automaticOffer.offerWindowSeconds, 90);
  assert.equal(automaticOffer.safeRiderSnapshot.phone, undefined);
  assert.equal(typeof automaticOffer.safeRiderSnapshot.distanceToPickupKm, "number");
  assert.match(automaticOffer.safeRiderSnapshot.privacyNote, /Private phone/);
  assert.equal(
    automaticOffer.batch.pickupTasks[0].sellerName,
    "Step Three Seller",
  );
  assert.equal(
    automaticOffer.batch.pickupTasks[0].sellerPhone,
    "08000000030",
  );
  assert.ok(automaticOffer.batch.pickupTasks[0].pickupLocation);
  assert.equal(
    automaticOffer.batch.pickupTasks[0].firstProduct.name,
    "Step Three Package",
  );
  assert.equal(
    automaticOffer.batch.pickupTasks[0].firstProduct.imageUrl,
    "/uploads/step-three-package.jpg",
  );
  assert.equal(automaticOffer.batch.pickupTasks[0].packageSize, "small");
  assert.equal(automaticOffer.batch.pickupTasks[0].packageWeightClass, "light");
  assert.equal(automaticOffer.batch.pickupTasks[0].orderId, undefined);
  assert.equal(automaticOffer.batch.pickupTasks[0].orderItems, undefined);

  const candidateResponse = await sellerAgent.get(
    `/api/dispatch/batches/${batchId}/rider-candidates`,
  );
  assert.equal(candidateResponse.status, 200);
  const riderWithPendingOffer = candidateResponse.body.riders.find(
    (rider) => rider.id === riderId,
  );
  assert.ok(riderWithPendingOffer);
  assert.equal(riderWithPendingOffer.eligibleForThisOrder, false);
  assert.ok(
    riderWithPendingOffer.exclusionReasons.includes(
      "already_contacted_for_this_batch",
    ),
  );
  assert.equal(riderWithPendingOffer.phone, "08000000031");
  assert.ok(riderWithPendingOffer.profileImageUrl);
  assert.equal(riderWithPendingOffer.vehicleType, "Bike");

  const manualOfferWhileAutomaticPending = await sellerAgent
    .post(`/api/dispatch/batches/${batchId}/offers`)
    .send({ riderId });
  assert.equal(manualOfferWhileAutomaticPending.status, 409);

  const acceptResponse = await riderAgent.post(
    `/api/rider/dispatch/${automaticOffer.id}/accept`,
  );
  assert.equal(acceptResponse.status, 200);
  assert.equal(acceptResponse.body.assignments.length, 1);
  assert.equal(acceptResponse.body.batch.dispatchStatus, "rider_assigned");
  assert.equal(acceptResponse.body.assignments[0].seller_phone, "08000000030");

  const repeatedAcceptResponse = await riderAgent.post(
    `/api/rider/dispatch/${automaticOffer.id}/accept`,
  );
  assert.equal(repeatedAcceptResponse.status, 200);
  assert.equal(repeatedAcceptResponse.body.alreadyAccepted, true);
  assert.equal(repeatedAcceptResponse.body.assignments.length, 1);

  const dispatchesAfterAcceptance = await riderAgent.get(
    "/api/rider/dispatches/active",
  );
  assert.equal(dispatchesAfterAcceptance.status, 200);
  assert.equal(dispatchesAfterAcceptance.body.dispatches.length, 0);

  const riderDashboardAfterAcceptance = await riderAgent.get(
    "/api/rider/dashboard",
  );
  assert.equal(riderDashboardAfterAcceptance.status, 200);
  assert.equal(Array.isArray(riderDashboardAfterAcceptance.body.notifications), true);
  assert.equal(riderDashboardAfterAcceptance.body.stats.active, 1);
  assert.equal(riderDashboardAfterAcceptance.body.stats.newAssignments, 0);
  assert.ok(
    riderDashboardAfterAcceptance.body.activities.some(
      (activity) => activity.title === "Delivery accepted",
    ),
  );
  const acceptedAssignment = riderDashboardAfterAcceptance.body.assignments.find(
    (assignment) => assignment.id === acceptResponse.body.assignments[0].id,
  );
  assert.ok(acceptedAssignment);
  assert.equal(acceptedAssignment.sellerPhone, "08000000030");
  assert.ok(acceptedAssignment.pickupPoint.address);
  assert.equal(typeof acceptedAssignment.pickupPoint.lat, "number");
  assert.equal(typeof acceptedAssignment.pickupPoint.lng, "number");
  assert.match(acceptedAssignment.packageSummary, /small/i);
  assert.match(acceptedAssignment.packageSummary, /light/i);
  assert.equal(acceptedAssignment.buyerPhone, "");
  assert.equal(acceptedAssignment.deliveryDetails, "");

  const assignmentId = acceptResponse.body.assignments[0].id;
  const deliveryConversation = db.prepare(`
    SELECT * FROM conversations
    WHERE context_type = 'store'
      AND context_id = ?
      AND buyer_id = ?
      AND seller_id = ?
  `).get(`delivery_assignment:${assignmentId}`, riderId, sellerId);
  assert.ok(deliveryConversation?.id);

  db.prepare("UPDATE users SET avatar_url = ? WHERE id = ?").run(
    "/uploads/step-three-rider-avatar.jpg",
    riderId,
  );
  const riderConversationView = await riderAgent
    .get(`/api/messages/conversations/${deliveryConversation.id}`)
    .set("X-Gleenc-Portal", "rider");
  assert.equal(riderConversationView.status, 200);
  assert.equal(riderConversationView.body.conversation.otherUserName, "Step Three Seller");
  const sellerConversationView = await sellerAgent.get(
    `/api/messages/conversations/${deliveryConversation.id}`,
  );
  assert.equal(sellerConversationView.status, 200);
  assert.equal(sellerConversationView.body.conversation.otherUserName, "Step Three Rider");
  assert.equal(sellerConversationView.body.conversation.otherUserRole, "rider");
  assert.equal(
    sellerConversationView.body.conversation.otherUserAvatarUrl,
    "/uploads/step-three-rider-avatar.jpg",
  );

  db.prepare(
    "UPDATE rider_assignments SET delivery_fee_kobo = 250000 WHERE id = ?",
  ).run(assignmentId);
  const sellerPickupCode = generateOrderVerificationCode(
    "seller-pickup",
    orderId,
  );
  const pickupResponse = await riderAgent
    .post(`/api/rider/assignments/${assignmentId}/pickup`)
    .field("sellerPickupCode", sellerPickupCode)
    .field("proofNote", "Package collected from seller.")
    .field("locationLabel", acceptedAssignment.pickupPoint.address)
    .field(
      "proofLocation",
      JSON.stringify({
        lat: acceptedAssignment.pickupPoint.lat,
        lng: acceptedAssignment.pickupPoint.lng,
        accuracyMeters: 8,
      }),
    )
    .attach("proofPhoto", tinyPng, {
      filename: "pickup-proof.png",
      contentType: "image/png",
    });
  assert.equal(pickupResponse.status, 200);
  assert.equal(pickupResponse.body.assignment.status, "picked_up");

  const riderDashboardAfterPickup = await riderAgent.get(
    "/api/rider/dashboard",
  );
  const pickedUpAssignment = riderDashboardAfterPickup.body.assignments.find(
    (assignment) => assignment.id === assignmentId,
  );
  assert.equal(pickedUpAssignment.buyerPhone, "08000000032");
  assert.equal(pickedUpAssignment.deliveryDetails, "Reception desk, ground floor");
  assert.equal(pickedUpAssignment.deliveryLandmark, "Beside the main library");
  assert.equal(pickedUpAssignment.nearestBusStop, "FUPRE Main Gate");

  const orderForDeliveryCode = db
    .prepare("SELECT verification_code FROM orders WHERE id = ?")
    .get(orderId);
  const buyerDeliveryCode =
    orderForDeliveryCode.verification_code ||
    generateOrderVerificationCode("buyer-delivery", orderId);
  const deliveryCodeResponse = await riderAgent
    .post(`/api/rider/orders/${orderId}/verify-delivery-code`)
    .send({ customerDeliveryCode: buyerDeliveryCode });
  assert.equal(deliveryCodeResponse.status, 200);
  assert.ok(
    deliveryCodeResponse.body.assignment.buyerDeliveryCodeVerifiedAt,
  );

  const completeResponse = await riderAgent
    .post(`/api/rider/orders/${orderId}/complete-delivery`)
    .field("customerDeliveryCode", "")
    .field("proofNote", "Package handed to buyer.")
    .field("locationLabel", "Buyer delivery point")
    .field(
      "proofLocation",
      JSON.stringify({
        lat: orderRow.delivery_lat,
        lng: orderRow.delivery_lng,
        accuracyMeters: 9,
      }),
    )
    .attach("proofPhoto", tinyPng, {
      filename: "delivery-proof.png",
      contentType: "image/png",
    });
  assert.equal(completeResponse.status, 200);
  assert.equal(completeResponse.body.assignment.status, "delivered");

  const completedBuyerOrder = db.prepare(`
    SELECT status, stage4_status, fulfillment_status, delivery_status,
           dispatch_status, buyer_confirmed_at
    FROM orders
    WHERE id = ?
  `).get(orderId);
  assert.equal(completedBuyerOrder.status, "completed");
  assert.equal(completedBuyerOrder.stage4_status, "completed");
  assert.equal(completedBuyerOrder.fulfillment_status, "completed");
  assert.equal(completedBuyerOrder.delivery_status, "completed");
  assert.equal(completedBuyerOrder.dispatch_status, "completed");
  assert.ok(completedBuyerOrder.buyer_confirmed_at);

  const verifiedReviewResponse = await buyerAgent
    .post(`/api/orders/${orderId}/review`)
    .send({ rating: 4, body: "Well served and delivered successfully." });
  assert.equal(verifiedReviewResponse.status, 201);
  assert.equal(verifiedReviewResponse.body.review.rating, 4);
  const verifiedProductReview = db.prepare(`
    SELECT rating, verified_order_id, verified_purchase, body
    FROM product_comments
    WHERE product_id = ? AND user_id = ? AND verified_order_id = ?
  `).get(productId, buyerId, orderId);
  assert.equal(verifiedProductReview.rating, 4);
  assert.equal(verifiedProductReview.verified_order_id, orderId);
  assert.equal(Number(verifiedProductReview.verified_purchase), 1);
  assert.equal(
    verifiedProductReview.body,
    "Well served and delivered successfully.",
  );

  const riderDashboardAfterCompletion = await riderAgent.get(
    "/api/rider/dashboard",
  );
  assert.equal(riderDashboardAfterCompletion.status, 200);
  assert.equal(riderDashboardAfterCompletion.body.stats.active, 0);
  assert.equal(riderDashboardAfterCompletion.body.stats.completed, 1);
  assert.equal(riderDashboardAfterCompletion.body.earnings.today, 2500);
  assert.equal(
    riderDashboardAfterCompletion.body.earnings.riderPayoutPending,
    2500,
  );
  assert.ok(
    riderDashboardAfterCompletion.body.completed.some(
      (assignment) => assignment.id === assignmentId,
    ),
  );
  assert.ok(
    riderDashboardAfterCompletion.body.activities.some(
      (activity) => activity.title === "Delivery completed",
    ),
  );
  assert.ok(
    riderDashboardAfterCompletion.body.notifications.some(
      (notification) => notification.title === "Delivery completed",
    ),
  );
  assert.equal(
    db.prepare(
      "SELECT current_active_batch_count FROM rider_profiles WHERE user_id = ?",
    ).get(riderId).current_active_batch_count,
    0,
  );

  const manualRiderAgent = request.agent(app);
  const manualRiderRegister = await manualRiderAgent
    .post("/api/rider/register")
    .field("name", "Manual Choice Rider")
    .field("email", "manual-choice-rider@gleank.local")
    .field("password", "CampusRider987!")
    .field("phone", "08000000041")
    .field("campus", "FUPRE")
    .field("vehicleType", "Bike")
    .field("vehiclePlate", "MAN-400")
    .field("coverageArea", "FUPRE")
    .field("homeAddress", "Manual rider address")
    .field("gpsPermissionStatus", "gps_enabled")
    .field("transportType", "motorcycle")
    .field("maxPackageSize", "small_medium")
    .field("maxWeightClass", "up_to_medium")
    .field("fragileHandlingAbility", "can_handle_fragile")
    .field("deliveryBagType", "medium_delivery_bag")
    .attach("identityDocument", tinyPng, {
      filename: "manual-rider-id.png",
      contentType: "image/png",
    })
    .attach("selfie", tinyPng, {
      filename: "manual-rider-selfie.png",
      contentType: "image/png",
    });
  assert.equal(manualRiderRegister.status, 201);
  const manualRiderId = manualRiderRegister.body.user.id;
  const manualNow = new Date().toISOString();
  db.prepare(
    "UPDATE users SET phone_verified = 1, phone_verified_at = ?, email_verified = 1, email_verified_at = ? WHERE id = ?",
  ).run(manualNow, manualNow, manualRiderId);
  db.prepare(`
    UPDATE rider_profiles
    SET verification_status = 'verified',
        verification_level = 1,
        availability = 'offline',
        availability_mode = 'offline',
        gps_permission_status = 'gps_enabled',
        service_zone_ids = '["zone_fupre"]',
        current_zone_id = 'zone_fupre',
        last_location_at = ?,
        can_receive_auto_dispatch = 0,
        current_active_batch_count = 2,
        updated_at = ?
    WHERE user_id = ?
  `).run(manualNow, manualNow, manualRiderId);
  db.prepare(`
    UPDATE rider_presence_instances
    SET status = 'offline', updated_at = ?
    WHERE rider_id = ?
  `).run(manualNow, manualRiderId);

  const manualOrderResponse = await buyerAgent
    .post("/api/orders")
    .send({
      items: [{ productId, quantity: 1 }],
      buyerName: "Step Three Buyer",
      buyerPhone: "08000000032",
      campus: "FUPRE",
      deliveryOption: "Pickup",
      pickupLocation: "FUPRE main gate",
      paymentMethod: "pay_now",
    });
  assert.equal(manualOrderResponse.status, 201);
  const manualOrderId = manualOrderResponse.body.orders[0].id;

  const manualPayment = await buyerAgent
    .post("/api/payments/initialize")
    .send({ purpose: "store_order", targetId: manualOrderId });
  assert.equal(manualPayment.status, 201);
  const manualPaymentVerify = await request(app)
    .post("/api/payments/public/verify")
    .send({ reference: manualPayment.body.payment.reference });
  assert.equal(manualPaymentVerify.status, 200);

  const manualOrderItem = db
    .prepare("SELECT id FROM order_items WHERE order_id = ? LIMIT 1")
    .get(manualOrderId);
  const manualConfirm = await sellerAgent
    .post(`/api/seller/order-items/${manualOrderItem.id}/confirm-availability`)
    .send({ note: "Available for manual rider selection." });
  assert.equal(manualConfirm.status, 200);
  const manualBatchId = manualConfirm.body.pickupTask.deliveryBatchId;
  const manualReady = await sellerAgent
    .post(`/api/seller/pickup-tasks/${manualConfirm.body.pickupTask.id}/mark-ready`)
    .send({
      packageSize: "small",
      packageWeightClass: "light",
      handlingClass: "not_fragile",
      pickupPointConfirmed: true,
    });
  assert.equal(manualReady.status, 200);

  const manualCandidates = await sellerAgent.get(
    `/api/dispatch/batches/${manualBatchId}/rider-candidates`,
  );
  assert.equal(manualCandidates.status, 200);
  assert.ok(
    manualCandidates.body.riders.some((rider) => rider.id === manualRiderId),
  );
  const offlineCandidate = manualCandidates.body.riders.find(
    (rider) => rider.id === manualRiderId,
  );
  assert.equal(offlineCandidate.isOnline, false);
  assert.ok(offlineCandidate.lastActiveAt);
  assert.equal(offlineCandidate.phone, "08000000041");
  assert.ok(offlineCandidate.profileImageUrl);
  assert.equal(offlineCandidate.vehicleType, "Bike");
  assert.equal(offlineCandidate.coverageArea, "FUPRE");
  assert.equal(offlineCandidate.eligibleForThisOrder, true);
  assert.ok(
    offlineCandidate.compatibilityWarnings.includes(
      "rider_has_active_delivery",
    ),
  );
  assert.equal(offlineCandidate.successfulDeliveries, 0);

  const sellerManualOffer = await sellerAgent
    .post(`/api/dispatch/batches/${manualBatchId}/offers`)
    .send({ riderId: manualRiderId });
  assert.equal(sellerManualOffer.status, 201);
  assert.equal(sellerManualOffer.body.attempt.assignmentMode, "manual");
  assert.equal(sellerManualOffer.body.attempt.offerWindowSeconds, 600);

  const offlineRiderDispatches = await manualRiderAgent.get(
    "/api/rider/dispatches/active",
  );
  assert.equal(offlineRiderDispatches.status, 200);
  assert.equal(offlineRiderDispatches.body.dispatches.length, 1);

  const offlineManualAccept = await manualRiderAgent.post(
    `/api/rider/dispatch/${sellerManualOffer.body.attempt.id}/accept`,
  ).send({ presenceSessionId: "manual-rider-tab" });
  assert.equal(offlineManualAccept.status, 200);
  assert.equal(offlineManualAccept.body.batch.dispatchStatus, "rider_assigned");
  const onlineAfterAccept = db
    .prepare("SELECT availability FROM rider_profiles WHERE user_id = ?")
    .get(manualRiderId);
  assert.equal(onlineAfterAccept.availability, "online");

  const repeatedManualAccept = await manualRiderAgent.post(
    `/api/rider/dispatch/${sellerManualOffer.body.attempt.id}/accept`,
  ).send({ presenceSessionId: "manual-rider-tab" });
  assert.equal(repeatedManualAccept.status, 200);
  assert.equal(repeatedManualAccept.body.alreadyAccepted, true);

  const manualDispatchesAfterAcceptance = await manualRiderAgent.get(
    "/api/rider/dispatches/active",
  );
  assert.equal(manualDispatchesAfterAcceptance.status, 200);
  assert.equal(manualDispatchesAfterAcceptance.body.dispatches.length, 0);

  const secondTabHeartbeat = await manualRiderAgent
    .post("/api/rider/presence/heartbeat")
    .send({ presenceSessionId: "manual-rider-second-tab" });
  assert.equal(secondTabHeartbeat.status, 200);
  assert.equal(secondTabHeartbeat.body.riderProfile.availability, "online");

  const firstTabOffline = await manualRiderAgent
    .post("/api/rider/presence/offline")
    .send({ presenceSessionId: "manual-rider-tab" });
  assert.equal(firstTabOffline.status, 204);
  assert.equal(
    db.prepare("SELECT availability FROM rider_profiles WHERE user_id = ?").get(
      manualRiderId,
    ).availability,
    "online",
  );

  const secondTabOffline = await manualRiderAgent
    .post("/api/rider/presence/offline")
    .send({ presenceSessionId: "manual-rider-second-tab" });
  assert.equal(secondTabOffline.status, 204);
  assert.equal(
    db.prepare("SELECT availability FROM rider_profiles WHERE user_id = ?").get(
      manualRiderId,
    ).availability,
    "offline",
  );

  const generalSessionCheck = await manualRiderAgent.get("/api/auth/me");
  assert.equal(generalSessionCheck.status, 401);
  assert.equal(
    db.prepare("SELECT availability FROM rider_profiles WHERE user_id = ?").get(
      manualRiderId,
    ).availability,
    "offline",
  );

  const riderRelogin = await request.agent(app)
    .post("/api/rider/login")
    .send({
      email: "manual-choice-rider@gleank.local",
      password: "CampusRider987!",
    });
  assert.equal(riderRelogin.status, 200);
  assert.equal(riderRelogin.body.riderProfile.availability, "online");

  db.prepare(`
    UPDATE rider_presence_instances
    SET last_heartbeat_at = ?
    WHERE rider_id = ?
  `).run(new Date(Date.now() - 120_000).toISOString(), manualRiderId);
  expireStaleRiderPresence();
  assert.equal(
    db.prepare("SELECT availability FROM rider_profiles WHERE user_id = ?").get(
      manualRiderId,
    ).availability,
    "online",
  );

  db.prepare(`
    UPDATE rider_presence_instances
    SET last_heartbeat_at = ?
    WHERE rider_id = ?
  `).run(new Date(Date.now() - 16 * 60_000).toISOString(), manualRiderId);
  expireStaleRiderPresence();
  assert.equal(
    db.prepare("SELECT availability FROM rider_profiles WHERE user_id = ?").get(
      manualRiderId,
    ).availability,
    "offline",
  );
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
