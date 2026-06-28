import { db } from "../db/database.js";
import {
  serializeProduct,
  serializeStore,
} from "../lib/serializers.js";
import { HttpError } from "../lib/http-error.js";
import {
  productComments,
  productInteraction,
  storeInteraction,
} from "./interaction.service.js";

const publicProductQuery = `
  SELECT products.*, stores.owner_id, stores.slug AS store_slug,
         stores.name AS store_name, stores.description AS store_description,
         stores.campus AS store_campus, stores.category AS store_category,
         stores.phone AS store_phone, stores.logo_url, stores.cover_url,
         stores.status AS store_status, stores.verified,
         stores.created_at AS store_created_at,
         stores.updated_at AS store_updated_at
  FROM products
  JOIN stores ON stores.id = products.store_id
`;

function serializePublicProduct(row) {
  return {
    ...serializeProduct(row),
    store: serializeStore({
      id: row.store_id,
      owner_id: row.owner_id,
      slug: row.store_slug,
      name: row.store_name,
      description: row.store_description,
      campus: row.store_campus,
      category: row.store_category,
      phone: row.store_phone,
      logo_url: row.logo_url,
      cover_url: row.cover_url,
      status: row.store_status,
      verified: row.verified,
      created_at: row.store_created_at,
      updated_at: row.store_updated_at,
    }),
  };
}

export function getPublicProduct(productId, viewerId) {
  const row = db
    .prepare(`
      ${publicProductQuery}
      WHERE products.id = ?
        AND stores.status = 'active'
        AND products.status IN ('active', 'out_of_stock')
    `)
    .get(productId);

  if (!row) throw new HttpError(404, "Product was not found.");

  const relatedRows = db
    .prepare(`
      ${publicProductQuery}
      WHERE products.id != ?
        AND stores.status = 'active'
        AND products.status IN ('active', 'out_of_stock')
        AND (products.category = ? OR products.store_id = ?)
      ORDER BY products.updated_at DESC
      LIMIT 4
    `)
    .all(productId, row.category, row.store_id);

  return {
    product: serializePublicProduct(row),
    relatedProducts: relatedRows.map(serializePublicProduct),
    interaction: productInteraction(productId, viewerId),
    storeInteraction: storeInteraction(row.store_id, viewerId),
    comments: productComments(productId).map((comment) => ({
      id: comment.id,
      body: comment.body,
      createdAt: comment.created_at,
      user: {
        id: comment.user_id,
        name: comment.name,
        avatarUrl: comment.avatar_url || null,
      },
    })),
  };
}
