import { z } from 'zod';
import { db, transaction } from '../db/database.js';
import { HttpError } from '../lib/http-error.js';
import { ownedMedia } from './media.js';
import { assertUser, id, now, json, parse, audit, notify,lockUsers, identifier } from './core.js';
export function migrateVerification() {
    db.exec(`CREATE TABLE IF NOT EXISTS shared_verification (user_id TEXT PRIMARY KEY REFERENCES users(id), approved_tier INTEGER NOT NULL DEFAULT 0, requested_tier INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'not_started', data_json TEXT NOT NULL DEFAULT '{}', reason TEXT NOT NULL DEFAULT '', reviewed_by TEXT, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS shared_phone_checks(user_id TEXT PRIMARY KEY REFERENCES users(id),phone TEXT NOT NULL,expires_at TEXT NOT NULL);`);
}
const ceiling = (name, fallback) => { const n = Number(process.env[name] || fallback); if (!Number.isSafeInteger(n) || n < 1 || n > 1000000000)
    throw new Error('Invalid verification limit configuration.'); return n; };
export function tierPolicy() {
    const limits = [0, ceiling('SELLER_TIER1_LIMIT_KOBO', 10000000), ceiling('SELLER_TIER2_LIMIT_KOBO', 100000000), ceiling('SELLER_TIER3_LIMIT_KOBO', 1000000000)];
    if (!(limits[1] < limits[2] && limits[2] < limits[3]))
        throw new Error('Verification limits must increase.');
    return { version: '2026-10-13', enforced: process.env.SELLER_TIER_ENFORCEMENT === 'true', tiers: [{ tier: 1, name: 'Basic seller', limitKobo: limits[1], requirements: ['Verified email', 'Verified phone', 'Complete profile', 'Selling details'] }, { tier: 2, name: 'Identity verified', limitKobo: limits[2], requirements: ['Tier 1', 'Identity document', 'Identity review', 'Payout account ownership check'] }, { tier: 3, name: 'Enhanced verification', limitKobo: limits[3], requirements: ['Tier 2', 'Address or business evidence', 'Source-of-goods information', 'Enhanced manual review'] }], phoneAvailable: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_VERIFY_SERVICE_SID) };
}
export function verification(userId) {
    const u = assertUser(userId), r = db.prepare('SELECT * FROM shared_verification WHERE user_id=?').get(userId);
    const p = db.prepare('SELECT username,completed_at FROM account_profiles WHERE user_id=?').get(userId);
    const store = db.prepare('SELECT id FROM stores WHERE owner_id=? AND status=\'active\'').get(userId);
    const basic = !!(u.email_verified && u.phone_verified && p?.completed_at && store);
    const tier = Math.max(basic ? 1 : 0, Number(r?.approved_tier || 0));
    return { policy: tierPolicy(), tier, limitKobo: tier ? tierPolicy().tiers[tier - 1].limitKobo : 0, status: r?.status || (basic ? 'approved' : 'not_started'), requestedTier: Number(r?.requested_tier || 0), reason: r?.reason || '', checks: { email: !!u.email_verified, phone: !!u.phone_verified, profile: !!p?.completed_at, selling: !!store }, submission: parse(r?.data_json) };
}
const schema = z.object({ tier: z.number().int().min(2).max(3), legalName: z.string().trim().min(2).max(100), documentType: z.enum(['national_id', 'passport', 'drivers_licence', 'voters_card']), documentIds: z.array(identifier).min(1).max(3), address: z.string().trim().min(5).max(500), addressEvidenceIds: z.array(identifier).max(3).default([]), businessName: z.string().trim().max(120).default(''), sourceOfGoods: z.string().trim().max(2000).default('') }).strict();
export function submitVerification(userId, raw) {
    const d = schema.parse(raw), state = verification(userId);
    if (state.tier < d.tier - 1)
        throw new HttpError(422, 'Complete the previous verification tier first.');
    if (state.status === 'under_review')
        throw new HttpError(409, 'Your submission is already under review.');
    ownedMedia(userId, [...d.documentIds, ...d.addressEvidenceIds], ['document', 'evidence']);
    if (d.tier === 3 && (!d.addressEvidenceIds.length || d.sourceOfGoods.length < 10))
        throw new HttpError(422, 'Add address evidence and source-of-goods information.');
    return transaction(() => {
        lockUsers([userId]);
        db.prepare("INSERT INTO shared_verification(user_id,approved_tier,requested_tier,status,data_json,updated_at) VALUES(?,?,?,'under_review',?,?) ON CONFLICT(user_id) DO UPDATE SET requested_tier=excluded.requested_tier,status='under_review',data_json=excluded.data_json,reason='',updated_at=excluded.updated_at").run(userId, state.tier, d.tier, json(d), now());
        audit(userId, 'verification-submit', userId, { tier: d.tier });
        return verification(userId);
    });
}
export function reviewVerification(adminId, userId, raw) {
    const d = z.object({ decision: z.enum(['approve', 'needs_changes', 'reject']), reason: z.string().trim().max(1000).default(''), payoutOwnershipConfirmed: z.boolean().default(false) }).strict().parse(raw);
    return transaction(() => {
        lockUsers([userId]);
        const r = db.prepare('SELECT * FROM shared_verification WHERE user_id=?').get(userId);
        if (!r || r.status !== 'under_review')
            throw new HttpError(409, 'No pending verification.');
        if (d.decision === 'approve' && !d.payoutOwnershipConfirmed)
            throw new HttpError(422, 'Confirm the payout-account ownership review.');
        if (d.decision !== 'approve' && !d.reason)
            throw new HttpError(422, 'Explain what the seller needs to correct.');
        if (d.decision === 'approve')
            db.prepare("UPDATE stores SET verified=1,verification_status='verified',verified_at=?,updated_at=? WHERE owner_id=?").run(now(), now(), userId);
        db.prepare('UPDATE shared_verification SET approved_tier=?,status=?,reason=?,reviewed_by=?,updated_at=? WHERE user_id=?').run(d.decision === 'approve' ? r.requested_tier : r.approved_tier, d.decision === 'approve' ? 'approved' : d.decision, d.reason, adminId, now(), userId);
        audit(adminId, 'verification-review', userId, { decision: d.decision, tier: r.requested_tier });
        notify(userId,'verification',userId,'',{decision:d.decision,tier:r.requested_tier,reason:d.reason});
        return verification(userId);
    });
}
// Explicit rollout switch avoids retroactively changing live web behavior before approval.
export function assertListingTier(userId, priceKobo) {
    if (process.env.SELLER_TIER_ENFORCEMENT !== 'true')
        return;
    const v = verification(userId);
    if (!v.tier || priceKobo > v.limitKobo)
        throw new HttpError(403, 'Complete the required seller verification tier before publishing this price.', { requiredTier: tierPolicy().tiers.find(t => t.limitKobo >= priceKobo)?.tier || 3, limitKobo: v.limitKobo });
}
async function verifyRequest(route, body) {
    const sid = process.env.TWILIO_ACCOUNT_SID, secret = process.env.TWILIO_AUTH_TOKEN, service = process.env.TWILIO_VERIFY_SERVICE_SID;
    if (!/^AC[a-f0-9]{32}$/i.test(sid || '') || !/^VA[a-f0-9]{32}$/i.test(service || '') || !secret)
        throw new HttpError(503, 'Phone verification is temporarily unavailable.');
    const r = await fetch(`https://verify.twilio.com/v2/Services/${service}/${route}`, { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(sid + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body), signal: AbortSignal.timeout(10000) });
    if (!r.ok)
        throw new HttpError(503, 'Phone verification could not be completed. Try again later.');
    return r.json();
}
export async function requestPhone(userId, raw) {
    const { phone } = z.object({ phone: z.string().regex(/^\+[1-9]\d{7,14}$/) }).strict().parse(raw);
    const existing = db.prepare('SELECT * FROM shared_phone_checks WHERE user_id=?').get(userId);
    if (existing && Date.parse(existing.expires_at) > Date.now() + 9 * 60000)
        throw new HttpError(429, 'Wait one minute before requesting another code.');
    await verifyRequest('Verifications', { To: phone, Channel: 'sms' });
    db.prepare('INSERT INTO shared_phone_checks(user_id,phone,expires_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,expires_at=excluded.expires_at').run(userId, phone, new Date(Date.now() + 10 * 60000).toISOString());
    return { message: 'Verification code sent.' };
}
export async function confirmPhone(userId, raw) {
    const { code } = z.object({ code: z.string().regex(/^\d{4,10}$/) }).strict().parse(raw);
    const r = db.prepare('SELECT * FROM shared_phone_checks WHERE user_id=?').get(userId);
    if (!r || r.expires_at <= now())
        throw new HttpError(422, 'Request a new phone verification code.');
    const result = await verifyRequest('VerificationCheck', { To: r.phone, Code: code });
    if (result.status !== 'approved')
        throw new HttpError(422, 'The code is incorrect or expired.');
    return transaction(() => { lockUsers([userId]); const current = db.prepare('SELECT * FROM shared_phone_checks WHERE user_id=?').get(userId); if (!current || current.phone !== r.phone || current.expires_at !== r.expires_at)
        throw new HttpError(409, 'Request a new verification code.'); db.prepare('UPDATE users SET phone=?,phone_verified=1,phone_verified_at=?,updated_at=? WHERE id=?').run(r.phone, now(), now(), userId); db.prepare('DELETE FROM shared_phone_checks WHERE user_id=?').run(userId); audit(userId, 'phone-verified', userId); return { verified: true }; });
}
