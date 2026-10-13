import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import request from "supertest";
import sharp from "sharp";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gleenc-shared-test-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_PROVIDER: "sqlite",
  DATABASE_PATH: path.join(directory, "test.sqlite"),
  SHARED_PRIVATE_STORAGE_PATH: path.join(directory, "private"),
  STORAGE_PROVIDER: "local",
  JWT_SECRET: "shared-tests-secret-at-least-forty-eight-characters",
  AUTO_VERIFY_AUTH: "true",
  PAYMENT_PROVIDER: "local",
  EMAIL_PROVIDER: "",
  SMTP_HOST: "",
  BREVO_API_KEY: "",
  FRONTEND_URL: "http://localhost:5173",
});
const { app } = await import("../src/app.js");
const { db, transaction } = await import("../src/db/database.js");
const { TERMS_VERSION, now } = await import("../src/shared/core.js");
const { walletChange } = await import("../src/shared/checkout.js");
const { applyCharge } = await import("../src/shared/payments.js");
const { releaseEligible, applyRefund } =
  await import("../src/shared/orders.js");
const { publishDue } = await import("../src/shared/catalogue.js");
const tokens = {},
  users = {},
  products = {},
  posts = {};
const {createSession,sessionCookieName}=await import('../src/lib/session.js');
const webApi=(who,method,url,body,key)=>{const r=request(app)[method]('/api/v2'+url).set('Cookie',sessionCookieName+'='+createSession(users[who]).token).set('Origin','http://localhost:5173');if(body)r.send(body);if(key)r.set('Idempotency-Key',key);return r;};
const api = (who, method, url, body, key) => {
  const r = request(app)[method]("/api/v2" + url);
  if (tokens[who]) r.set("Authorization", "Bearer " + tokens[who]);
  if (key) r.set("Idempotency-Key", key);
  if (body) r.send(body);
  return r;
};
const expectOK = async (call) => {
  const r = await call;
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.data;
};
const address = {
  name: "Test buyer",
  phone: "08012345678",
  address: "12 Test Street",
  city: "Warri",
  state: "Delta",
  country: "Nigeria",
};
let mediaId, checkout, order, offerId;
test("mobile accounts authenticate with revocable tokens and cannot become admins", async () => {
  for (const who of ["seller", "buyer", "promoter", "outsider"]) {
    const d = await expectOK(
      api(null, "post", "/auth/register", {
        name: "Test " + who,
        email: who + "@shared.test",
        password: "StrongPassword123!",
        client: "mobile",
      }),
    );
    users[who] = d.user.id;
    tokens[who] = d.session.accessToken;
    await expectOK(api(who, "post", "/me/terms", { version: TERMS_VERSION }));
  }
  assert.equal((await api("buyer", "get", "/admin/finance")).status, 403);
  assert.equal((await api(null, "get", "/wallet")).status, 401);
  const session = await expectOK(
    api(null, "post", "/auth/login", {
      email: "outsider@shared.test",
      password: "StrongPassword123!",
    }),
  );
  const rotated = await expectOK(
    api(null, "post", "/auth/refresh", {
      refreshToken: session.session.refreshToken,
    }),
  );
  assert.equal(
    (
      await api(null, "post", "/auth/refresh", {
        refreshToken: session.session.refreshToken,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(app)
        .get("/api/v2/me")
        .set("Authorization", "Bearer " + rotated.accessToken)
    ).status,
    401,
  );
  assert.equal(
    (await api("buyer", "patch", "/me/profile", { role: "admin" })).status,
    422,
  );
});
test("cookie mutations enforce origin while the existing web contract still works", async () => {
  const web = request.agent(app);
  await web
    .post("/api/auth/login")
    .send({ email: "buyer@shared.test", password: "StrongPassword123!" })
    .expect(200);
  await web
    .post("/api/v2/me/terms")
    .send({ version: TERMS_VERSION })
    .expect(403);
  await web
    .post("/api/v2/me/terms")
    .set("Origin", "http://localhost:5173")
    .send({ version: TERMS_VERSION })
    .expect(200);
});
test("profile, selling settings and scanned product media use one identity", async () => {
  await expectOK(
    api("seller", "patch", "/me/profile", {
      profile: {
        name: "Seller",
        username: "sharedseller",
        country: "Nigeria",
        state: "Delta",
        city: "Warri",
        activities: ["selling"],
      },
    }),
  );
  await expectOK(
    api("seller", "put", "/me/selling", {
      name: "Shared Store",
      coverage: "Delta",
      deliveryFee: 0,
      deliveryDays: 2,
      dispatchAddress: "5 Seller Road",
      phone: "08012345678",
    }),
  );
  db.prepare(
    "UPDATE stores SET verified=1,verification_status='verified' WHERE owner_id=?",
  ).run(users.seller);
  const image = await sharp({
    create: { width: 12, height: 12, channels: 3, background: "#eeeeee" },
  })
    .png()
    .toBuffer();
  const r = await request(app)
    .post("/api/v2/media")
    .set("Authorization", "Bearer " + tokens.seller)
    .field("kind", "image")
    .attach("file", image, "product.png");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  mediaId = r.body.data.id;
  const other = await api("buyer", "post", "/products", {
    name: "Stolen image",
    description: "A normal product",
    category: "Kitchen",
    priceKobo: 500000,
    stock: 10,
    mediaIds: [mediaId],
    publication: "publish",
  });
  assert.equal(other.status, 422);
});
test("single, menu and digital products persist ordering separately from image/video", async () => {
  const base = {
    name: "Kitchen bowl",
    description: "A practical bowl for serving meals.",
    category: "Kitchen",
    priceKobo: 500000,
    stock: 20,
    mediaIds: [mediaId],
    publication: "publish",
    returnDays: 0,
  };
  products.single = await expectOK(api("seller", "post", "/products", base));
  assert.equal(products.single.state, "published");
  products.menu = await expectOK(
    api("seller", "post", "/products", {
      ...base,
      name: "Lunch menu",
      priceKobo: 0,
      ordering: {
        format: "menu",
        unit: "pack",
        components: [
          {
            id: "rice",
            name: "Rice",
            unit: "spoon",
            unitDescription: "One standard serving spoon",
            priceKobo: 100000,
            stock: 50,
            required: true,
            min: 1,
            max: 5,
          },
          {
            id: "chicken",
            name: "Chicken",
            unit: "piece",
            priceKobo: 150000,
            stock: 20,
            max: 3,
          },
        ],
      },
    }),
  );
  const feed = await expectOK(api("buyer", "get", "/feed"));
  posts.single = feed.posts.find((p) => p.product.id === products.single.id).id;
  const digital = await request(app)
    .post("/api/v2/media")
    .set("Authorization", "Bearer " + tokens.seller)
    .field("kind", "digital")
    .attach("file", Buffer.from("%PDF-1.4\nTest file\n%%EOF"), "guide.pdf");
  assert.equal(digital.status, 200, JSON.stringify(digital.body));
  products.digital = await expectOK(
    api("seller", "post", "/products", {
      ...base,
      name: "Digital guide",
      kind: "digital",
      fileIds: [digital.body.data.id],
    }),
  );
  assert.equal(products.digital.fileIds, undefined);
});
test("reshare and offers cap at 20 percent; original seller remains the owner", async () => {
  assert.equal(
    (
      await api("promoter", "post", "/posts/" + posts.single + "/reshare", {
        markupPercent: 21,
      })
    ).status,
    422,
  );
  posts.reshare = (
    await expectOK(
      api("promoter", "post", "/posts/" + posts.single + "/reshare", {
        markupPercent: 20,
      }),
    )
  ).id;
  const q = await expectOK(
    api("buyer", "post", "/quote", {
      productId: products.single.id,
      postId: posts.reshare,
    }),
  );
  assert.equal(q.ownerId, users.seller);
  assert.equal(q.promoterId, users.promoter);
  assert.equal(q.commissionKobo, 100000);
  assert.equal(
    (
      await api("buyer", "post", "/offers", {
        productId: products.single.id,
        discountPercent: 21,
      })
    ).status,
    422,
  );
  const offer = await expectOK(
    api("buyer", "post", "/offers", {
      productId: products.single.id,
      postId: posts.reshare,
      discountPercent: 20,
    }),
  );
  offerId = offer.id;
  assert.equal(
    (
      await api("outsider", "post", "/offers/" + offerId + "/answer", {
        decision: "accept",
      })
    ).status,
    404,
  );
  await expectOK(
    api("seller", "post", "/offers/" + offerId + "/answer", {
      decision: "accept",
    }),
  );
  const accepted = await expectOK(
    api("buyer", "post", "/quote", {
      productId: products.single.id,
      postId: posts.reshare,
      offerId,
    }),
  );
  assert.equal(accepted.sellerKobo, 400000);
  assert.equal(accepted.commissionKobo, 80000);
});
test("server quotes reject tampering and invalid menu quantities", async () => {
  assert.equal(
    (
      await api("buyer", "post", "/quote", {
        productId: products.single.id,
        totalKobo: 1,
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await api("buyer", "post", "/quote", {
        productId: products.menu.id,
        components: [],
      })
    ).status,
    422,
  );
  const q = await expectOK(
    api("buyer", "post", "/quote", {
      productId: products.menu.id,
      components: [
        { id: "rice", quantity: 2 },
        { id: "chicken", quantity: 1 },
      ],
    }),
  );
  assert.equal(q.sellerKobo, 350000);
  assert.equal(
    (
      await api("buyer", "post", "/quote", {
        productId: products.menu.id,
        components: [{ id: "rice", quantity: 6 }],
      })
    ).status,
    422,
  );
});
test("instant checkout reserves inventory and idempotency prevents duplicate checkout", async () => {
  const body = {
    items: [{ productId: products.single.id, postId: posts.reshare, offerId }],
    address,
    method: "wallet",
  };
  checkout = await expectOK(
    api("buyer", "post", "/checkouts", body, "instant-001"),
  );
  assert.equal(checkout.status, "ready");
  assert.equal(
    (await expectOK(api("buyer", "post", "/checkouts", body, "instant-001")))
      .id,
    checkout.id,
  );
  assert.equal(
    (
      await api(
        "buyer",
        "post",
        "/checkouts",
        { ...body, method: "paystack" },
        "instant-001",
      )
    ).status,
    409,
  );
  assert.equal(
    (await api("buyer", "post", "/checkouts", body, "instant-002")).status,
    409,
  );
  assert.equal(
    (await api("outsider", "get", "/checkouts/" + checkout.id)).status,
    404,
  );
  transaction(() =>
    walletChange(users.buyer, "available", 2000000, "test-credit"),
  );
  await expectOK(
    api("buyer", "post", "/checkouts/" + checkout.id + "/pay", {}),
  );
  await expectOK(
    api("buyer", "post", "/checkouts/" + checkout.id + "/pay", {}),
  );
  const orders = await expectOK(api("buyer", "get", "/orders"));
  assert.equal(orders.length, 1);
  order = orders[0];
  assert.equal(order.sellerId, users.seller);
  assert.equal(
    (await expectOK(api("seller", "get", "/wallet"))).heldKobo,
    400000,
  );
  assert.equal(
    (await expectOK(api("promoter", "get", "/wallet"))).heldKobo,
    80000,
  );
});
test("each physical unit has buyer-bound QR and only delivery confirmation releases held funds", async () => {
  const prepared = await expectOK(
    api("seller", "post", "/orders/" + order.id + "/prepare", {}),
  );
  const pkg = prepared.items[0].packages[0];
  assert.ok(pkg.code);
  const buyerView = await expectOK(api("buyer", "get", "/orders/" + order.id));
  assert.equal(buyerView.items[0].packages[0].code, undefined);
  await expectOK(
    api(
      "seller",
      "post",
      "/orders/" + order.id + "/packages/" + pkg.id + "/dispatch",
      {
        method: "personal",
        expectedArrival: new Date(Date.now() + 86400000).toISOString(),
      },
    ),
  );
  assert.equal(
    (
      await api(
        "seller",
        "post",
        "/orders/" + order.id + "/packages/" + pkg.id + "/confirm",
        { code: pkg.code, confirmReceived: true },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await api(
        "buyer",
        "post",
        "/orders/" + order.id + "/packages/" + pkg.id + "/confirm",
        { code: "WRONG", confirmReceived: true },
      )
    ).status,
    422,
  );
  await expectOK(
    api(
      "buyer",
      "post",
      "/orders/" + order.id + "/packages/" + pkg.id + "/confirm",
      { code: pkg.code, confirmReceived: true },
    ),
  );
  assert.equal(
    (
      await api(
        "buyer",
        "post",
        "/orders/" + order.id + "/packages/" + pkg.id + "/confirm",
        { code: pkg.code, confirmReceived: true },
      )
    ).status,
    409,
  );
  releaseEligible();
  releaseEligible();
  assert.equal(
    (await expectOK(api("seller", "get", "/wallet"))).availableKobo,
    400000,
  );
  assert.equal((await expectOK(api("seller", "get", "/wallet"))).heldKobo, 0);
  await expectOK(
    api("buyer", "post", "/lines/" + order.items[0].lineId + "/review", {
      rating: 5,
      body: "Great bowl",
    }),
  );
  const reviews = await expectOK(
    api(null, "get", "/products/" + products.single.id + "/reviews"),
  );
  assert.equal(reviews[0].verifiedPurchase, true);
});
test("selected cart checkout leaves unselected items, cancellation restores menu stock", async () => {
  const a = await expectOK(
    api("buyer", "post", "/cart", {
      productId: products.menu.id,
      components: [{ id: "rice", quantity: 2 }],
    }),
  );
  const b = await expectOK(
    api("buyer", "post", "/cart", { productId: products.single.id }),
  );
  const c = await expectOK(
    api(
      "buyer",
      "post",
      "/checkouts",
      { cartLineIds: [a.lineId], address, method: "wallet" },
      "cart-select-1",
    ),
  );
  await expectOK(api("buyer", "post", "/checkouts/" + c.id + "/cancel", {}));
  assert.equal((await expectOK(api("buyer", "get", "/cart"))).length, 2);
  const p = await expectOK(
    api(
      "buyer",
      "post",
      "/checkouts",
      { cartLineIds: [a.lineId], address, method: "wallet" },
      "cart-select-2",
    ),
  );
  await expectOK(api("buyer", "post", "/checkouts/" + p.id + "/pay", {}));
  const remaining = await expectOK(api("buyer", "get", "/cart"));
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].lineId, b.lineId);
});
test("digital payments unlock only buyer-bound, expiring single-use file grants", async () => {
  const c = await expectOK(
    webApi(
      "buyer",
      "post",
      "/checkouts",
      {
        items: [{ productId: products.digital.id }],
        method: "wallet",
        clientPlatform: "web",
      },
      "digital-001",
    ),
  );
  assert.equal((await api('buyer','post','/checkouts',{items:[{productId:products.digital.id}],method:'wallet',clientPlatform:'web'},'native-spoof-web')).status,422);
  assert.equal((await api('buyer','post','/checkouts/'+c.id+'/pay',{})).status,422);
  await expectOK(webApi("buyer", "post", "/checkouts/" + c.id + "/pay", {}));
  const lib = await expectOK(api("buyer", "get", "/library"));
  assert.equal(lib.length, 1);
  const grant = await expectOK(
    api("buyer", "post", "/library/" + lib[0].id + "/download-token", {
      mediaId: lib[0].files[0].id,
    }),
  );
  assert.equal(
    (await api("outsider", "post", "/library/download", { token: grant.token }))
      .status,
    404,
  );
  const file = await api("buyer", "post", "/library/download", {
    token: grant.token,
  });
  assert.equal(file.status, 200);
  assert.match(file.headers["content-type"], /pdf/);
  assert.equal(
    (await api("buyer", "post", "/library/download", { token: grant.token }))
      .status,
    404,
  );
  assert.equal(
    (await api("buyer", "get", "/media/" + lib[0].files[0].id + "/public"))
      .status,
    404,
  );
  assert.equal(
    (
      await api(
        "buyer",
        "post",
        "/checkouts",
        {
          items: [{ productId: products.digital.id }],
          method: "wallet",
          clientPlatform: "ios",
        },
        "digital-native",
      )
    ).status,
    422,
  );
});
test("chat delivery/read acknowledgements are explicit and attachments are private", async () => {
  const c = await expectOK(
    api("buyer", "post", "/conversations", { userId: users.promoter }),
  );
  const message = await expectOK(
    api(
      "buyer",
      "post",
      "/conversations/" + c.id + "/messages",
      { body: "Hello about the product" },
      "message-001",
    ),
  );
  assert.equal(message.status, "sent");
  assert.equal(
    (
      await expectOK(
        api(
          "buyer",
          "post",
          "/conversations/" + c.id + "/messages",
          { body: "Hello about the product" },
          "message-001",
        ),
      )
    ).id,
    message.id,
  );
  assert.equal(
    (await api("outsider", "get", "/conversations/" + c.id + "/messages"))
      .status,
    404,
  );
  const initial = await expectOK(
    api("promoter", "get", "/conversations/" + c.id + "/messages"),
  );
  assert.equal(initial.messages[0].status, "sent");
  await expectOK(
    api("promoter", "post", "/conversations/" + c.id + "/ack", {
      messageIds: [message.id],
      status: "read",
    }),
  );
  assert.equal(
    (
      await expectOK(
        api("buyer", "get", "/conversations/" + c.id + "/messages"),
      )
    ).messages[0].status,
    "read",
  );
  assert.equal(
    (
      await api(
        "promoter",
        "patch",
        "/conversations/" + c.id + "/messages/" + message.id,
        { action: "edit", body: "Forged" },
      )
    ).status,
    403,
  );
  await expectOK(
    api(
      "buyer",
      "patch",
      "/conversations/" + c.id + "/messages/" + message.id,
      { action: "edit", body: "Edited greeting" },
    ),
  );
  await expectOK(api("promoter", "put", "/me/blocks/" + users.buyer, {}));
  assert.equal(
    (
      await api(
        "buyer",
        "post",
        "/conversations/" + c.id + "/messages",
        { body: "Blocked greeting" },
        "message-002",
      )
    ).status,
    403,
  );
});
test("signed payment application verifies amounts and is idempotent", async () => {
  const c = await expectOK(
    api(
      "buyer",
      "post",
      "/checkouts",
      {
        items: [{ productId: products.single.id }],
        address,
        method: "paystack",
      },
      "provider-001",
    ),
  );
  assert.throws(
    () =>
      applyCharge({
        reference: c.reference,
        status: "success",
        currency: "NGN",
        amount: 1,
      }),
    /amount/,
  );
  applyCharge({
    reference: c.reference,
    status: "success",
    currency: "NGN",
    amount: c.amountKobo,
  });
  applyCharge({
    reference: c.reference,
    status: "success",
    currency: "NGN",
    amount: c.amountKobo,
  });
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM shared_orders WHERE checkout_id=?",
      )
      .get(c.id).count,
    1,
  );
});

test("variant stock and root stock prevent overselling and restore on cancellation", async () => {
  const product = await expectOK(
    api("seller", "post", "/products", {
      name: "Sized bowl",
      description: "Bowl with colour options",
      category: "Kitchen",
      priceKobo: 100000,
      stock: 1,
      mediaIds: [mediaId],
      publication: "publish",
      variants: [{ id: "red", color: "Red", stock: 1 }],
      returnDays: 0,
    }),
  );
  const a = await expectOK(
    api(
      "buyer",
      "post",
      "/checkouts",
      {
        items: [{ productId: product.id, variantId: "red" }],
        address,
        method: "wallet",
      },
      "variant-001",
    ),
  );
  assert.equal(
    (
      await api(
        "outsider",
        "post",
        "/checkouts",
        {
          items: [{ productId: product.id, variantId: "red" }],
          address,
          method: "wallet",
        },
        "variant-002",
      )
    ).status,
    409,
  );
  await expectOK(api("buyer", "post", "/checkouts/" + a.id + "/cancel", {}));
  const q = await expectOK(
    api("outsider", "post", "/quote", {
      productId: product.id,
      variantId: "red",
    }),
  );
  assert.equal(q.variant.stock, 1);
});
test("catalogue price inheritance and scheduled publication preserve draft visibility", async () => {
  const cat = await expectOK(
    api("seller", "post", "/catalogue", {
      name: "Bowl pricing",
      priceKobo: 250000,
      ordering: { format: "single" },
    }),
  );
  const product = await expectOK(
    api("seller", "post", "/products", {
      name: "Linked bowl",
      description: "Linked to the profile price catalogue",
      category: "Kitchen",
      priceKobo: 1,
      stock: 20,
      mediaIds: [mediaId],
      publication: "publish",
      catalogueId: cat.id,
    }),
  );
  assert.equal(product.priceKobo, 250000);
  await expectOK(
    api("seller", "put", "/catalogue/" + cat.id, {
      name: "Bowl pricing",
      priceKobo: 300000,
      ordering: { format: "single" },
    }),
  );
  assert.equal(
    (await expectOK(api("buyer", "get", "/products/" + product.id))).priceKobo,
    300000,
  );
  const scheduled = await expectOK(
    api("seller", "post", "/products", {
      name: "Tomorrow bowl",
      description: "Scheduled product",
      category: "Kitchen",
      priceKobo: 200000,
      stock: 2,
      mediaIds: [mediaId],
      publication: "schedule",
      publishAt: new Date(Date.now() + 3600000).toISOString(),
    }),
  );
  assert.equal(
    (await api("buyer", "get", "/products/" + scheduled.id)).status,
    404,
  );
  db.prepare("UPDATE shared_products SET publish_at=? WHERE product_id=?").run(
    new Date(Date.now() - 60000).toISOString(),
    scheduled.id,
  );
  publishDue();
  assert.equal(
    (await api("buyer", "get", "/products/" + scheduled.id)).status,
    200,
  );
  assert.equal(
    (
      await api("seller", "post", "/products", {
        name: "Bad schedule",
        description: "Invalid scheduled product",
        category: "Kitchen",
        priceKobo: 1,
        stock: 1,
        mediaIds: [mediaId],
        publication: "schedule",
        publishAt: new Date(Date.now() - 60000).toISOString(),
      })
    ).status,
    422,
  );
});
test("refunds require admin review, revoke digital access and credit wallet exactly once", async () => {
  const digitalOrder = (await expectOK(api("buyer", "get", "/orders"))).find(
    (o) => o.items.some((i) => i.productId === products.digital.id),
  );
  const line = digitalOrder.items[0];
  const issue = await expectOK(
    api("buyer", "post", "/lines/" + line.lineId + "/issues", {
      kind: "dispute",
      reason: "The digital file is not as described",
    }),
  );
  assert.equal(
    (
      await api("seller", "post", "/admin/issues/" + issue.id + "/resolve", {
        decision: "refund",
        note: "Refund approved",
      })
    ).status,
    403,
  );
  const { resolveIssue } = await import("../src/shared/orders.js");
  const adminId = "test-admin";
  db.prepare(
    "INSERT INTO users(id,name,email,password_hash,role,created_at,updated_at) VALUES(?,'Admin','admin@shared.test','unusable','admin',?,?)",
  ).run(adminId, now(), now());
  resolveIssue(adminId, issue.id, {
    decision: "refund",
    note: "Refund approved after review",
  });
  const refund = db
    .prepare("SELECT * FROM shared_refunds WHERE issue_id=?")
    .get(issue.id);
  const before = (await expectOK(api("buyer", "get", "/wallet"))).availableKobo;
  applyRefund(refund.id);
  applyRefund(refund.id);
  const after = (await expectOK(api("buyer", "get", "/wallet"))).availableKobo;
  assert.equal(after - before, Number(refund.amount_kobo));
  assert.equal((await expectOK(api("buyer", "get", "/library"))).length, 0);
});
test("private chat files cannot be downloaded by another account or through public media", async () => {
  const c = await expectOK(
    api("seller", "post", "/conversations", { userId: users.outsider }),
  );
  const file = await request(app)
    .post("/api/v2/media")
    .set("Authorization", "Bearer " + tokens.seller)
    .field("kind", "document")
    .attach("file", Buffer.from("Private receipt text"), "receipt.txt");
  assert.equal(file.status, 200);
  const media = file.body.data.id;
  await expectOK(
    api(
      "seller",
      "post",
      "/conversations/" + c.id + "/messages",
      { attachmentId: media },
      "private-file-001",
    ),
  );
  assert.equal(
    (await api("outsider", "get", "/media/" + media + "/private")).status,
    200,
  );
  assert.equal(
    (await api("buyer", "get", "/media/" + media + "/private")).status,
    404,
  );
  assert.equal(
    (await api(null, "get", "/media/" + media + "/public")).status,
    404,
  );
});
test("reports and grouped activity retain actor avatars and accurate totals", async () => {
  await expectOK(
    api("buyer", "post", "/products/" + products.single.id + "/like", {}),
  );
  await expectOK(
    api("outsider", "post", "/products/" + products.single.id + "/like", {}),
  );
  const n = await expectOK(api("seller", "get", "/notifications"));
  const likes = n.notifications.find(
    (n) => n.kind === "like" && n.targetId === products.single.id,
  );
  assert.equal(likes.count, 2);
  assert.equal(likes.actors.length, 2);
  assert.equal(likes.othersCount, 0);
  assert.ok(n.unreadCount > 0);
  const report = await expectOK(
    api("buyer", "post", "/reports", {
      kind: "product",
      targetId: products.single.id,
      reason: "other",
      details: "Please check the item",
    }),
  );
  assert.ok(report.id);
  await expectOK(
    api("seller", "post", "/notifications/read", { ids: [likes.id] }),
  );
});
test("late successful payments are isolated for refund rather than creating unreserved orders", async () => {
  const c = await expectOK(
    api(
      "outsider",
      "post",
      "/checkouts",
      {
        items: [{ productId: products.single.id }],
        address,
        method: "paystack",
      },
      "late-payment-001",
    ),
  );
  await expectOK(api("outsider", "post", "/checkouts/" + c.id + "/cancel", {}));
  applyCharge({
    reference: c.reference,
    status: "success",
    currency: "NGN",
    amount: c.amountKobo,
  });
  applyCharge({
    reference: c.reference,
    status: "success",
    currency: "NGN",
    amount: c.amountKobo,
  });
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM shared_orders WHERE checkout_id=?",
      )
      .get(c.id).count,
    0,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS count FROM shared_payment_recoveries WHERE checkout_id=?",
      )
      .get(c.id).count,
    1,
  );
  assert.equal(
    db.prepare("SELECT status FROM shared_checkouts WHERE id=?").get(c.id)
      .status,
    "refund_required",
  );
});
test("Google identity verifies pinned keys, nonce and audience without unsafe email auto-linking", async () => {
  const crypto = await import("node:crypto"),
    jwt = (await import("jsonwebtoken")).default;
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: "jwk" });
  Object.assign(jwk, { kid: "test-google-key", use: "sig", alg: "RS256" });
  const originalFetch = globalThis.fetch;
  process.env.GOOGLE_CLIENT_IDS = "test-client";
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://www.googleapis.com/oauth2/v3/certs");
    return { ok: true, json: async () => ({ keys: [jwk] }) };
  };
  try {
    const challenge = await expectOK(api(null, "post", "/auth/challenge", {}));
    const token = jwt.sign(
      {
        sub: "google-subject-123",
        email: "google-user@shared.test",
        email_verified: true,
        nonce: challenge.nonce,
      },
      privateKey,
      {
        algorithm: "RS256",
        keyid: jwk.kid,
        issuer: "https://accounts.google.com",
        audience: "test-client",
        expiresIn: 300,
      },
    );
    const identity = await expectOK(
      api(null, "post", "/auth/identity", {
        provider: "google",
        idToken: token,
        challengeId: challenge.id,
        nonce: challenge.nonce,
      }),
    );
    assert.equal(identity.user.emailVerified, true);
    assert.equal(
      (
        await api(null, "post", "/auth/identity", {
          provider: "google",
          idToken: token,
          challengeId: challenge.id,
          nonce: challenge.nonce,
        })
      ).status,
      401,
    );
    const other = await expectOK(api(null, "post", "/auth/challenge", {}));
    const wrong = jwt.sign(
      {
        sub: "wrong-subject",
        email: "buyer@shared.test",
        email_verified: true,
        nonce: other.nonce,
      },
      privateKey,
      {
        algorithm: "RS256",
        keyid: jwk.kid,
        issuer: "https://accounts.google.com",
        audience: "test-client",
        expiresIn: 300,
      },
    );
    assert.equal(
      (
        await api(null, "post", "/auth/identity", {
          provider: "google",
          idToken: wrong,
          challengeId: other.id,
          nonce: other.nonce,
        })
      ).status,
      409,
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GOOGLE_CLIENT_IDS;
  }
});
test("deletion refuses accounts with unsettled balances and disables an eligible empty account", async () => {
  assert.equal(
    (
      await api("buyer", "post", "/me/deletion", {
        password: "StrongPassword123!",
        confirm: "DELETE",
      })
    ).status,
    409,
  );
  const signup = await expectOK(
    api(null, "post", "/auth/register", {
      name: "Delete account",
      email: "delete@shared.test",
      password: "StrongPassword123!",
    }),
  );
  tokens.deleting = signup.session.accessToken;
  const deletion = await expectOK(
    api("deleting", "post", "/me/deletion", {
      password: "StrongPassword123!",
      confirm: "DELETE",
    }),
  );
  assert.equal(deletion.status, "pending");
  assert.equal((await api("deleting", "get", "/me")).status, 401);
});

