import crypto from 'node:crypto';
import { z } from 'zod';
import { db, transaction } from '../db/database.js';
import { HttpError } from '../lib/http-error.js';
const now = () => new Date().toISOString();
function product(id) {
    const row = db.prepare(`SELECT p.*,s.owner_id FROM products p JOIN stores s ON s.id=p.store_id WHERE p.id=? AND s.status='active'`).get(id);
    if (!row)
        throw new HttpError(404, 'Product not found.');
    return row;
}
export function saveOffer(userId, productId, input) {
    const p = product(productId);
    if (p.owner_id !== userId)
        throw new HttpError(403, 'Only the product owner can set earning terms.');
    const data = z.object({ dropshipMargin: z.number().finite().min(0).max(10000000), commissionPercent: z.number().finite().min(0).max(90) }).parse(input);
    const margin = Math.round(data.dropshipMargin * 100), bps = Math.round(data.commissionPercent * 100);
    if (margin >= Number(p.seller_price_kobo ?? p.price_kobo))
        throw new HttpError(422, 'The margin must be less than your selling price.');
    db.prepare(`INSERT INTO earning_offers(product_id,dropship_margin_kobo,commission_bps,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(product_id) DO UPDATE SET dropship_margin_kobo=excluded.dropship_margin_kobo,
    commission_bps=excluded.commission_bps,version=earning_offers.version+1,updated_at=excluded.updated_at`).run(productId, margin, bps, now());
    return getOffer(productId, userId);
}
export function getOffer(productId, viewerId) {
    const p = product(productId), o = db.prepare('SELECT * FROM earning_offers WHERE product_id=?').get(productId);
    if (!['active', 'out_of_stock'].includes(p.status) && viewerId !== p.owner_id)
        throw new HttpError(404, 'Product not found.');
    return { productId, ownerId: p.owner_id, dropshipMargin: (o?.dropship_margin_kobo || 0) / 100, commissionPercent: (o?.commission_bps || 0) / 100,
        commissionPerUnit: Math.floor(Number(p.seller_price_kobo ?? p.price_kobo) * (o?.commission_bps || 0) / 10000) / 100 };
}
export function opportunities() {
    return db.prepare(`SELECT p.id,p.name,p.price_kobo,p.image_urls,s.name AS store_name,o.dropship_margin_kobo,o.commission_bps,
    p.seller_price_kobo FROM earning_offers o JOIN products p ON p.id=o.product_id JOIN stores s ON s.id=p.store_id
    WHERE p.status='active' AND p.stock>0 AND s.status='active' AND (o.dropship_margin_kobo>0 OR o.commission_bps>0)
    ORDER BY p.created_at DESC,p.id DESC LIMIT 100`).all().map(p => ({ id: p.id, name: p.name, price: p.price_kobo / 100,
        storeName: p.store_name, imageUrl: JSON.parse(p.image_urls || '[]')[0] || '', dropshipMargin: p.dropship_margin_kobo / 100,
        commissionPercent: p.commission_bps / 100, commissionPerUnit: Math.floor(Number(p.seller_price_kobo ?? p.price_kobo) * p.commission_bps / 10000) / 100 }));
}
export function createEarningLink(userId, productId, input) {
    const data = z.object({ mode: z.enum(['dropshipping', 'marketing']), caption: z.string().trim().max(2000).default(''), acceptTerms: z.literal(true) }).parse(input);
    return transaction(() => {
        const p = product(productId), o = db.prepare('SELECT * FROM earning_offers WHERE product_id=?').get(productId);
        if (p.owner_id === userId)
            throw new HttpError(422, 'Share your own product normally; earning links are for other people’s products.');
        if (p.status !== 'active' || p.stock < 1 || !o || (data.mode === 'dropshipping' ? !o.dropship_margin_kobo : !o.commission_bps))
            throw new HttpError(409, 'This product is not available for this earning activity.');
        const old = db.prepare('SELECT id FROM earning_links WHERE user_id=? AND product_id=? AND mode=? AND offer_version=?').get(userId, productId, data.mode, o.version);
        const id = old?.id || crypto.randomUUID();
        if (!old) {
            db.prepare('INSERT INTO earning_links(id,user_id,product_id,mode,offer_version,created_at) VALUES(?,?,?,?,?,?)').run(id, userId, productId, data.mode, o.version, now());
            db.prepare('INSERT INTO social_posts(id,user_id,caption,video_url,product_id,created_at) VALUES(?,?,?,?,?,?)').run(id, userId, data.caption || p.name, '', productId, now());
        }
        else {
            db.prepare("UPDATE social_posts SET status='active',caption=?,created_at=? WHERE id=? AND status='removed'").run(data.caption || p.name, now(), id);
        }
        return { id, path: '/products/' + encodeURIComponent(productId) + '?ref=' + id, mode: data.mode };
    });
}
// Server-owned terms: never accept an amount, beneficiary or commission rate from checkout.
export function resolveEarning(linkId, productId, buyerId) {
    if (!linkId)
        return null;
    const link = db.prepare('SELECT * FROM earning_links WHERE id=? AND product_id=?').get(linkId, productId);
    if (!link)
        throw new HttpError(422, 'This earning link does not match the product. Open the product again.');
    const p = product(productId), o = db.prepare('SELECT * FROM earning_offers WHERE product_id=?').get(productId);
    if (link.user_id === buyerId || link.user_id === p.owner_id)
        throw new HttpError(422, 'Self-referral purchases cannot earn. Open the product without the earning link.');
    if (!o || o.version !== link.offer_version)
        throw new HttpError(409, 'The seller changed these earning terms. Ask for an updated link.');
    const net = Number(p.seller_price_kobo ?? p.price_kobo);
    const amount = link.mode === 'dropshipping' ? o.dropship_margin_kobo : Math.floor(net * o.commission_bps / 10000);
    if (amount <= 0 || amount >= net)
        throw new HttpError(409, 'This earning offer is no longer available.');
    return { linkId: link.id, userId: link.user_id, mode: link.mode, unitAmountKobo: amount };
}
export function recordEarnings(orderId, items) {
    for (const item of items) {
        if (!item.earning)
            continue;
        const e = item.earning;
        db.prepare(`INSERT INTO earning_payouts(id,order_id,seller_id,product_id,link_id,mode,seller_amount_kobo,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(order_id,product_id,link_id) DO UPDATE SET seller_amount_kobo=earning_payouts.seller_amount_kobo+excluded.seller_amount_kobo`)
            .run(crypto.randomUUID(), orderId, e.userId, item.product.id, e.linkId, e.mode, e.unitAmountKobo * item.quantity, now(), now());
    }
}
export function earningsFor(userId) {
    return db.prepare(`SELECT e.id,e.mode,e.seller_amount_kobo AS amountKobo,e.status,e.hold_reason AS holdReason,
    e.created_at AS createdAt,p.name AS productName,o.payment_status AS paymentStatus,o.status AS orderStatus
    FROM earning_payouts e JOIN products p ON p.id=e.product_id JOIN orders o ON o.id=e.order_id
    WHERE e.seller_id=? ORDER BY e.created_at DESC LIMIT 100`).all(userId);
}
