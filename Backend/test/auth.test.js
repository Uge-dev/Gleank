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
const {
  backfillLegacyVerification,
  verificationRequirementDefinitions,
} = await import("../src/services/verification.service.js");

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
    });

  assert.equal(registerResponse.status, 201);
  assert.ok(registerResponse.headers["set-cookie"]?.[0].includes("gleank_session"));

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
    .field("campus", "FUPRE")
    .field("areaLocation", "FUPRE main campus")
    .field("pickupLocation", "Main gate")
    .field("deliveryOption", "Pickup")
    .field("serialNumber", "TEST-123")
    .field("defectsDisclosed", "No defects")
    .field("reasonForSelling", "Testing the protected used market flow.")
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
  const usedListingId = usedListingResponse.body.listing.id;

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

  const dashboardResponse = await riderAgent.get("/api/rider/dashboard");
  assert.equal(dashboardResponse.status, 200);

  const sellerStartResponse = await riderAgent
    .post("/api/seller/onboarding/start")
    .send({ storeName: "Should Not Convert Rider" });
  assert.equal(sellerStartResponse.status, 403);

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

  const sellerResponse = await buyerAgent
    .post("/api/seller/onboarding/start")
    .send({ storeName: "Buyer Store Attempt" });
  assert.equal(sellerResponse.status, 403);

  const riderResponse = await buyerAgent.get("/api/rider/dashboard");
  assert.equal(riderResponse.status, 403);
});