test("withdrawal retries submit once, verify the beneficiary and ignore stale failure after success", async () => {
  const { env } = await import("../src/config/env.js");
  const { applyWithdrawal } = await import("../src/shared/payments.js");
  const provider = env.paymentProvider,
    secret = env.paystackSecretKey,
    originalFetch = globalThis.fetch;
  let submissions = 0,
    reference;
  db.prepare(
    "INSERT INTO commerce_payout_recipients(user_id,recipient_code,account_name,bank_code,account_last4,updated_at) VALUES(?,?,?,?,?,?)",
  ).run(users.promoter, "RCP_verified", "Promoter", "001", "1234", now());
  env.paymentProvider = "paystack";
  env.paystackSecretKey = "sk_test_shared";
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith("https://api.paystack.co/"));
    if (String(url).endsWith("/transfer")) {
      submissions++;
      reference = JSON.parse(options.body).reference;
      return {
        ok: true,
        json: async () => ({
          status: true,
          data: { status: "pending", reference },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        status: true,
        data: {
          reference,
          status: "success",
          amount: 20000,
          currency: "NGN",
          recipient: { recipient_code: "RCP_verified" },
        },
      }),
    };
  };
  try {
    const first = await expectOK(
      api(
        "promoter",
        "post",
        "/wallet/withdrawals",
        { amountKobo: 20000 },
        "withdrawal-001",
      ),
    );
    const second = await expectOK(
      api(
        "promoter",
        "post",
        "/wallet/withdrawals",
        { amountKobo: 20000 },
        "withdrawal-001",
      ),
    );
    assert.equal(first.id, second.id);
    assert.equal(submissions, 1);
    const verified = await expectOK(
      api(
        "promoter",
        "post",
        "/wallet/withdrawals/" + first.id + "/verify",
        {},
      ),
    );
    assert.equal(verified.status, "success");
    assert.throws(
      () =>
        applyWithdrawal({
          reference,
          status: "success",
          amount: 20000,
          currency: "NGN",
          recipient: { recipient_code: "RCP_attacker" },
        }),
      /beneficiary/,
    );
    const before = (await expectOK(api("promoter", "get", "/wallet")))
      .availableKobo;
    applyWithdrawal({
      reference,
      status: "failed",
      amount: 20000,
      currency: "NGN",
      recipient: { recipient_code: "RCP_verified" },
    });
    assert.equal(
      (await expectOK(api("promoter", "get", "/wallet"))).availableKobo,
      before,
    );
    applyWithdrawal({
      reference,
      status: "reversed",
      amount: 20000,
      currency: "NGN",
      recipient: { recipient_code: "RCP_verified" },
    });
    applyWithdrawal({
      reference,
      status: "reversed",
      amount: 20000,
      currency: "NGN",
      recipient: { recipient_code: "RCP_verified" },
    });
    assert.equal(
      (await expectOK(api("promoter", "get", "/wallet"))).availableKobo,
      before + 20000,
    );
  } finally {
    env.paymentProvider = provider;
    env.paystackSecretKey = secret;
    globalThis.fetch = originalFetch;
  }
});
test("Paystack webhooks require a raw-body signature and fetch canonical provider data", async () => {
  const crypto = await import("node:crypto"),
    { env } = await import("../src/config/env.js");
  const provider = env.paymentProvider,
    secret = env.paystackSecretKey,
    originalFetch = globalThis.fetch;
  env.paymentProvider = "paystack";
  env.paystackSecretKey = "sk_test_shared_webhook";
  const c = await expectOK(
    api(
      "outsider",
      "post",
      "/checkouts",
      {
        items: [{ productId: products.single.id }],
        address,
        method: "paystack",
      },
      "webhook-checkout",
    ),
  );
  const body = {
      event: "charge.success",
      data: { reference: c.reference, amount: 1 },
    },
    raw = JSON.stringify(body);
  let verifies = 0;
  globalThis.fetch = async () => {
    verifies++;
    return {
      ok: true,
      json: async () => ({
        status: true,
        data: {
          reference: c.reference,
          status: "success",
          currency: "NGN",
          amount: c.amountKobo,
        },
      }),
    };
  };
  try {
    await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", "0".repeat(128))
      .send(raw)
      .expect(401);
    assert.equal(verifies, 0);
    const signature = crypto
      .createHmac("sha512", env.paystackSecretKey)
      .update(raw)
      .digest("hex");
    await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signature)
      .send(raw)
      .expect(200);
    assert.equal(verifies, 1);
    assert.equal(
      db.prepare("SELECT status FROM shared_checkouts WHERE id=?").get(c.id)
        .status,
      "paid",
    );
  } finally {
    env.paymentProvider = provider;
    env.paystackSecretKey = secret;
    globalThis.fetch = originalFetch;
  }
});

