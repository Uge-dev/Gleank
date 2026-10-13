import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { db, transaction } from '../db/database.js';
import { env } from '../config/env.js';
import { HttpError } from '../lib/http-error.js';
import { now, hash, assertUser } from './core.js';
import { identityChallenge, signInIdentity } from './identity.js';
import { serializeUser } from '../lib/serializers.js';
export const mobileReturn = 'gleencexpo://oauth';
export function migrateGoogleFlow() { db.exec("CREATE TABLE IF NOT EXISTS shared_link_proofs(challenge_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL)"); db.exec("CREATE TABLE IF NOT EXISTS shared_google_flows(id TEXT PRIMARY KEY,verifier_hash TEXT NOT NULL,data_cipher TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'created',result_cipher TEXT NOT NULL DEFAULT '',expires_at TEXT NOT NULL,used_at TEXT)"); }
const encryptionKey = () => crypto.createHash('sha256').update(env.jwtSecret + ':google-flow-v1').digest();
function seal(value) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv), data = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), data]).toString('base64url'); }
function open(value) { const data = Buffer.from(value, 'base64url'), d = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), data.subarray(0, 12)); d.setAuthTag(data.subarray(12, 28)); return JSON.parse(Buffer.concat([d.update(data.subarray(28)), d.final()]).toString('utf8')); }
export function googleConfigured() { try {
    const uri = new URL(process.env.GOOGLE_OAUTH_REDIRECT_URI || '');
    return !!(process.env.GOOGLE_WEB_CLIENT_ID && process.env.GOOGLE_WEB_CLIENT_SECRET && (uri.protocol === 'https:' || (!env.isProduction && uri.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(uri.hostname))) && (process.env.GOOGLE_CLIENT_IDS || '').split(',').map(v => v.trim()).includes(process.env.GOOGLE_WEB_CLIENT_ID));
}
catch {
    return false;
} }
export async function startGoogle(raw, userId = '') {
    if (!googleConfigured())
        throw new HttpError(503, 'Google sign-in is temporarily unavailable.');
    const input = z.object({ verifierHash: z.string().regex(/^[a-f0-9]{64}$/), link: z.boolean().default(false), password: z.string().max(72).optional() }).strict().parse(raw);
    if (input.link && !userId)
        throw new HttpError(401, 'Sign in before linking Google.');
    if (input.link) {
        const user = db.prepare('SELECT password_hash FROM users WHERE id=? AND is_active=1').get(userId);
        if (!input.password || !user || !(await bcrypt.compare(input.password, user.password_hash)))
            throw new HttpError(401, 'Confirm your account password before linking Google.');
    }
    const challenge = identityChallenge(input.link ? userId : ''), state = crypto.randomBytes(32).toString('base64url');
    if (input.link)
        db.prepare('INSERT INTO shared_link_proofs(challenge_id,user_id,expires_at) VALUES(?,?,?)').run(challenge.id, userId, challenge.expiresAt);
    db.prepare('INSERT INTO shared_google_flows(id,verifier_hash,data_cipher,expires_at) VALUES(?,?,?,?)').run(state, input.verifierHash, seal({ challenge, linkedUser: input.link ? userId : '' }), challenge.expiresAt);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: process.env.GOOGLE_WEB_CLIENT_ID, redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI, response_type: 'code', scope: 'openid email profile', state, nonce: challenge.nonce, prompt: 'select_account' }).toString();
    return { url: url.toString(), returnUrl: mobileReturn };
}
export async function googleCallback(query) {
    const input = z.object({ state: z.string().regex(/^[A-Za-z0-9_-]{43}$/), code: z.string().max(4000).optional(), error: z.string().max(100).optional() }).passthrough().parse(query);
    const flow = db.prepare('SELECT * FROM shared_google_flows WHERE id=? AND expires_at>? AND status=\'created\'').get(input.state, now());
    if (!flow)
        throw new HttpError(401, 'Sign-in request expired.');
    if (db.prepare("UPDATE shared_google_flows SET status='processing' WHERE id=? AND status='created'").run(flow.id).changes !== 1)
        throw new HttpError(401, 'Sign-in request was already used.');
    if (input.error || !input.code) {
        db.prepare("UPDATE shared_google_flows SET status='failed' WHERE id=?").run(flow.id);
        return mobileReturn + '?error=cancelled';
    }
    try {
        const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: input.code, client_id: process.env.GOOGLE_WEB_CLIENT_ID, client_secret: process.env.GOOGLE_WEB_CLIENT_SECRET, redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI, grant_type: 'authorization_code' }), signal: AbortSignal.timeout(10000) });
        if (!response.ok)
            throw new HttpError(401, 'Google sign-in could not be verified.');
        const tokens = await response.json(), data = open(flow.data_cipher);
        const result = await signInIdentity({ provider: 'google', idToken: tokens.id_token, challengeId: data.challenge.id, nonce: data.challenge.nonce, client: 'mobile' }, data.linkedUser);
        db.prepare("UPDATE shared_google_flows SET status='ready',result_cipher=?,data_cipher='' WHERE id=? AND status='processing'").run(seal({ user: serializeUser(db.prepare('SELECT * FROM users WHERE id=?').get(result.userId)), session: result.session }), flow.id);
        return mobileReturn + '?code=' + encodeURIComponent(flow.id);
    }
    catch (e) {
        db.prepare("UPDATE shared_google_flows SET status='failed',data_cipher='' WHERE id=?").run(flow.id);
        return mobileReturn + '?error=verification_failed';
    }
}
export function finishGoogle(raw) {
    const { code, verifier } = z.object({ code: z.string().regex(/^[A-Za-z0-9_-]{43}$/), verifier: z.string().regex(/^[a-f0-9]{64}$/), client: z.literal('mobile').optional() }).strict().parse(raw);
    return transaction(() => {
        const row = db.prepare("SELECT * FROM shared_google_flows WHERE id=? AND status='ready' AND used_at IS NULL AND expires_at>?").get(code, now());
        if (!row || !crypto.timingSafeEqual(Buffer.from(row.verifier_hash, 'hex'), Buffer.from(hash(verifier), 'hex')))
            throw new HttpError(401, 'Sign-in request expired or invalid.');
        const result = open(row.result_cipher);
        const user = assertUser(result.user.id);
        if (!['buyer', 'seller'].includes(user.role))
            throw new HttpError(403, 'Use the appropriate account portal.');
        result.user = serializeUser(user);
        if (db.prepare("UPDATE shared_google_flows SET status='used',used_at=?,result_cipher='' WHERE id=? AND used_at IS NULL").run(now(), code).changes !== 1)
            throw new HttpError(401, 'Sign-in request already used.');
        return result;
    });
}
export function expireGoogleFlows() { const expired = db.prepare("SELECT * FROM shared_google_flows WHERE expires_at<=? AND status='ready'").all(now()); for (const row of expired) {
    try {
        const result = open(row.result_cipher);
        db.prepare('UPDATE shared_sessions SET revoked_at=? WHERE id=?').run(now(), result.session.sessionId);
    }
    catch { }
} db.prepare('DELETE FROM shared_google_flows WHERE expires_at<=?').run(now()); }
