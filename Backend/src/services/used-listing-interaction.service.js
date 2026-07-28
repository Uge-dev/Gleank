import { db } from "../db/database.js";
import { createId } from "../lib/ids.js";
import { HttpError } from "../lib/http-error.js";
import {
  createNotification,
  createNotificationForUsers,
} from "./notification.service.js";

function activeUsedListing(listingId) {
  const listing = db
    .prepare(`
      SELECT used_listings.*, users.name AS seller_name
      FROM used_listings
      JOIN users ON users.id = used_listings.seller_id
      WHERE used_listings.id = ?
        AND used_listings.status = 'active'
    `)
    .get(listingId);

  if (!listing) throw new HttpError(404, "Used Market item was not found.");
  return listing;
}

function firstListingImage(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed[0] || "" : "";
  } catch {
    return "";
  }
}

function viewerId(viewer) {
  if (typeof viewer === "string") return viewer;
  return viewer?.user_id || viewer?.id || "";
}

function usedListingCommentById(commentId) {
  const comment = db
    .prepare(`
      SELECT used_listing_comments.*, users.name, users.avatar_url,
             used_listings.seller_id AS owner_id
      FROM used_listing_comments
      JOIN users ON users.id = used_listing_comments.user_id
      JOIN used_listings
        ON used_listings.id = used_listing_comments.listing_id
      WHERE used_listing_comments.id = ?
    `)
    .get(commentId);

  if (!comment) throw new HttpError(404, "Comment was not found.");
  return comment;
}

function serializeUsedListingComment(row, viewer = null) {
  const activeViewerId = viewerId(viewer);
  const likeCount = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM used_listing_comment_likes
      WHERE comment_id = ?
    `)
    .get(row.id).count;
  const liked = activeViewerId
    ? Boolean(
        db
          .prepare(`
            SELECT 1
            FROM used_listing_comment_likes
            WHERE user_id = ? AND comment_id = ?
          `)
          .get(activeViewerId, row.id),
      )
    : false;
  const canDelete = Boolean(
    activeViewerId &&
      (activeViewerId === row.user_id ||
        activeViewerId === row.owner_id ||
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

export function usedListingInteraction(listingId, viewer = null) {
  const activeViewerId = viewerId(viewer);
  const likeCount = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM used_listing_likes
      WHERE listing_id = ?
    `)
    .get(listingId).count;
  const commentCount = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM used_listing_comments
      WHERE listing_id = ? AND is_deleted = 0
    `)
    .get(listingId).count;
  const saveCount = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM saved_items
      WHERE item_type = 'used_listing' AND item_id = ?
    `)
    .get(listingId).count;
  const shareCount = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM used_listing_shares
      WHERE listing_id = ?
    `)
    .get(listingId).count;
  const viewCount = db
    .prepare(`
      SELECT COUNT(*) AS count
      FROM used_listing_views
      WHERE listing_id = ?
    `)
    .get(listingId).count;
  const liked = activeViewerId
    ? Boolean(
        db
          .prepare(`
            SELECT 1
            FROM used_listing_likes
            WHERE user_id = ? AND listing_id = ?
          `)
          .get(activeViewerId, listingId),
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

export function likeUsedListing(userId, listingId) {
  const listing = activeUsedListing(listingId);
  const result = db
    .prepare(`
      INSERT INTO used_listing_likes (id, user_id, listing_id, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, listing_id) DO NOTHING
    `)
    .run(createId("ulik"), userId, listingId, new Date().toISOString());

  if (result.changes && listing.seller_id !== userId) {
    const user = db.prepare("SELECT name FROM users WHERE id = ?").get(userId);
    createNotification({
      userId: listing.seller_id,
      type: "like",
      title: "Used item liked",
      body: `${user?.name || "A Gleenc user"} liked ${listing.name}.`,
      actionLabel: "View item",
      actionPath: `/used-market/${listingId}`,
      imageUrl: firstListingImage(listing.image_urls),
    });
  }

  return usedListingInteraction(listingId, userId);
}

export function unlikeUsedListing(userId, listingId) {
  activeUsedListing(listingId);
  db.prepare(`
    DELETE FROM used_listing_likes
    WHERE user_id = ? AND listing_id = ?
  `).run(userId, listingId);
  return usedListingInteraction(listingId, userId);
}

export function recordUsedListingShare(userId, listingId) {
  const listing = activeUsedListing(listingId);
  db.prepare(`
    INSERT INTO used_listing_shares (id, user_id, listing_id, created_at)
    VALUES (?, ?, ?, ?)
  `).run(createId("ushr"), userId, listingId, new Date().toISOString());

  if (listing.seller_id !== userId) {
    const user = db.prepare("SELECT name FROM users WHERE id = ?").get(userId);
    createNotification({
      userId: listing.seller_id,
      type: "used_market",
      title: "Used item shared",
      body: `${user?.name || "A Gleenc user"} shared ${listing.name}.`,
      actionLabel: "View item",
      actionPath: `/used-market/${listingId}`,
      imageUrl: firstListingImage(listing.image_urls),
    });
  }

  return usedListingInteraction(listingId, userId);
}

export function recordUsedListingView(userId, listingId) {
  activeUsedListing(listingId);
  db.prepare(`
    INSERT INTO used_listing_views (id, user_id, listing_id, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, listing_id) DO NOTHING
  `).run(createId("uviw"), userId, listingId, new Date().toISOString());
  return usedListingInteraction(listingId, userId);
}

export function usedListingComments(listingId, viewer = null) {
  return db
    .prepare(`
      SELECT used_listing_comments.id, used_listing_comments.body,
             used_listing_comments.parent_comment_id,
             used_listing_comments.is_deleted,
             used_listing_comments.created_at,
             users.id AS user_id, users.name, users.avatar_url,
             reply_to_user.name AS reply_to_name,
             used_listings.seller_id AS owner_id
      FROM used_listing_comments
      JOIN users ON users.id = used_listing_comments.user_id
      JOIN used_listings
        ON used_listings.id = used_listing_comments.listing_id
      LEFT JOIN used_listing_comments parent_comments
        ON parent_comments.id = used_listing_comments.parent_comment_id
      LEFT JOIN users reply_to_user
        ON reply_to_user.id = parent_comments.user_id
      WHERE used_listing_comments.listing_id = ?
      ORDER BY used_listing_comments.created_at DESC
      LIMIT 100
    `)
    .all(listingId)
    .map((row) => serializeUsedListingComment(row, viewer));
}

export function addUsedListingComment(userId, listingId, input) {
  const listing = activeUsedListing(listingId);
  const cleanBody =
    typeof input === "string"
      ? input.trim()
      : String(input?.body || "").trim();
  const parentCommentId =
    typeof input === "string"
      ? ""
      : String(input?.parentCommentId || "").trim();

  if (cleanBody.length < 1 || cleanBody.length > 500) {
    throw new HttpError(422, "Comments must be between 1 and 500 characters.");
  }

  if (parentCommentId) {
    const parent = usedListingCommentById(parentCommentId);
    if (parent.listing_id !== listingId || parent.is_deleted) {
      throw new HttpError(
        422,
        "You can only reply to an active comment on this Used Market item.",
      );
    }
  }

  const id = createId("ucom");
  db.prepare(`
    INSERT INTO used_listing_comments (
      id, user_id, listing_id, parent_comment_id, body, is_deleted, created_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(
    id,
    userId,
    listingId,
    parentCommentId || null,
    cleanBody,
    new Date().toISOString(),
  );

  const commenter = db.prepare("SELECT name FROM users WHERE id = ?").get(userId);
  const notificationTargets = [];
  if (listing.seller_id !== userId) notificationTargets.push(listing.seller_id);

  if (parentCommentId) {
    const parent = usedListingCommentById(parentCommentId);
    if (parent.user_id !== userId) notificationTargets.push(parent.user_id);
  }

  createNotificationForUsers(notificationTargets, {
    type: "used_market",
    title: parentCommentId ? "New comment reply" : "New Used Market comment",
    body: `${commenter?.name || "A Gleenc user"} commented on ${listing.name}: ${cleanBody}`,
    actionLabel: "View item",
    actionPath: `/used-market/${listingId}`,
    imageUrl: firstListingImage(listing.image_urls),
  });

  return usedListingComments(listingId, { user_id: userId }).find(
    (comment) => comment.id === id,
  );
}

