import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import request from "supertest";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const testRoot = path.join(backendRoot, "data/test");
fs.mkdirSync(testRoot, { recursive: true });
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = "./data/test/gleank-test.sqlite";
process.env.UPLOADS_PATH = "./data/test/uploads";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-gleank-tests";
process.env.FRONTEND_URL = "http://localhost:5173";

fs.rmSync(path.join(testRoot, "gleank-test.sqlite"), { force: true });
fs.rmSync(path.join(testRoot, "uploads"), {
  recursive: true,
  force: true,
});

const { app } = await import("../src/app.js");

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
      password: "Gleank123!",
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
    .field("retainedImageUrls", "[]");

  assert.equal(productResponse.status, 201);
  assert.equal(productResponse.body.product.stock, 5);
  assert.equal(productResponse.body.product.price, 15000);
  assert.equal(productResponse.body.product.isFeatured, true);
  const productId = productResponse.body.product.id;

  const serviceResponse = await agent
    .post("/api/seller/services")
    .field("name", "Test Repair")
    .field("category", "Repairs")
    .field("description", "A test service.")
    .field("price", "5000")
    .field("durationMinutes", "45")
    .field("status", "active")
    .field("retainedImageUrls", "[]");

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

  const usedListingResponse = await agent
    .post("/api/used-market")
    .field("name", "Used Test Laptop")
    .field("category", "Laptops")
    .field("description", "A clean test laptop with charger and no hidden faults.")
    .field("condition", "Very Good")
    .field("price", "180000")
    .field("campus", "FUPRE")
    .field("pickupLocation", "Main gate")
    .field("deliveryOption", "Pickup")
    .field("serialNumber", "TEST-123")
    .attach("images", Buffer.from("test-image"), {
      filename: "used-item.png",
      contentType: "image/png",
    })
    .attach("ownershipProof", Buffer.from("test-proof"), {
      filename: "proof.png",
      contentType: "image/png",
    });

  assert.equal(usedListingResponse.status, 201);
  assert.equal(usedListingResponse.body.listing.status, "active");
  const usedListingId = usedListingResponse.body.listing.id;

  const usedMarketResponse = await request(app)
    .get("/api/used-market")
    .query({ q: "Test Laptop" });
  assert.equal(usedMarketResponse.status, 200);
  assert.equal(usedMarketResponse.body.listings.length, 1);

  const globalUsedSearchResponse = await request(app)
    .get("/api/stores")
    .query({ q: "Test Laptop" });
  assert.equal(globalUsedSearchResponse.status, 200);
  assert.equal(globalUsedSearchResponse.body.usedListings.length, 1);

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
  const originalPassword = "Gleank123!";
  const newPassword = "Gleank456!";

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