test("legacy web products retain net/gross pricing and size choices in shared checkout", async () => {
  const store = db
    .prepare("SELECT id FROM stores WHERE owner_id=?")
    .get(users.seller);
  const key = "legacy-priced-product";
  db.prepare(
    "INSERT INTO products(id,store_id,name,slug,category,description,price_kobo,seller_price_kobo,buyer_price_kobo,platform_fee_kobo,stock,status,image_urls,available_sizes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    key,
    store.id,
    "Legacy sized bowl",
    key,
    "Kitchen",
    "A historically priced bowl",
    525000,
    500000,
    525000,
    25000,
    20,
    "active",
    "[]",
    JSON.stringify(["Small", "Large"]),
    now(),
    now(),
  );
  const product = await expectOK(api("buyer", "get", "/products/" + key));
  assert.equal(product.priceKobo, 500000);
  assert.equal(product.variants.length, 2);
  const quote = await expectOK(
    api("buyer", "post", "/quote", {
      productId: key,
      variantId: product.variants[0].id,
    }),
  );
  assert.equal(quote.sellerKobo, 500000);
  assert.equal(quote.platformKobo, 25000);
  assert.equal(quote.totalKobo, 525000);
});

test('accepted legacy offers cannot use a later price or changed product options', async () => {
  const key = 'legacy-priced-product';
  const product = await expectOK(api('buyer', 'get', '/products/' + key));
  const selection = { productId: key, variantId: product.variants[0].id };
  const offer = await expectOK(api('buyer', 'post', '/offers', { ...selection, discountPercent: 20 }));
  await expectOK(api('seller', 'post', '/offers/' + offer.id + '/answer', { decision: 'accept' }));
  const quote = await expectOK(api('buyer', 'post', '/quote', { ...selection, offerId: offer.id }));
  assert.equal(quote.sellerKobo, 400000);
  db.prepare('UPDATE products SET seller_price_kobo=600000,buyer_price_kobo=630000,price_kobo=630000,platform_fee_kobo=30000 WHERE id=?').run(key);
  assert.equal((await api('buyer', 'post', '/quote', { ...selection, offerId: offer.id })).status, 409);
  // Even a manually stale version cannot revive a different agreed base price.
  const changed = await expectOK(api('buyer', 'get', '/products/' + key));
  assert.notEqual(changed.version, product.version);
  db.prepare('UPDATE shared_offers SET product_version=? WHERE id=?').run(changed.version, offer.id);
  assert.equal((await api('buyer', 'post', '/quote', { ...selection, offerId: offer.id })).status, 409);
});

