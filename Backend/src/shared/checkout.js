import { z } from "zod";
import { db, transaction } from "../db/database.js";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import {
  id,
  now,
  hash,
  json,
  parse,
  lockUsers,
  assertUnblocked,
  assertAmount,
  notify,
  assertUser,
} from "./core.js";
import { checkoutSchema, selectionSchema } from "./schemas.js";
import { productRow, publicProduct } from "./catalogue.js";
export function quoteSelection(userId, raw, { offer = true } = {}) {
  const input = selectionSchema.parse(raw),
    p = productRow(input.productId, userId),
    d = p.details;
  if (p.owner_id === userId)
    throw new HttpError(422, "You cannot purchase your own product.");
  if (p.status !== "active" || p.stock < input.quantity)
    throw new HttpError(
      409,
      "This product is unavailable in the selected quantity.",
    );
  if (d.kind === "digital" && input.quantity !== 1)
    throw new HttpError(422, "Buy one digital licence per checkout line.");
  let base = d.priceKobo,
    selectedVariant = null;
  if (d.variants?.length) {
    selectedVariant = d.variants.find((v) => v.id === input.variantId);
    if (!selectedVariant || selectedVariant.stock < input.quantity)
      throw new HttpError(422, "Select an available size/colour variant.");
    base = selectedVariant.priceKobo ?? base;
  } else if (input.variantId)
    throw new HttpError(422, "This product has no selected variant.");
  const selections = new Map(input.components.map((c) => [c.id, c.quantity]));
  if (selections.size !== input.components.length)
    throw new HttpError(422, "Choose each component once.");
  const components = d.ordering.components || [],
    menu = ["menu", "pack_extras"].includes(d.ordering.format);
  if (!menu && selections.size)
    throw new HttpError(422, "This product does not use menu quantities.");
  if (menu) {
    if (d.ordering.format === "menu") base = 0;
    for (const selected of selections.keys())
      if (!components.some((c) => c.id === selected))
        throw new HttpError(422, "A selected menu item does not exist.");
    let total = 0;
    for (const c of components) {
      const q = selections.get(c.id) || 0;
      if (
        (c.required && q < Math.max(1, c.min)) ||
        (q > 0 && q < c.min) ||
        q > c.max ||
        q * input.quantity > c.stock
      )
        throw new HttpError(422, `Check the quantity for ${c.name}.`);
      base += q * c.priceKobo;
      total += q;
    }
    if (d.ordering.format === "menu" && !total)
      throw new HttpError(422, "Choose at least one menu item.");
  }
  base = assertAmount(base + (d.ordering.packagingKobo || 0));
  let promoterId = null,
    markupBps = 0;
  if (input.postId) {
    const post = db
      .prepare(
        "SELECT * FROM shared_posts WHERE id=? AND product_id=? AND active=1",
      )
      .get(input.postId, p.id);
    if (!post)
      throw new HttpError(422, "This post does not match the product.");
    if (post.original_id) {
      if (
        post.author_id === userId ||
        post.author_id === p.owner_id ||
        !d.reshareEnabled
      )
        throw new HttpError(422, "This referral cannot earn on this purchase.");
      assertUnblocked(userId, post.author_id);
      promoterId = post.author_id;
      markupBps = Number(post.markup_bps);
    }
  }
  const signature = hash(json({ ...input, offerId: undefined }));
  let discountBps = 0;
  if (input.offerId && offer) {
    const o = db
      .prepare(
        "SELECT * FROM shared_offers WHERE id=? AND buyer_id=? AND product_id=? AND status='accepted' AND expires_at>?",
      )
      .get(input.offerId, userId, p.id, now());
    if (
      !o ||
      o.product_version !== p.version ||
      Number(parse(o.quoted_json).sellerKobo) !== base * input.quantity ||
      hash(json({ ...parse(o.input_json), offerId: undefined })) !== signature
    )
      throw new HttpError(
        409,
        "Your accepted offer expired or its product options changed.",
      );
    discountBps = Number(o.discount_bps);
  }
  const sellerUnit = assertAmount(
    base - Math.floor((base * discountBps) / 10000),
  );
  const commissionUnit = assertAmount(
    Math.floor((sellerUnit * markupBps) / 10000),
  );
  const platformUnit = assertAmount(
    p.data_json
      ? Math.round((sellerUnit * Number(env.platformFeePercent)) / 100)
      : Math.round(
          base
            ? (Number(
                p.platform_fee_kobo ||
                  Math.max(
                    0,
                    Number(p.buyer_price_kobo || p.price_kobo) - base,
                  ),
              ) *
                sellerUnit) /
                base
            : 0,
        ),
  );
  const unitPriceKobo = assertAmount(
    sellerUnit + commissionUnit + platformUnit,
  );
  return {
    input,
    productId: p.id,
    ownerId: p.owner_id,
    productVersion: p.version,
    product: publicProduct(p),
    kind: d.kind,
    fileIds: d.fileIds || [],
    quantity: input.quantity,
    variant: selectedVariant,
    components: components
      .filter((c) => selections.get(c.id))
      .map((c) => ({ ...c, quantity: selections.get(c.id) })),
    sellerKobo: sellerUnit * input.quantity,
    commissionKobo: commissionUnit * input.quantity,
    platformKobo: platformUnit * input.quantity,
    promoterId,
    markupBps,
    discountBps,
    unitPriceKobo,
    totalKobo: assertAmount(unitPriceKobo * input.quantity),
    deliveryKobo:
      d.kind === "digital"
        ? 0
        : Number(
            d.deliveryKobo ??
              db
                .prepare(
                  "SELECT delivery_fee_kobo FROM seller_fulfillment_settings WHERE user_id=?",
                )
                .get(p.owner_id)?.delivery_fee_kobo ??
              0,
          ),
    returnDays: d.returnDays || 0,
  };
}
export function publicQuote(q) {
  const value = { ...q };
  delete value.fileIds;
  return value;
}
export function listCartV2(userId) {
  return db
    .prepare(
      "SELECT * FROM shared_cart WHERE user_id=? ORDER BY updated_at DESC",
    )
    .all(userId)
    .map((r) => {
      try {
        return {
          lineId: r.id,
          ...publicQuote(quoteSelection(userId, parse(r.input_json))),
          available: true,
        };
      } catch {
        return { lineId: r.id, input: parse(r.input_json), available: false };
      }
    });
}
export function putCartV2(userId, lineId, raw) {
  const input = selectionSchema.parse(raw);
  quoteSelection(userId, input);
  if (
    lineId &&
    !db
      .prepare("SELECT id FROM shared_cart WHERE id=? AND user_id=?")
      .get(lineId, userId)
  )
    throw new HttpError(404, "Cart line not found.");
  const key = lineId || id("cart");
  db.prepare(
    `INSERT INTO shared_cart(id,user_id,product_id,input_json,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET product_id=excluded.product_id,input_json=excluded.input_json,updated_at=excluded.updated_at`,
  ).run(key, userId, input.productId, json(input), now());
  return { lineId: key, cart: listCartV2(userId) };
}
export function changeStock(q, sign) {
  const result = db
    .prepare(
      sign < 0
        ? "UPDATE products SET stock=stock-? WHERE id=? AND stock>=?"
        : "UPDATE products SET stock=stock+? WHERE id=?",
    )
    .run(
      ...(sign < 0
        ? [q.quantity, q.productId, q.quantity]
        : [q.quantity, q.productId]),
    );
  if (result.changes !== 1)
    throw new HttpError(409, "Stock changed. Refresh product quantities.");
  const row = db
    .prepare("SELECT data_json FROM shared_products WHERE product_id=?")
    .get(q.productId);
  if (row) {
    const d = parse(row.data_json);
    if (q.variant) {
      const v = d.variants.find((v) => v.id === q.variant.id);
      if (!v) throw new HttpError(409, "The selected variant changed.");
      v.stock += sign * q.quantity;
      if (v.stock < 0)
        throw new HttpError(409, "The selected variant sold out.");
    }
    for (const c of q.components) {
      const item = d.ordering.components.find((x) => x.id === c.id);
      if (!item) throw new HttpError(409, "The selected menu item changed.");
      item.stock += sign * c.quantity * q.quantity;
      if (item.stock < 0)
        throw new HttpError(409, "A selected menu component sold out.");
    }
    db.prepare("UPDATE shared_products SET data_json=? WHERE product_id=?").run(
      json(d),
      q.productId,
    );
  }
}
function lockProducts(ids) {
  for (const productId of [...new Set(ids)].sort())
    db.prepare("UPDATE products SET updated_at=updated_at WHERE id=?").run(
      productId,
    );
}
export function beginCheckout(userId, raw, key) {
  if (
    db
      .prepare("SELECT user_id FROM shared_wallet_holds WHERE user_id=?")
      .get(userId)
  )
    throw new HttpError(403, "This account needs a financial review.");
  const input = checkoutSchema.parse(raw);
  z.string()
    .min(8)
    .max(100)
    .regex(/^[A-Za-z0-9_-]+$/)
    .parse(key);
  const requestHash = hash(json(input));
  return transaction(() => {
    lockUsers([userId]);
    assertUser(userId);
    const old = db
      .prepare(
        "SELECT * FROM shared_checkouts WHERE buyer_id=? AND idempotency_key=?",
      )
      .get(userId, key);
    if (old) {
      if (old.request_hash !== requestHash)
        throw new HttpError(
          409,
          "This idempotency key was used for a different checkout.",
        );
      return checkoutView(old);
    }
    let items = input.items;
    if (input.cartLineIds) {
      if (new Set(input.cartLineIds).size !== input.cartLineIds.length)
        throw new HttpError(422, "Select each cart line once.");
      items = input.cartLineIds.map((k) => {
        const c = db
          .prepare("SELECT * FROM shared_cart WHERE id=? AND user_id=?")
          .get(k, userId);
        if (!c) throw new HttpError(404, "A selected cart item was not found.");
        return parse(c.input_json);
      });
    }
    lockProducts(items.map((x) => x.productId));
    const quotes = [];
    for (const item of items) {
      const q = quoteSelection(userId, item);
      changeStock(q, -1);
      if (q.input.offerId) {
        const claim = db
          .prepare(
            "UPDATE shared_offers SET status='reserved' WHERE id=? AND status='accepted'",
          )
          .run(q.input.offerId);
        if (claim.changes !== 1)
          throw new HttpError(409, "This offer is already reserved.");
      }
      quotes.push(q);
    }
    if (quotes.some((q) => q.kind === "physical") && !input.address)
      throw new HttpError(422, "Add a delivery address for physical products.");
    // Mobile digital billing is gated until a verified store-billing adapter is configured.
    if (
      input.clientPlatform !== "web" &&
      quotes.some((q) => q.kind === "digital")
    )
      throw new HttpError(
        422,
        "Use the web checkout for digital products until native store billing is connected.",
      );
    const deliveries = new Map();
    for (const q of quotes)
      deliveries.set(
        q.ownerId,
        Math.max(deliveries.get(q.ownerId) || 0, q.deliveryKobo),
      );
    const total = assertAmount(
      quotes.reduce((n, q) => n + q.totalKobo, 0) +
        [...deliveries.values()].reduce((a, b) => a + b, 0),
    );
    const snapshot = {
      quotes,
      address: input.address || {},
      method: input.method,
      cartLineIds: input.cartLineIds || [],
      cartInputs: input.cartLineIds ? items : [],
      deliveries: Object.fromEntries(deliveries),
      clientPlatform: input.clientPlatform,
    };
    const checkoutId = id("checkout");
    db.prepare(
      `INSERT INTO shared_checkouts(id,buyer_id,idempotency_key,request_hash,snapshot_json,total_kobo,status,provider,reference,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      checkoutId,
      userId,
      key,
      requestHash,
      json(snapshot),
      total,
      "ready",
      input.method,
      id("PAY"),
      new Date(Date.now() + 30 * 60000).toISOString(),
      now(),
    );
    for (const productId of new Set(quotes.map((q) => q.productId)))
      db.prepare(
        "INSERT INTO shared_reservations(checkout_id,product_id) VALUES(?,?)",
      ).run(checkoutId, productId);
    return checkoutView(
      db.prepare("SELECT * FROM shared_checkouts WHERE id=?").get(checkoutId),
    );
  });
}
export function checkoutView(row) {
  const s = parse(row.snapshot_json);
  return {
    id: row.id,
    status: row.status,
    amountKobo: Number(row.total_kobo),
    currency: "NGN",
    reference: row.reference,
    authorizationUrl: row.authorization_url || null,
    expiresAt: row.expires_at,
    method: row.provider,
    items: (s.quotes || []).map(publicQuote),
  };
}
export function ownedCheckout(userId, key) {
  const c = db
    .prepare("SELECT * FROM shared_checkouts WHERE id=? AND buyer_id=?")
    .get(key, userId);
  if (!c) throw new HttpError(404, "Checkout not found.");
  return c;
}
export function cancelCheckout(userId, checkoutId) {
  return transaction(() => {
    lockUsers([userId]);
    const c = ownedCheckout(userId, checkoutId);
    if (c.status === "cancelled" || c.status === "expired")
      return checkoutView(c);
    if (!["ready", "failed"].includes(c.status) || c.authorization_url)
      throw new HttpError(
        409,
        "Verify the provider payment before releasing this checkout.",
      );
    releaseCheckoutStock(c);
    return checkoutView(
      db.prepare("SELECT * FROM shared_checkouts WHERE id=?").get(c.id),
    );
  });
}
export function releaseCheckoutStock(c, status = "cancelled") {
  if (["cancelled", "expired", "paid", "refund_required"].includes(c.status))
    return;
  const s = parse(c.snapshot_json);
  lockProducts(s.quotes.map((q) => q.productId));
  for (const q of s.quotes) {
    changeStock(q, 1);
    if (q.input.offerId)
      db.prepare(
        "UPDATE shared_offers SET status='accepted' WHERE id=? AND status='reserved'",
      ).run(q.input.offerId);
  }
  db.prepare("UPDATE shared_checkouts SET status=? WHERE id=?").run(
    status,
    c.id,
  );
  db.prepare("DELETE FROM shared_reservations WHERE checkout_id=?").run(c.id);
}
export function walletChange(userId, bucket, amount, eventKey, lineId = null) {
  if (!["available", "held"].includes(bucket) || !Number.isSafeInteger(amount))
    throw new Error("Invalid ledger mutation.");
  if (
    db.prepare("SELECT id FROM shared_ledger WHERE event_key=?").get(eventKey)
  )
    return;
  db.prepare(
    "INSERT INTO shared_wallet_accounts(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING",
  ).run(userId);
  const column = bucket === "available" ? "available_kobo" : "held_kobo";
  const update = db
    .prepare(
      `UPDATE shared_wallet_accounts SET ${column}=${column}+? WHERE user_id=? AND ${column}+?>=0`,
    )
    .run(amount, userId, amount);
  if (update.changes !== 1)
    throw new HttpError(
      409,
      "Available wallet funds are insufficient or already reserved.",
    );
  db.prepare(
    "INSERT INTO shared_ledger(id,user_id,event_key,bucket,amount_kobo,order_line_id,created_at) VALUES(?,?,?,?,?,?,?)",
  ).run(id("ledger"), userId, eventKey, bucket, amount, lineId, now());
}
export function completeCheckout(checkoutId) {
  const c = db
    .prepare("SELECT * FROM shared_checkouts WHERE id=?")
    .get(checkoutId);
  if (!c) throw new HttpError(404, "Checkout not found.");
  if (c.status === "paid") return;
  if (["cancelled", "expired", "refund_required"].includes(c.status)) {
    db.prepare(
      "UPDATE shared_checkouts SET status='refund_required' WHERE id=?",
    ).run(c.id);
    return;
  }
  const s = parse(c.snapshot_json);
  const sellers = [...new Set(s.quotes.map((q) => q.ownerId))];
  lockUsers([c.buyer_id, ...sellers, ...s.quotes.map((q) => q.promoterId)]);
  const fresh = db
    .prepare("SELECT status FROM shared_checkouts WHERE id=?")
    .get(c.id);
  if (fresh.status === "paid") return;
  if (["cancelled", "expired", "refund_required"].includes(fresh.status)) {
    db.prepare(
      "UPDATE shared_checkouts SET status='refund_required' WHERE id=?",
    ).run(c.id);
    return;
  }
  for (const sellerId of sellers) {
    const group = s.quotes.filter((q) => q.ownerId === sellerId),
      delivery = Number(s.deliveries[sellerId] || 0),
      orderId = id("order");
    db.prepare(
      "INSERT INTO shared_orders(id,checkout_id,buyer_id,seller_id,total_kobo,delivery_kobo,status,address_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      orderId,
      c.id,
      c.buyer_id,
      sellerId,
      group.reduce((a, q) => a + q.totalKobo, delivery),
      delivery,
      group.every((q) => q.kind === "digital") ? "completed" : "paid",
      json(s.address),
      now(),
    );
    for (const q of group) {
      const lineId = id("line");
      db.prepare(
        "INSERT INTO shared_order_lines(id,order_id,product_id,quantity,snapshot_json,seller_kobo,commission_kobo,platform_kobo,promoter_id,eligible_at,fulfilled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        lineId,
        orderId,
        q.productId,
        q.quantity,
        json(q),
        q.sellerKobo,
        q.commissionKobo,
        q.platformKobo,
        q.promoterId,
        q.kind === "digital"
          ? new Date(Date.now() + q.returnDays * 86400000).toISOString()
          : null,
        q.kind === "digital" ? now() : null,
      );
      walletChange(sellerId, "held", q.sellerKobo, "sale:" + lineId, lineId);
      if (q.promoterId)
        walletChange(
          q.promoterId,
          "held",
          q.commissionKobo,
          "commission:" + lineId,
          lineId,
        );
      if (q.kind === "digital")
        db.prepare(
          "INSERT INTO shared_entitlements(id,line_id,buyer_id,file_ids_json,created_at) VALUES(?,?,?,?,?)",
        ).run(id("licence"), lineId, c.buyer_id, json(q.fileIds), now());
      if (q.input.offerId)
        db.prepare(
          "UPDATE shared_offers SET status='used' WHERE id=? AND buyer_id=?",
        ).run(q.input.offerId, c.buyer_id);
    }
    if (delivery)
      walletChange(sellerId, "held", delivery, "delivery:" + orderId);
    notify(c.buyer_id, "order", orderId, sellerId, { status: "paid" });
    notify(sellerId, "sale", orderId, c.buyer_id, { status: "paid" });
  }
  // Remove only the selected cart entries whose configuration has not changed.
  for (let i = 0; i < s.cartLineIds.length; i++)
    db.prepare(
      "DELETE FROM shared_cart WHERE id=? AND user_id=? AND input_json=?",
    ).run(s.cartLineIds[i], c.buyer_id, json(s.cartInputs[i]));
  db.prepare("UPDATE shared_checkouts SET status='paid' WHERE id=?").run(c.id);
  db.prepare("DELETE FROM shared_reservations WHERE checkout_id=?").run(c.id);
}
export function payFromWallet(userId, checkoutId) {
  return transaction(() => {
    lockUsers([userId]);
    const c = ownedCheckout(userId, checkoutId);
    if (c.status === "paid") return checkoutView(c);
    if (
      c.provider !== "wallet" ||
      !["ready", "failed"].includes(c.status) ||
      c.expires_at <= now()
    )
      throw new HttpError(409, "This wallet checkout is unavailable.");
    walletChange(
      userId,
      "available",
      -Number(c.total_kobo),
      "purchase:" + c.id,
    );
    completeCheckout(c.id);
    return checkoutView(ownedCheckout(userId, c.id));
  });
}
export function walletView(userId) {
  const r = db
    .prepare("SELECT * FROM shared_wallet_accounts WHERE user_id=?")
    .get(userId);
  return {
    currency: "NGN",
    availableKobo: Number(r?.available_kobo || 0),
    heldKobo: Number(r?.held_kobo || 0),
    transactions: db
      .prepare(
        "SELECT id,event_key,bucket,amount_kobo,created_at FROM shared_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 100",
      )
      .all(userId)
      .map((row) => ({ ...row, amount_kobo: Number(row.amount_kobo) })),
  };
}