test("requirement verification supports independent rider resubmissions and liveness separation", async () => {
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

  const governmentResubmit = await riderAgent
    .post("/api/verification/requirements/rider_government_id/submissions")
    .field("payload", JSON.stringify({ idType: "NIN", idNumberReference: "ending-1234" }))
    .attach("identityDocument", tinyPng, {
      filename: "step2-rider-id-replacement.png",
      contentType: "image/png",
    });

  assert.equal(governmentResubmit.status, 201);
  const updatedGovernment = governmentResubmit.body.case.requirements.find((item) => item.code === "rider_government_id");
  const updatedSelfie = governmentResubmit.body.case.requirements.find((item) => item.code === "rider_identity_selfie");
  assert.equal(updatedGovernment.latestSubmission.version, 1);
  assert.equal(updatedSelfie.latestSubmission.version, 1);

  const secondGovernmentSubmission = await riderAgent
    .post("/api/verification/requirements/rider_government_id/submissions")
    .field(
      "payload",
      JSON.stringify({
        idType: "NIN",
        idNumberReference: "ending-5678",
      }),
    )
    .attach("identityDocument", tinyPng, {
      filename: "step2-rider-id-second-version.png",
      contentType: "image/png",
    });

  assert.equal(secondGovernmentSubmission.status, 201);
  const secondGovernment = secondGovernmentSubmission.body.case.requirements.find(
    (item) => item.code === "rider_government_id",
  );
  assert.equal(secondGovernment.latestSubmission.version, 2);

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

  const adminQueues = await adminAgent.get("/api/verification/admin/queues?role=rider");
  assert.equal(adminQueues.status, 200);
  const adminCase = adminQueues.body.cases.find((item) => item.userId === riderId);
  const adminGovernment = adminCase.requirements.find((item) => item.code === "rider_government_id");
  const adminLiveFace = adminCase.requirements.find((item) => item.code === "rider_live_face");

  const liveFaceApproveResponse = await adminAgent
    .patch(`/api/verification/admin/requirements/${adminLiveFace.id}/review`)
    .send({ action: "approve", feedback: "Attempting to approve static selfie as liveness." });
  assert.equal(liveFaceApproveResponse.status, 422);

  const reviewResponse = await adminAgent
    .patch(`/api/verification/admin/requirements/${adminGovernment.id}/review`)
    .send({ action: "approve", feedback: "Government ID approved after admin review." });
  assert.equal(reviewResponse.status, 200);

  const stageApproveResponse = await adminAgent
    .patch(`/api/verification/admin/cases/${adminCase.id}/level`)
    .send({ level: 1, reason: "Stage 1 requirements completed and approved." });
  assert.equal(stageApproveResponse.status, 200);
  assert.equal(stageApproveResponse.body.case.currentVerifiedLevel, 1);

  const profile = db.prepare("SELECT * FROM rider_profiles WHERE user_id = ?").get(riderId);
  assert.equal(profile.verification_status, "verified");
  assert.equal(profile.availability, "offline");

  const eligibilityResponse = await riderAgent.get("/api/rider/eligibility");
  assert.equal(eligibilityResponse.status, 200);
  assert.equal(eligibilityResponse.body.eligible, false);
  assert.ok(
    eligibilityResponse.body.blockingReasons.some((reason) => reason.code === "RIDER_OFFLINE"),
  );
  assert.ok(
    eligibilityResponse.body.blockingReasons.some((reason) => reason.code === "HEARTBEAT_STALE"),
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
    .field("stock", "3")
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

  const sellerOrderResponse = await sellerAgent.get(`/api/orders/${orderId}`);
  assert.equal(sellerOrderResponse.status, 200);
  assert.equal(sellerOrderResponse.body.order.verificationCode, "");

  const sellerPurchaseHistory = await sellerAgent.get("/api/orders");
  assert.equal(sellerPurchaseHistory.status, 200);
  assert.equal(sellerPurchaseHistory.body.orders.length, 0);

  const sellerBuyerOrders = await sellerAgent.get("/api/seller/orders");
  assert.equal(sellerBuyerOrders.status, 200);
  assert.ok(
    sellerBuyerOrders.body.orders.some((order) => order.id === orderId),
  );

  const sellerDeliveryAttempt = await sellerAgent
    .post(`/api/orders/${orderId}/verify-delivery`)
    .send({ verificationCode: buyerOrderResponse.body.order.verificationCode });
  assert.equal(sellerDeliveryAttempt.status, 403);
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

  const orderResponse = await buyerAgent
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
  assert.equal(orderResponse.status, 201);
  const orderId = orderResponse.body.orders[0].id;
  const orderRow = db.prepare("SELECT delivery_batch_id FROM orders WHERE id = ?").get(orderId);
  assert.ok(orderRow?.delivery_batch_id);

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

  const candidateResponse = await sellerAgent.get(`/api/dispatch/batches/${batchId}/rider-candidates`);
  assert.equal(candidateResponse.status, 200);
  assert.equal(candidateResponse.body.riders.length, 1);
  assert.equal(candidateResponse.body.riders[0].id, riderId);
  assert.equal(candidateResponse.body.riders[0].phone, undefined);
  assert.match(candidateResponse.body.riders[0].privacyNote, /Private phone/);

  const offerResponse = await sellerAgent
    .post(`/api/dispatch/batches/${batchId}/offers`)
    .send({ riderId });
  assert.equal(offerResponse.status, 201);
  assert.equal(offerResponse.body.attempt.status, "offered");
  assert.equal(offerResponse.body.attempt.offerWindowSeconds, 90);

  const secondOffer = await sellerAgent
    .post(`/api/dispatch/batches/${batchId}/offers`)
    .send({ riderId });
  assert.equal(secondOffer.status, 409);

  const riderDispatches = await riderAgent.get("/api/rider/dispatches/active");
  assert.equal(riderDispatches.status, 200);
  assert.equal(riderDispatches.body.dispatches.length, 1);
  assert.equal(riderDispatches.body.dispatches[0].batch.pickupTasks[0].pickupLandmark, "Pickup details unlock after acceptance");

  const acceptResponse = await riderAgent.post(`/api/rider/dispatch/${offerResponse.body.attempt.id}/accept`);
  assert.equal(acceptResponse.status, 200);
  assert.equal(acceptResponse.body.assignments.length, 1);
  assert.equal(acceptResponse.body.batch.dispatchStatus, "rider_assigned");

  const assignmentId = acceptResponse.body.assignments[0].id;
  const deliveryConversation = db.prepare(`
    SELECT * FROM conversations
    WHERE context_type = 'store'
      AND context_id = ?
      AND buyer_id = ?
      AND seller_id = ?
  `).get(`delivery_assignment:${assignmentId}`, riderId, sellerId);
  assert.ok(deliveryConversation?.id);
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