test('legacy seller mutations reject configured products without altering shared pricing or publication', async () => {
  const { updateProduct, deleteProduct } = await import('../src/services/listing.service.js');
  const { publishProductAfterValidation, updateProductAvailability, validateProductForPublication } = await import('../src/services/moderation.service.js');
  const { updateSellerProductStock } = await import('../src/services/logistics.service.js');
  const key = products.menu.id;
  const original = db.prepare('SELECT data_json,state,version FROM shared_products WHERE product_id=?').get(key);
  const conflict = error => error.status === 409;
  assert.throws(() => updateProduct(users.seller, key, {}, []), conflict);
  assert.throws(() => deleteProduct(users.seller, key), conflict);
  assert.throws(() => validateProductForPublication({ user_id: users.seller, role: 'buyer' }, key), conflict);
  assert.throws(() => updateSellerProductStock({ user_id: users.seller, role: 'seller' }, key, { quantity: 999 }), conflict);
  assert.throws(() => publishProductAfterValidation({ user_id: users.seller, role: 'buyer' }, key), conflict);
  assert.throws(() => updateProductAvailability({ user_id: users.seller, role: 'buyer' }, key, { availabilityStatus: 'out_of_stock' }), conflict);
  assert.deepEqual(db.prepare('SELECT data_json,state,version FROM shared_products WHERE product_id=?').get(key), original);
  const reserved = await expectOK(api('buyer', 'post', '/checkouts', { items: [{ productId: 'legacy-priced-product', variantId: (await expectOK(api('buyer', 'get', '/products/legacy-priced-product'))).variants[0].id }], address, method: 'paystack' }, 'legacy-reservation-guard'));
  assert.throws(() => updateProduct(users.seller, 'legacy-priced-product', {}, []), conflict);
  assert.throws(() => deleteProduct(users.seller, 'legacy-priced-product'), conflict);
  await expectOK(api('buyer', 'post', '/checkouts/' + reserved.id + '/cancel', {}));
});

