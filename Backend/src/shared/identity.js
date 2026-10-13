import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, transaction } from "../db/database.js";
import { HttpError } from "../lib/http-error.js";
import { createSession } from "../lib/session.js";
import { id, hash, now, assertUser, lockUsers, audit } from "./core.js";
import { issueMobileSession } from "./sessions.js";
const providers = {
  google: {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    keys: "https://www.googleapis.com/oauth2/v3/certs",
    aud: "GOOGLE_CLIENT_IDS",
  },
  apple: {
    issuer: ["https://appleid.apple.com"],
    keys: "https://appleid.apple.com/auth/keys",
    aud: "APPLE_CLIENT_IDS",
  },
};
const keyCache = new Map();
export function identityChallenge(userId = "") {
  const nonce = crypto.randomBytes(32).toString("base64url"),
    key = id("challenge"),
    expiresAt = new Date(Date.now() + 5 * 60000).toISOString();
  db.prepare(
    "INSERT INTO shared_identity_challenges(id,nonce_hash,expires_at,user_id) VALUES(?,?,?,?)",
  ).run(key, hash(nonce), expiresAt, userId || null);
  return { id: key, nonce, appleNonce: hash(nonce), expiresAt };
}
async function verifyIdentity(provider, token, nonce) {
  const config = providers[provider],
    aud = (process.env[config.aud] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  if (!aud.length)
    throw new HttpError(503, "This sign-in provider is not configured.");
  const decoded = jwt.decode(token, { complete: true });
  if (
    !decoded ||
    decoded.header.alg !== "RS256" ||
    typeof decoded.header.kid !== "string"
  )
    throw new HttpError(401, "Invalid sign-in token.");
  let cached = keyCache.get(provider);
  if (!cached || cached.expires < Date.now()) {
    const response = await fetch(config.keys, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new HttpError(503, "Sign-in verification is unavailable.");
    const data = await response.json();
    if (!Array.isArray(data.keys) || data.keys.length > 20)
      throw new HttpError(503, "Invalid provider keys.");
    cached = { keys: data.keys, expires: Date.now() + 3600000 };
    keyCache.set(provider, cached);
  }
  const jwk = cached.keys.find(
    (k) =>
      k.kid === decoded.header.kid &&
      k.kty === "RSA" &&
      (!k.use || k.use === "sig"),
  );
  if (!jwk)
    throw new HttpError(
      401,
      "Provider key is unavailable. Try again after key refresh.",
    );
  let payload;
  try {
    payload = jwt.verify(
      token,
      crypto.createPublicKey({ key: jwk, format: "jwk" }),
      {
        algorithms: ["RS256"],
        issuer: config.issuer,
        audience: aud,
        clockTolerance: 30,
      },
    );
  } catch {
    throw new HttpError(401, "Invalid or expired sign-in token.");
  }
  if (
    typeof payload.sub !== "string" ||
    payload.sub.length > 255 ||
    payload.nonce !== (provider === "apple" ? hash(nonce) : nonce)
  )
    throw new HttpError(401, "Sign-in nonce mismatch.");
  if (
    !Number.isFinite(payload.iat) ||
    payload.iat > Date.now() / 1000 + 30 ||
    payload.iat < Date.now() / 1000 - 600
  )
    throw new HttpError(401, "Use a fresh sign-in token.");
  return payload;
}
export async function signInIdentity(raw, authenticatedUserId = "") {
  const input = z
    .object({
      provider: z.enum(["google", "apple"]),
      idToken: z.string().min(50).max(12000),
      challengeId: z.string().max(140),
      nonce: z.string().max(100),
      name: z.string().trim().min(2).max(80).default("Gleenc user"),
      client: z.enum(["web", "mobile"]).default("mobile"),
      password: z.string().max(72).optional(),
      deviceName: z.string().max(100).default("Gleenc mobile"),
    })
    .strict()
    .parse(raw);
  const challenge = db
    .prepare("SELECT * FROM shared_identity_challenges WHERE id=?")
    .get(input.challengeId);
  if (
    !challenge ||
    challenge.used_at ||
    challenge.expires_at <= now() ||
    challenge.nonce_hash !== hash(input.nonce) ||
    (challenge.user_id || "") !== authenticatedUserId
  )
    throw new HttpError(401, "Sign-in challenge expired or invalid.");
  if(authenticatedUserId){
    const proof=db.prepare('SELECT * FROM shared_link_proofs WHERE challenge_id=? AND user_id=? AND expires_at>?').get(input.challengeId,authenticatedUserId,now());
    const user=assertUser(authenticatedUserId);
    if(!proof&&(!input.password||!(await bcrypt.compare(input.password,user.password_hash))))throw new HttpError(401,'Confirm your account password before linking a sign-in provider.');
  }
  const claims = await verifyIdentity(
    input.provider,
    input.idToken,
    input.nonce,
  );
  const passwordHash = await bcrypt.hash(
    crypto.randomBytes(40).toString("base64url") + "aA1!",
    12,
  );
  return transaction(() => {
    const claim = db
      .prepare(
        "UPDATE shared_identity_challenges SET used_at=? WHERE id=? AND used_at IS NULL AND expires_at>?",
      )
      .run(now(), challenge.id, now());
    if (claim.changes !== 1)
      throw new HttpError(401, "Sign-in challenge already used.");
    const linked = db
      .prepare(
        "SELECT user_id FROM shared_identities WHERE provider=? AND subject=?",
      )
      .get(input.provider, claims.sub);
    let userId = linked?.user_id || authenticatedUserId;
    if (linked && authenticatedUserId && linked.user_id !== authenticatedUserId)
      throw new HttpError(409, "This identity is linked to another account.");
    if (!userId) {
      const email = z
        .string()
        .email()
        .max(160)
        .parse(claims.email)
        .toLowerCase();
      if (![true, "true"].includes(claims.email_verified))
        throw new HttpError(401, "The provider must verify this email.");
      // Email equality is not proof that the existing account consented to linking.
      if (db.prepare("SELECT id FROM users WHERE LOWER(email)=?").get(email))
        throw new HttpError(
          409,
          "Sign in to your existing account first, then link this provider in Settings.",
        );
      userId = id("user");
      db.prepare(
        "INSERT INTO users(id,name,email,password_hash,role,email_verified,email_verified_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        userId,
        input.name,
        email,
        passwordHash,
        "buyer",
        1,
        now(),
        now(),
        now(),
      );
    }
    const user = assertUser(userId);
    if (!["buyer", "seller"].includes(user.role))
      throw new HttpError(403, "Use the appropriate account portal.");
    lockUsers([userId]);
    db.prepare(
      "INSERT INTO shared_identities(provider,subject,user_id) VALUES(?,?,?) ON CONFLICT(provider,subject) DO NOTHING",
    ).run(input.provider, claims.sub, userId);
    audit(userId, "identity-login", input.provider);
    return {
      userId,
      session:
        input.client === "web"
          ? createSession(userId)
          : issueMobileSession(userId, input.deviceName),
      client: input.client,
    };
  });
}
