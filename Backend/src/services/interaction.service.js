import { db } from "../db/database.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";

function activeStoreBySlug(slug) {
  const store = db
    .prepare("SELECT * FROM stores WHERE slug = ? AND status = 'active'")
    .get(slug);
  if (!store) throw new HttpError(404, "Store was not found.");
  return store;
}

function activeProduct(productId) {
  const product = db.prepare(`
    SELECT products.* FROM products
    JOIN stores ON stores.id = products.store_id
    WHERE products.id = ? AND stores.status = 'active'
      AND products.status IN ('active', 'out_of_stock')
  `).get(productId);
  if (!product) throw new HttpError(404, "Product was not found.");
  return product;
}

function productCommentById(commentId) {
  const comment = db.prepare(`
    SELECT product_comments.*, users.name, users.avatar_url,
           products.store_id, stores.owner_id
    FROM product_comments
    JOIN users ON users.id = product_comments.user_id
    JOIN products ON products.id = product_comments.product_id
    JOIN stores ON stores.id = products.store_id
    WHERE product_comments.id = ?
  `).get(commentId);

  if (!comment) throw new HttpError(404, "Comment was not found.");
  return comment;
}

function serializeComment(row, viewer = null) {
  const viewerId = viewer?.user_id || viewer?.id || "";
  const likeCount = db
    .prepare("SELECT COUNT(*) AS count FROM product_comment_likes WHERE comment_id = ?")
    .get(row.id).count;
  const liked = viewerId
    ? Boolean(
        db
          .prepare("SELECT 1 FROM product_comment_likes WHERE user_id = ? AND comment_id = ?")
          .get(viewerId, row.id),
      )
    : false;
  const canDelete = Boolean(
    viewerId &&
      (viewerId === row.user_id ||
        viewerId === row.owner_id ||
        viewer?.role === "admin"),
  );

  return {
    id: row.id,
    body: row.is_deleted ? "This comment was deleted." : row.body,
    parentCommentId: row.parent_comment_id || null,
    replyToName: row.reply_to_name || null,
    isDeleted: Boolean(row.is_deleted),
    likeCount,
    liked,
    canDelete,
    createdAt: row.created_at,
    user: {
      id: row.user_id,
      name: row.name,
      avatarUrl: row.avatar_url || null,
    },
  };
}

export function followStore(userId, slug) {
  const store = activeStoreBySlug(slug);
  db.prepare(`
    INSERT INTO store_follows (id, user_id, store_id, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, store_id) DO NOTHING
  `).run(createId("fol"), userId, store.id, new Date().toISOString());
  return storeInteraction(store.id, userId);
}

export function unfollowStore(userId, slug) {
  const store = activeStoreBySlug(slug);
  db.prepare(
    "DELETE FROM store_follows WHERE user_id = ? AND store_id = ?",
  ).run(userId, store.id);
  return storeInteraction(store.id, userId);
}

export function storeInteraction(storeId, viewerId) {
  const followerCount = db
    .prepare("SELECT COUNT(*) AS count FROM store_follows WHERE store_id = ?")
    .get(storeId).count;
  const likesCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM product_likes
    JOIN products ON products.id = product_likes.product_id
    WHERE products.store_id = ?
  `).get(storeId).count;
  const isFollowing = viewerId
    ? Boolean(
        db
          .prepare(
            "SELECT 1 FROM store_follows WHERE user_id = ? AND store_id = ?",
          )
          .get(viewerId, storeId),
      )
    : false;

  return { followerCount, likesCount, isFollowing };
}

export function likeProduct(userId, productId) {
  activeProduct(productId);
  db.prepare(`
    INSERT INTO product_likes (id, user_id, product_id, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, product_id) DO NOTHING
  `).run(createId("lik"), userId, productId, new Date().toISOString());
  return productInteraction(productId, userId);
}

export function unlikeProduct(userId, productId) {
  activeProduct(productId);
  db.prepare(
    "DELETE FROM product_likes WHERE user_id = ? AND product_id = ?",
  ).run(userId, productId);
  return productInteraction(productId, userId);
}

export function addProductComment(userId, productId, input) {
  activeProduct(productId);
  const cleanBody =
    typeof input === "string"
      ? input.trim()
      : String(input?.body || "").trim();
  const parentCommentId =
    typeof input === "string" ? "" : String(input?.parentCommentId || "").trim();

  if (cleanBody.length < 1 || cleanBody.length > 500) {
    throw new HttpError(422, "Comments must be between 1 and 500 characters.");
  }

  if (parentCommentId) {
    const parent = productCommentById(parentCommentId);

    if (parent.product_id !== productId || parent.is_deleted) {
      throw new HttpError(422, "You can only reply to an active comment on this product.");
    }
  }

  const id = createId("com");
  db.prepare(`
    INSERT INTO product_comments (
      id, user_id, product_id, parent_comment_id, body, is_deleted, created_at
    )
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(
    id,
    userId,
    productId,
    parentCommentId || null,
    cleanBody,
    new Date().toISOString(),
  );

  return productComments(productId, { user_id: userId }).find(
    (comment) => comment.id === id,
  );
}