test('legacy admin review preserves schedules and prevents sellers reactivating flagged shared posts', async () => {
  const { adminReviewProduct } = await import('../src/services/moderation.service.js');
  const adminId = db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get().id;
  const product = await expectOK(api('seller', 'post', '/products', {
    name: 'Moderated scheduled bowl', description: 'A product for scheduled publication', category: 'Kitchen',
    priceKobo: 200000, stock: 5, mediaIds: [mediaId], publication: 'schedule',
    publishAt: new Date(Date.now() + 3600000).toISOString(),
  }));
  const auth = { user_id: adminId, role: 'admin' };
  adminReviewProduct(auth, product.id, { action: 'approve' });
  assert.equal(db.prepare('SELECT state FROM shared_products WHERE product_id=?').get(product.id).state, 'scheduled');
  assert.equal(db.prepare('SELECT status FROM products WHERE id=?').get(product.id).status, 'draft');
  assert.equal((await api('buyer', 'get', '/products/' + product.id)).status, 404);
  db.prepare('UPDATE shared_products SET publish_at=? WHERE product_id=?').run(new Date(Date.now() - 60000).toISOString(), product.id);
  publishDue();
  assert.equal((await api('buyer', 'get', '/products/' + product.id)).status, 200);
  adminReviewProduct(auth, product.id, { action: 'flag' });
  assert.equal((await api('buyer', 'get', '/products/' + product.id)).status, 404);
  assert.equal((await api('seller', 'put', '/products/' + product.id + '/availability', { active: true })).status, 409);
  adminReviewProduct(auth, product.id, { action: 'reject' });
  assert.equal((await api('seller', 'put', '/products/' + product.id + '/availability', { active: true })).status, 409);
});