export function likeUsedListingComment(userId, listingId, commentId) {
  activeUsedListing(listingId);
  const comment = usedListingCommentById(commentId);

  if (comment.listing_id !== listingId || comment.is_deleted) {
    throw new HttpError(404, "Comment was not found.");
  }

  const result = db
    .prepare(`
      INSERT INTO used_listing_comment_likes (
        id, user_id, comment_id, created_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, comment_id) DO NOTHING
    `)
    .run(createId("uclk"), userId, commentId, new Date().toISOString());

  if (result.changes && comment.user_id !== userId) {
    const user = db.prepare("SELECT name FROM users WHERE id = ?").get(userId);
    createNotification({
      userId: comment.user_id,
      type: "like",
      title: "Comment liked",
      body: `${user?.name || "A Gleenc user"} liked your Used Market comment.`,
      actionLabel: "View item",
      actionPath: `/used-market/${listingId}`,
    });
  }

  return usedListingComments(listingId, { user_id: userId }).find(
    (item) => item.id === commentId,
  );
}

export function unlikeUsedListingComment(userId, listingId, commentId) {
  activeUsedListing(listingId);
  const comment = usedListingCommentById(commentId);
  if (comment.listing_id !== listingId) {
    throw new HttpError(404, "Comment was not found.");
  }

  db.prepare(`
    DELETE FROM used_listing_comment_likes
    WHERE user_id = ? AND comment_id = ?
  `).run(userId, commentId);

  return usedListingComments(listingId, { user_id: userId }).find(
    (item) => item.id === commentId,
  );
}

export function deleteUsedListingComment(viewer, listingId, commentId) {
  activeUsedListing(listingId);
  const comment = usedListingCommentById(commentId);
  const activeViewerId = viewerId(viewer);

  if (comment.listing_id !== listingId) {
    throw new HttpError(404, "Comment was not found.");
  }

  const canDelete =
    activeViewerId &&
    (activeViewerId === comment.user_id ||
      activeViewerId === comment.owner_id ||
      viewer?.role === "admin");

  if (!canDelete) {
    throw new HttpError(
      403,
      "Only the comment owner, listing owner, or admin can delete this comment.",
    );
  }

  db.prepare(`
    UPDATE used_listing_comments
    SET body = '', is_deleted = 1
    WHERE id = ?
  `).run(commentId);
  db.prepare(`
    DELETE FROM used_listing_comment_likes
    WHERE comment_id = ?
  `).run(commentId);

  return usedListingComments(listingId, viewer).find(
    (item) => item.id === commentId,
  );
}