export function productInteraction(productId, viewerId) {
  const likeCount = db
    .prepare("SELECT COUNT(*) AS count FROM product_likes WHERE product_id = ?")
    .get(productId).count;

  const commentCount = db
    .prepare(
      "SELECT COUNT(*) AS count FROM product_comments WHERE product_id = ? AND is_deleted = 0",
    )
    .get(productId).count;

  const saveCount = db
    .prepare(`
      SELECT COUNT(*) AS count FROM saved_items
      WHERE item_type = 'product' AND item_id = ?
    `)
    .get(productId).count;

  const shareCount = db
    .prepare("SELECT COUNT(*) AS count FROM product_shares WHERE product_id = ?")
    .get(productId).count;

  const viewCount = db
    .prepare("SELECT COUNT(*) AS count FROM product_views WHERE product_id = ?")
    .get(productId).count;

  const liked = viewerId
    ? Boolean(
        db
          .prepare(
            "SELECT 1 FROM product_likes WHERE user_id = ? AND product_id = ?",
          )
          .get(viewerId, productId),
      )
    : false;

  return {
    likeCount,
    commentCount,
    saveCount,
    shareCount,
    viewCount,
    liked,
  };
}

export function recordProductShare(userId, productId, anonKey = "") {
  activeProduct(productId);

  db.prepare(`
    INSERT INTO product_shares (id, user_id, anon_key, product_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    createId("shr"),
    userId || null,
    String(anonKey || ""),
    productId,
    new Date().toISOString(),
  );

  return productInteraction(productId, userId);
}

export function recordProductView(userId, productId, anonKey = "") {
  activeProduct(productId);

  const safeAnonKey = String(anonKey || "");

  const existingView = userId
    ? db
        .prepare(`
          SELECT 1 FROM product_views
          WHERE product_id = ? AND user_id = ?
        `)
        .get(productId, userId)
    : db
        .prepare(`
          SELECT 1 FROM product_views
          WHERE product_id = ? AND user_id IS NULL AND anon_key = ?
        `)
        .get(productId, safeAnonKey);

  if (!existingView) {
    db.prepare(`
      INSERT INTO product_views (id, user_id, anon_key, product_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      createId("viw"),
      userId || null,
      safeAnonKey,
      productId,
      new Date().toISOString(),
    );
  }

  return productInteraction(productId, userId);
}

export function productComments(productId, viewer = null) {
  return db.prepare(`
    SELECT product_comments.id, product_comments.body,
           product_comments.parent_comment_id, product_comments.is_deleted,
           product_comments.created_at, users.id AS user_id,
           users.name, users.avatar_url,
           reply_to_user.name AS reply_to_name,
           stores.owner_id
    FROM product_comments
    JOIN users ON users.id = product_comments.user_id
    JOIN products ON products.id = product_comments.product_id
    JOIN stores ON stores.id = products.store_id
    LEFT JOIN product_comments parent_comments
      ON parent_comments.id = product_comments.parent_comment_id
    LEFT JOIN users reply_to_user ON reply_to_user.id = parent_comments.user_id
    WHERE product_comments.product_id = ?
    ORDER BY product_comments.created_at DESC
    LIMIT 100
  `).all(productId).map((row) => serializeComment(row, viewer));
}

export function likeProductComment(userId, productId, commentId) {
  activeProduct(productId);
  const comment = productCommentById(commentId);

  if (comment.product_id !== productId || comment.is_deleted) {
    throw new HttpError(404, "Comment was not found.");
  }

  db.prepare(`
    INSERT INTO product_comment_likes (id, user_id, comment_id, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, comment_id) DO NOTHING
  `).run(createId("clk"), userId, commentId, new Date().toISOString());

  return productComments(productId, { user_id: userId }).find(
    (item) => item.id === commentId,
  );
}

export function unlikeProductComment(userId, productId, commentId) {
  activeProduct(productId);
  const comment = productCommentById(commentId);

  if (comment.product_id !== productId) {
    throw new HttpError(404, "Comment was not found.");
  }

  db.prepare(
    "DELETE FROM product_comment_likes WHERE user_id = ? AND comment_id = ?",
  ).run(userId, commentId);

  return productComments(productId, { user_id: userId }).find(
    (item) => item.id === commentId,
  );
}

export function deleteProductComment(viewer, productId, commentId) {
  activeProduct(productId);
  const comment = productCommentById(commentId);
  const viewerId = viewer?.user_id || viewer?.id || "";

  if (comment.product_id !== productId) {
    throw new HttpError(404, "Comment was not found.");
  }

  const canDelete =
    viewerId &&
    (viewerId === comment.user_id ||
      viewerId === comment.owner_id ||
      viewer?.role === "admin");

  if (!canDelete) {
    throw new HttpError(403, "Only the comment owner, seller, or admin can delete this comment.");
  }

  db.prepare(`
    UPDATE product_comments
    SET body = '', is_deleted = 1
    WHERE id = ?
  `).run(commentId);

  db.prepare("DELETE FROM product_comment_likes WHERE comment_id = ?").run(commentId);

  return productComments(productId, viewer).find((item) => item.id === commentId);
}