test('product and reshare archival is owner-only and retains paid order records', async () => {
  const key = products.single.id;
  const count = db.prepare('SELECT COUNT(*) AS total FROM shared_order_lines WHERE product_id=?').get(key).total;
  assert.ok(Number(count) > 0);
  assert.equal((await api('outsider', 'delete', '/products/' + key)).status, 404);
  await expectOK(api('seller', 'delete', '/products/' + key));
  assert.equal((await api('buyer', 'get', '/products/' + key)).status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM shared_order_lines WHERE product_id=?').get(key).total, count);
  await expectOK(api('seller', 'put', '/products/' + key + '/availability', { active: true }));
  assert.equal((await api('buyer', 'get', '/products/' + key)).status, 200);
  assert.equal((await api('outsider', 'delete', '/posts/' + posts.reshare)).status, 404);
  await expectOK(api('promoter', 'delete', '/posts/' + posts.reshare));
  assert.equal(db.prepare('SELECT active FROM shared_posts WHERE id=?').get(posts.reshare).active, 0);
});


test('package-profile changes require the owning seller and legacy shared references can be archived safely', async () => {
  const { applyProductPackageProfile } = await import('../src/services/logistics.service.js');
  const { deleteProduct } = await import('../src/services/listing.service.js');
  const original = db.prepare('SELECT package_size FROM products WHERE id=?').get(products.menu.id);
  assert.throws(() => applyProductPackageProfile(products.menu.id, { packageSize: 'large' }, { actorId: users.outsider, adminVerified: true }), error => error.status === 403);
  assert.deepEqual(db.prepare('SELECT package_size FROM products WHERE id=?').get(products.menu.id), original);
  const legacyId = 'legacy-priced-product';
  await expectOK(api('buyer', 'post', '/cart', { productId: legacyId, variantId: (await expectOK(api('buyer', 'get', '/products/' + legacyId))).variants[0].id }));
  assert.throws(() => deleteProduct(users.seller, legacyId), error => error.status === 409);
  await expectOK(api('seller', 'delete', '/products/' + legacyId));
  assert.equal((await api('buyer', 'get', '/products/' + legacyId)).status, 404);
  assert.ok(db.prepare('SELECT id FROM products WHERE id=?').get(legacyId));
});
