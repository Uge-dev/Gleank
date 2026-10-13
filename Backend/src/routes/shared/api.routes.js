import { googleConfigured,startGoogle,googleCallback,finishGoogle } from '../../shared/google-flow.js';
import { legalDocument } from '../../shared/legal.js';
import { verification, tierPolicy, submitVerification, reviewVerification, requestPhone, confirmPhone } from '../../shared/verification.js';
import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import multer from "multer";
import path from "node:path";
import { z } from "zod";
import { db, transaction } from "../../db/database.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { serializeUser } from "../../lib/serializers.js";
import {
  sessionCookieName,
  sessionCookieOptions,
  deleteSession,
} from "../../lib/session.js";
import {
  requireAuth,
  requireEmailVerified,
  requireAdminRole,
} from "../../middleware/auth.js";
import { loginSchema, registerSchema } from "../../schemas/auth.schemas.js";
import { loginUser, registerUser } from "../../services/auth.service.js";
import { saveFulfillmentSettings } from "../../services/account-profile.service.js";
import {
  likeProduct,
  unlikeProduct,
  addProductComment,
  productComments,
  deleteProductComment,
  likeProductComment,unlikeProductComment,
  recordProductShare,
} from "../../services/interaction.service.js";
import {
  issueMobileSession,
  rotateMobileSession,
  revokeMobileSession,
} from "../../shared/sessions.js";
import { identityChallenge, signInIdentity } from "../../shared/identity.js";
import {
  now,
  parse,
  json,
  page,
  TERMS_VERSION,
  assertTerms,
  assertUnblocked,
  identifier,
  notify,
  audit,
} from "../../shared/core.js";
import { storeMedia, privateRoot } from "../../shared/media.js";
import {
  account,
  acceptTerms,
  editProfile,
  saveSettings,
  addresses,
  saveAddress,
  blockAccount,
  requestDeletion,
  finalizeDeletion,
  deletionCandidates,
} from "../../shared/account.js";
import {
  profileCatalogue,
  saveCatalogue,
  saveProduct,
  productRow,
  publicProduct,
  ownerProduct,
  setProductState,
  reviewSharedProduct,
} from "../../shared/catalogue.js";
import {
  feed,
  person,
  connections,
  followPerson,
  reshare,
  trackPost,
  makeOffer,
  answerOffer,
  report,
  notificationFeed,
  activityCounts,
  reshareAnalytics,
} from "../../shared/social.js";
import {
  listCartV2,
  putCartV2,
  quoteSelection,
  publicQuote,
  beginCheckout,
  checkoutView,
  ownedCheckout,
  cancelCheckout,
  payFromWallet,
  walletView,
} from "../../shared/checkout.js";
import {
  initializeCheckout,
  verifyCheckout,
  createTopup,
  verifyTopup,
  requestWithdrawal,
  verifyWithdrawal,
} from "../../shared/payments.js";
import {
  listOrdersV2,
  orderView,
  prepareOrder,
  dispatchV2,
  confirmV2,
  receiptView,
  openIssue,
  replyIssue,
  resolveIssue,
  processRefund,
} from "../../shared/orders.js";
import {
  library,
  downloadToken,
  consumeDownload,
} from "../../shared/downloads.js";
import { reviewsFor, saveReview, reviewAction } from "../../shared/reviews.js";
import {
  directConversation,
  conversations,
  ownedConversation,
  conversationMessages,
  sendChat,
  acknowledge,
  changeMessage,
  chatSettings,
} from "../../shared/chat.js";
import { search, categories, saved, saveItem } from "../../shared/discovery.js";
import { linkProviderRefund, recoverPayment } from "../../shared/recovery.js";
import { registerPush } from "../../shared/push.js";
import {
  banks,
  recipient,
  saveRecipient,
} from "../../services/settlement.service.js";
export const sharedRouter = Router();
const uid = (req) => req.auth?.user_id || "";
const auth = [requireAuth, requireEmailVerified];
const run = (fn) => async (req, res) => {
  const value = await fn(req, res);
  if (!res.headersSent) res.json({ success: true, data: value });
};
const key = (req) => req.get("Idempotency-Key") || "";
const authLimit = rateLimit({
  windowMs: 15 * 60000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
sharedRouter.use(
  rateLimit({
    windowMs: 60000,
    limit: 180,
    keyGenerator: (req) =>
      req.auth ? "member:" + req.auth.user_id : ipKeyGenerator(req.ip),
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
sharedRouter.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  // Cookie mutations must originate from an allowed browser origin. Mobile sessions use Authorization.
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.auth &&
    !req.mobileAuth
  ) {
    const origin = req.get("Origin");
    const allowed = (env.corsOrigins || [env.frontendUrl]).map((s) =>
      s.replace(/\/+$/, ""),
    );
    if (!origin || !allowed.includes(origin.replace(/\/+$/, "")))
      throw new HttpError(403, "A trusted browser origin is required.");
  }
  next();
});
for(const [kind,route] of [['verification','verify-email'],['reset','reset-password']])sharedRouter.get('/auth/'+kind+'-link',(req,res)=>{
 const token=z.string().regex(/^[A-Za-z0-9_-]{32,256}$/).parse(req.query.token);
 const mobile='gleencexpo://'+route+'?token='+encodeURIComponent(token);
 const web=new URL('/'+route,env.frontendUrl);web.search=new URLSearchParams({token}).toString();
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 res.set({'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
 res.send(`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gleenc account</title></head><body style="font-family:system-ui;padding:32px;max-width:520px;margin:auto"><h1>${kind==='verification'?'Verify your email':'Reset your password'}</h1><p>Choose where to complete this account action.</p><p><a href="${escape(mobile)}">Open Gleenc app</a></p><p><a href="${escape(web.toString())}">Continue on the website</a></p><p>This link does not complete verification until you confirm the action.</p></body></html>`);
});
sharedRouter.get('/legal/:kind/page',(req,res)=>{
 const document=legalDocument(req.params.kind);if(!document)throw new HttpError(404,'Document not found.');
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 res.set({'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
 res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(document.title)} · Gleenc</title></head><body style="font-family:system-ui;line-height:1.7;max-width:760px;margin:40px auto;padding:0 24px;color:#171717"><header><h1>${escape(document.title)}</h1><p>Effective ${escape(document.effectiveDate)} · Version ${escape(document.version)}</p><nav><a href="/api/v2/legal/privacy/page">Privacy</a> · <a href="/api/v2/legal/terms/page">Terms</a> · <a href="/api/v2/legal/community/page">Community</a></nav></header><main>${document.sections.map(([title,body])=>`<section><h2>${escape(title)}</h2><p>${escape(body)}</p></section>`).join('')}</main><footer><p>Contact: <a href="mailto:${escape(document.supportEmail)}">${escape(document.supportEmail)}</a></p></footer></body></html>`);
});
sharedRouter.get('/legal/:kind',run(req => {const document=legalDocument(req.params.kind);if(!document)throw new HttpError(404,'Policy not found.');return document;}));
sharedRouter.get(
  "/capabilities",
  run(() => ({
    version: 2,
    termsVersion: TERMS_VERSION,
    currency: "NGN",
    maxResharePercent: 20,
    maxOfferDiscountPercent: 20,
    digitalNativeBilling: false,
    appleSignInAvailable: !!(process.env.APPLE_CLIENT_IDS||'').trim(),
    paymentsAvailable: env.paymentProvider==='paystack' && !!env.paystackSecretKey,
    uploadsAvailable: env.nodeEnv==='test' || !!process.env.CLAMAV_HOST,
    emailAvailable: !env.autoVerifyAuth && !!(env.brevoApiKey || (env.smtpHost && env.smtpUser && env.smtpPass)) && !!(env.emailFrom || env.smtpFromEmail),
    googleSignInAvailable: googleConfigured(),
    autoVerifyAuth: !env.isProduction && env.autoVerifyAuth,
    frontendUrl: env.frontendUrl,
    phoneVerificationAvailable: tierPolicy().phoneAvailable,
    ordering: ["single", "fixed_pack", "menu", "pack_extras"],
  })),
);
sharedRouter.post('/auth/google/start',authLimit,run(req=>startGoogle(req.body,uid(req))));
sharedRouter.get('/auth/google/callback',authLimit,async(req,res)=>{res.redirect(await googleCallback(req.query));});
sharedRouter.post('/auth/google/exchange',authLimit,run(req=>finishGoogle(req.body)));
for (const mode of ["login", "register"])
  sharedRouter.post(
    "/auth/" + mode,
    authLimit,
    run(async (req, res) => {
      const {
        client = "mobile",
        deviceName = "Gleenc mobile",
        ...body
      } = req.body || {};
      z.enum(["mobile", "web"]).parse(client);
      z.string().max(100).parse(deviceName);
      const result = await (mode === "login"
        ? loginUser(loginSchema.parse(body), {
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
          })
        : registerUser(
            registerSchema.parse({
              ...body,
              country: body.country || "Nigeria",
            }),
            { ipAddress: req.ip, userAgent: req.get("user-agent") },
          ));
      if (client === "web") {
        res.cookie(
          sessionCookieName,
          result.session.token,
          sessionCookieOptions(),
        );
        return {
          user: result.user,
          store: result.store,
          emailVerificationRequired: result.emailVerificationRequired,
        };
      }
      deleteSession(result.session.token);
      return {
        user: result.user,
        store: result.store,
        emailVerificationRequired: result.emailVerificationRequired,
        session: issueMobileSession(result.user.id, deviceName),
      };
    }),
  );
sharedRouter.post(
  "/auth/challenge",
  authLimit,
  run((req) => identityChallenge(uid(req))),
);
sharedRouter.post(
  "/auth/identity",
  authLimit,
  run(async (req, res) => {
    const result = await signInIdentity(req.body, uid(req));
    if (result.client === "web")
      res.cookie(
        sessionCookieName,
        result.session.token,
        sessionCookieOptions(),
      );
    return {
      user: serializeUser(
        db.prepare("SELECT * FROM users WHERE id=?").get(result.userId),
      ),
      ...(result.client === "mobile" ? { session: result.session } : {}),
    };
  }),
);
sharedRouter.post(
  "/auth/refresh",
  authLimit,
  run((req) =>
    rotateMobileSession(
      z
        .object({ refreshToken: z.string().max(100) })
        .strict()
        .parse(req.body).refreshToken,
    ),
  ),
);
sharedRouter.post(
  "/auth/logout",
  requireAuth,
  run((req, res) => {
    if (req.mobileAuth) revokeMobileSession(uid(req), req.auth.session_id);
    else {
      deleteSession(req.cookies?.[sessionCookieName]);
      res.clearCookie(sessionCookieName, sessionCookieOptions());
    }
    return { loggedOut: true };
  }),
);
sharedRouter.get(
  "/search",
  run((req) => search(uid(req), req.query)),
);
sharedRouter.get(
  "/categories",
  run(() => categories()),
);
sharedRouter.get(
  "/feed",
  run((req) => feed(uid(req), req.query)),
);
sharedRouter.get(
  "/products/:id",
  run((req) => publicProduct(productRow(req.params.id, uid(req)))),
);
sharedRouter.get(
  "/people/:id",
  run((req) => {
    if (uid(req)) assertUnblocked(uid(req), req.params.id);
    return person(req.params.id,uid(req));
  }),
);
sharedRouter.get(
  "/people/:id/catalogue",
  run((req) => {
    if (uid(req)) assertUnblocked(uid(req), req.params.id);
    person(req.params.id,uid(req));
    return profileCatalogue(req.params.id, req.query);
  }),
);
sharedRouter.get(
  "/people/:id/connections",
  run((req) => connections(uid(req), req.params.id, req.query)),
);
sharedRouter.get(
  "/products/:id/reviews",
  run((req) => reviewsFor(uid(req), req.params.id, req.query)),
);
sharedRouter.get(
  "/products/:id/comments",
  run((req) => {
    productRow(req.params.id, uid(req));
    return productComments(req.params.id, req.auth,{...page(req.query),sort:req.query.sort});
  }),
);
function sendAsset(res, row, attachment = false) {
  const target = path.resolve(row.private_path);
  if (!target.startsWith(privateRoot + path.sep))
    throw new HttpError(404, "File unavailable.");
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": attachment ? "private, no-store" : "public, max-age=300",
  });
  if (attachment) res.attachment(row.name || "download");
  res.type(row.mime_type);
  res.sendFile(target);
}
sharedRouter.get("/media/:id/public", (req, res) => {
  const row = db
    .prepare(
      "SELECT m.* FROM shared_media m JOIN users u ON u.id=m.owner_id WHERE m.id=? AND m.scan_status='clean' AND u.is_active=1",
    )
    .get(req.params.id);
  if (
    !row ||
    !["image", "video", "review", "avatar", "cover"].includes(row.kind)
  )
    throw new HttpError(404, "Media not found.");
  sendAsset(res, row);
});
sharedRouter.get('/verification-policy',run(() => tierPolicy()));
sharedRouter.use(requireAuth);
sharedRouter.get('/me/verification',run(req => verification(uid(req))));
sharedRouter.post('/me/phone/request',authLimit,run(req => requestPhone(uid(req),req.body)));
sharedRouter.post('/me/phone/confirm',authLimit,run(req => confirmPhone(uid(req),req.body)));
sharedRouter.post('/me/verification',requireEmailVerified,authLimit,run(req => submitVerification(uid(req),req.body)));
sharedRouter.post(
  "/me/push-devices",
  run((req) => registerPush(uid(req), req.body)),
);
sharedRouter.delete(
  "/me/push-devices",
  run((req) => {
    const token = z
      .object({ token: z.string().max(200) })
      .strict()
      .parse(req.body).token;
    db.prepare(
      "UPDATE shared_push_devices SET active=0 WHERE token=? AND user_id=?",
    ).run(token, uid(req));
    return { removed: true };
  }),
);
sharedRouter.get(
  "/saved",
  run((req) => saved(uid(req), req.query)),
);
sharedRouter.put(
  "/saved/:id",
  run((req) => saveItem(uid(req), req.params.id, true)),
);
sharedRouter.delete(
  "/saved/:id",
  run((req) => saveItem(uid(req), req.params.id, false)),
);
sharedRouter.get('/me/checkouts',run(req => db.prepare('SELECT * FROM shared_checkouts WHERE buyer_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(uid(req),page(req.query).limit,page(req.query).offset).map(checkoutView)));
sharedRouter.get(
  "/me",
  run((req) => account(uid(req))),
);
sharedRouter.post(
  "/me/terms",
  run((req) =>
    acceptTerms(
      uid(req),
      z.object({ version: z.string() }).strict().parse(req.body).version,
    ),
  ),
);
sharedRouter.patch(
  "/me/profile",
  run((req) => editProfile(uid(req), req.body)),
);
sharedRouter.put(
  "/me/settings",
  run((req) => saveSettings(uid(req), req.body)),
);
sharedRouter.get(
  "/me/addresses",
  run((req) => addresses(uid(req))),
);
sharedRouter.post(
  "/me/addresses",
  run((req) => saveAddress(uid(req), null, req.body)),
);
sharedRouter.put(
  "/me/addresses/:id",
  run((req) => saveAddress(uid(req), req.params.id, req.body)),
);
sharedRouter.delete(
  "/me/addresses/:id",
  run((req) => {
    db.prepare("DELETE FROM shared_addresses WHERE id=? AND user_id=?").run(
      req.params.id,
      uid(req),
    );
    return { deleted: true };
  }),
);
sharedRouter.put(
  "/me/blocks/:id",
  run((req) => blockAccount(uid(req), req.params.id, true)),
);
sharedRouter.delete(
  "/me/blocks/:id",
  run((req) => blockAccount(uid(req), req.params.id, false)),
);
sharedRouter.get(
  "/me/blocks",
  run((req) =>
    db
      .prepare("SELECT target_id,created_at FROM shared_blocks WHERE user_id=?")
      .all(uid(req)).map(row=>({...row,name:db.prepare("SELECT name FROM users WHERE id=?").get(row.target_id)?.name||"Blocked account"})),
  ),
);
sharedRouter.post(
  "/me/deletion",
  authLimit,
  run((req) => requestDeletion(uid(req), req.body)),
);
sharedRouter.get(
  "/me/devices",
  run((req) =>
    db
      .prepare(
        "SELECT id,device_name,created_at,expires_at FROM shared_sessions WHERE user_id=? AND revoked_at IS NULL AND expires_at>?",
      )
      .all(uid(req), now()),
  ),
);
sharedRouter.delete(
  "/me/devices/:id",
  run((req) => {
    revokeMobileSession(uid(req), req.params.id);
    return { revoked: true };
  }),
);
sharedRouter.post(
  "/me/presence",
  run((req) => {
    db.prepare(
      "INSERT INTO shared_presence(user_id,seen_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET seen_at=excluded.seen_at",
    ).run(uid(req), now());
    return { seenAt: now() };
  }),
);
sharedRouter.get(
  "/activity/counts",
  run((req) => activityCounts(uid(req))),
);
sharedRouter.get(
  "/notifications",
  run((req) => notificationFeed(uid(req), req.query)),
);
sharedRouter.post(
  "/notifications/read",
  run((req) => {
    const d = z
      .object({
        ids: z.array(identifier).max(100).optional(),
        all: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);
    if (d.all) {
      db.prepare(
        "UPDATE shared_notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",
      ).run(now(), uid(req));
      db.prepare(
        "UPDATE notifications SET is_read=1,read_at=? WHERE user_id=? AND is_read=0",
      ).run(now(), uid(req));
    } else
      for (const k of d.ids || []) {
        db.prepare(
          "UPDATE shared_notifications SET read_at=? WHERE id=? AND user_id=?",
        ).run(now(), k, uid(req));
        db.prepare(
          "UPDATE notifications SET is_read=1,read_at=? WHERE id=? AND user_id=?",
        ).run(now(), k, uid(req));
      }
    return { updated: true };
  }),
);
sharedRouter.get(
  "/conversations",
  run((req) => conversations(uid(req), req.query)),
);
sharedRouter.post(
  "/conversations",
  requireEmailVerified,
  run((req) =>
    directConversation(
      uid(req),
      z.object({ userId: identifier }).strict().parse(req.body).userId,
    ),
  ),
);
sharedRouter.get(
  "/conversations/:id/messages",
  run((req) => conversationMessages(uid(req), req.params.id, req.query)),
);
sharedRouter.post(
  "/conversations/:id/messages",
  requireEmailVerified,
  run((req) => sendChat(uid(req), req.params.id, req.body, key(req))),
);
sharedRouter.post(
  "/conversations/:id/ack",
  run((req) => acknowledge(uid(req), req.params.id, req.body)),
);
sharedRouter.patch(
  "/conversations/:id/messages/:messageId",
  run((req) =>
    changeMessage(uid(req), req.params.id, req.params.messageId, req.body),
  ),
);
sharedRouter.put(
  "/conversations/:id/settings",
  run((req) => chatSettings(uid(req), req.params.id, req.body)),
);
sharedRouter.get("/media/:id/private", (req, res) => {
  const row = db
    .prepare("SELECT * FROM shared_media WHERE id=? AND scan_status='clean'")
    .get(req.params.id);
  if (!row || (row.kind === "digital" && row.owner_id !== uid(req)))
    throw new HttpError(404, "Private media unavailable.");
  let access = row.owner_id === uid(req);
  if (!access)
    access = !!db
      .prepare(
        "SELECT 1 FROM shared_message_meta m JOIN messages x ON x.id=m.message_id JOIN conversations c ON c.id=x.conversation_id WHERE m.attachment_id=? AND m.deleted_at IS NULL AND (c.buyer_id=? OR c.seller_id=?)",
      )
      .get(row.id, uid(req), uid(req));
  if (!access)
    access = db
      .prepare(
        "SELECT p.data_json FROM shared_packages p JOIN shared_order_lines l ON l.id=p.line_id JOIN shared_orders o ON o.id=l.order_id WHERE o.buyer_id=? OR o.seller_id=?",
      )
      .all(uid(req), uid(req))
      .some((p) => parse(p.data_json).receiptId === row.id);
  if (!access)
    access = db
      .prepare(
        "SELECT i.evidence_json FROM shared_issues i JOIN shared_order_lines l ON l.id=i.line_id JOIN shared_orders o ON o.id=l.order_id WHERE o.buyer_id=? OR o.seller_id=?",
      )
      .all(uid(req), uid(req))
      .some((i) => parse(i.evidence_json, []).includes(row.id));
  if (!access) throw new HttpError(404, "Private media unavailable.");
  sendAsset(res, row, true);
});
sharedRouter.use(requireEmailVerified);
sharedRouter.put(
  "/me/selling",
  run((req) => {
    assertTerms(uid(req));
    return saveFulfillmentSettings(uid(req), req.body);
  }),
);
let activeUploads = 0;
function uploadSlot(req, res, next) {
  if (activeUploads >= 3) {
    res.set("Retry-After", "5");
    throw new HttpError(429, "Uploads are busy. Try again shortly.");
  }
  activeUploads++;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      activeUploads--;
    }
  };
  res.once("finish", release);
  res.once("close", release);
  next();
}
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 1, parts: 3 },
});
sharedRouter.post(
  "/media",
  rateLimit({ windowMs: 60000, limit: 10 }),
  uploadSlot,
  upload.single("file"),
  run((req) => {
    assertTerms(uid(req));
    return storeMedia(
      uid(req),
      req.file,
      z
        .enum([
          "image",
          "video",
          "digital",
          "document",
          "voice",
          "review",
          "avatar",
          "cover",
          "receipt",
          "chat_image",
          "evidence",
        ])
        .parse(req.body.kind),
    );
  }),
);
sharedRouter.post(
  "/catalogue",
  run((req) => {
    assertTerms(uid(req));
    return saveCatalogue(uid(req), null, req.body);
  }),
);
sharedRouter.put(
  "/catalogue/:id",
  run((req) => {
    assertTerms(uid(req));
    return saveCatalogue(uid(req), req.params.id, req.body);
  }),
);
sharedRouter.post(
  "/products",
  run((req) => saveProduct(uid(req), null, req.body)),
);
sharedRouter.put(
  "/products/:id",
  run((req) => saveProduct(uid(req), req.params.id, req.body)),
);
sharedRouter.get(
  "/me/products/:id",
  run((req) => ownerProduct(uid(req), req.params.id)),
);
sharedRouter.get(
  "/me/products",
  run((req) => {
    const p = page(req.query);
    return db
      .prepare(
        "SELECT p.id FROM products p JOIN stores s ON s.id=p.store_id WHERE s.owner_id=? ORDER BY p.created_at DESC LIMIT ? OFFSET ?",
      )
      .all(uid(req), p.limit, p.offset)
      .map((p) => {
        const row = productRow(p.id, uid(req), true);
        return {
          fileIds: row.details.fileIds || [],
          publication: row.details.publication || "draft",
          ...publicProduct(row),
          state: row.state || row.status,
          publishAt: row.publish_at,
        };
      });
  }),
);
sharedRouter.put(
  "/products/:id/availability",
  run((req) =>
    setProductState(
      uid(req),
      req.params.id,
      z.object({ active: z.boolean() }).strict().parse(req.body).active,
    ),
  ),
);
sharedRouter.delete(
  '/products/:id',
  run(req => setProductState(uid(req), req.params.id, false)),
);
sharedRouter.delete(
  '/posts/:id',
  run(req => transaction(() => {
    const post = db.prepare('SELECT * FROM shared_posts WHERE id=? AND author_id=?').get(req.params.id, uid(req));
    if (!post) throw new HttpError(404, 'Post not found.');
    if (!post.original_id) return setProductState(uid(req), post.product_id, false);
    db.prepare('UPDATE shared_posts SET active=0 WHERE id=? AND author_id=?').run(post.id, uid(req));
    return { active: false };
  })),
);
sharedRouter.post(
  "/people/:id/follow",
  run((req) => followPerson(uid(req), req.params.id, true)),
);
sharedRouter.delete(
  "/people/:id/follow",
  run((req) => followPerson(uid(req), req.params.id, false)),
);
sharedRouter.post(
  "/posts/:id/reshare",
  run((req) => reshare(uid(req), req.params.id, req.body)),
);
sharedRouter.post(
  "/posts/:id/events",
  run((req) => {
    const kind = z
      .object({ kind: z.enum(["share", "view", "open"]) })
      .strict()
      .parse(req.body).kind;
    const result = trackPost(uid(req), req.params.id, kind);
    if (kind === "share") {
      const p = db
        .prepare("SELECT product_id FROM shared_posts WHERE id=?")
        .get(req.params.id);
      recordProductShare(uid(req), p.product_id);
    }
    return result;
  }),
);
sharedRouter.get(
  "/me/reshare-analytics",
  run((req) => reshareAnalytics(uid(req))),
);
sharedRouter.post(
  "/products/:id/like",
  run((req) => {
    assertTerms(uid(req));
    const p = productRow(req.params.id, uid(req));
    const result = likeProduct(uid(req), p.id);
    if (p.owner_id !== uid(req)) notify(p.owner_id, "like", p.id, uid(req));
    return result;
  }),
);
sharedRouter.delete(
  "/products/:id/like",
  run((req) => {
    productRow(req.params.id, uid(req));
    return unlikeProduct(uid(req), req.params.id);
  }),
);
sharedRouter.put('/products/:id/comments/:commentId/like',run(req=>{assertTerms(uid(req));productRow(req.params.id,uid(req));return likeProductComment(uid(req),req.params.id,req.params.commentId);}));
sharedRouter.delete('/products/:id/comments/:commentId/like',run(req=>{productRow(req.params.id,uid(req));return unlikeProductComment(uid(req),req.params.id,req.params.commentId);}));
sharedRouter.post(
  "/products/:id/comments",
  run((req) => {
    assertTerms(uid(req));
    const p = productRow(req.params.id, uid(req));
    const result = addProductComment(
      uid(req),
      p.id,
      z
        .object({
          body: z.string().trim().min(1).max(500),
          parentCommentId: identifier.optional(),
        })
        .strict()
        .parse(req.body),
    );
    if (p.owner_id !== uid(req)) notify(p.owner_id, "comment", p.id, uid(req));
    return result;
  }),
);
sharedRouter.delete(
  "/products/:id/comments/:commentId",
  run((req) =>
    deleteProductComment(req.auth, req.params.id, req.params.commentId),
  ),
);
sharedRouter.post(
  "/reports",
  run((req) => report(uid(req), req.body)),
);
sharedRouter.post('/offers/preview',run(req=>{const {discountPercent,...selection}=req.body||{};return publicQuote(quoteSelection(uid(req),selection,{offer:false,previewDiscountPercent:z.number().min(0).max(20).parse(discountPercent)}));}));
sharedRouter.post(
  "/offers",
  run((req) => makeOffer(uid(req), req.body)),
);
sharedRouter.get(
  "/offers",
  run((req) => {
    const p = page(req.query);
    return db
      .prepare(
        "SELECT * FROM shared_offers WHERE buyer_id=? OR seller_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      )
      .all(uid(req), uid(req), p.limit, p.offset)
      .map((o) => ({
        id: o.id,
        buyerId: o.buyer_id,
        sellerId: o.seller_id,
        productId: o.product_id,
        input: parse(o.input_json),
        quote: parse(o.quoted_json),
        discountBps: o.discount_bps,
        status: o.status,
        expiresAt: o.expires_at,
      }));
  }),
);
sharedRouter.get('/offers/:id',run(req => {const o=db.prepare('SELECT * FROM shared_offers WHERE id=? AND (buyer_id=? OR seller_id=?)').get(req.params.id,uid(req),uid(req));if(!o)throw new HttpError(404,'Offer not found.');return {id:o.id,buyerId:o.buyer_id,sellerId:o.seller_id,productId:o.product_id,input:parse(o.input_json),quote:parse(o.quoted_json),discountBps:o.discount_bps,status:o.status,expiresAt:o.expires_at};}));
sharedRouter.post(
  "/offers/:id/answer",
  run((req) => answerOffer(uid(req), req.params.id, req.body)),
);
sharedRouter.post(
  "/quote",
  run((req) => publicQuote(quoteSelection(uid(req), req.body))),
);
sharedRouter.get(
  "/cart",
  run((req) => listCartV2(uid(req))),
);
sharedRouter.post(
  "/cart",
  run((req) => putCartV2(uid(req), null, req.body)),
);
sharedRouter.put(
  "/cart/:id",
  run((req) => putCartV2(uid(req), req.params.id, req.body)),
);
sharedRouter.delete(
  "/cart/:id",
  run((req) => {
    db.prepare("DELETE FROM shared_cart WHERE id=? AND user_id=?").run(
      req.params.id,
      uid(req),
    );
    return { deleted: true };
  }),
);
sharedRouter.post(
  "/checkouts",
  run((req) => {
    assertTerms(uid(req));
    const clientPlatform=req.mobileAuth?(req.body?.clientPlatform==='ios'?'ios':'android'):'web';
    return beginCheckout(uid(req), {...req.body,clientPlatform}, key(req));
  }),
);
sharedRouter.get(
  "/checkouts/:id",
  run((req) => checkoutView(ownedCheckout(uid(req), req.params.id))),
);
sharedRouter.post(
  "/checkouts/:id/cancel",
  run((req) => cancelCheckout(uid(req), req.params.id)),
);
sharedRouter.post(
  "/checkouts/:id/pay",
  run((req) => {rejectNativeDigitalPayment(req,ownedCheckout(uid(req),req.params.id));return payFromWallet(uid(req),req.params.id);}),
);
sharedRouter.post(
  "/checkouts/:id/initialize",
  run((req) => {rejectNativeDigitalPayment(req,ownedCheckout(uid(req),req.params.id));return initializeCheckout(uid(req),req.params.id);}),
);
sharedRouter.post(
  "/checkouts/:id/verify",
  run((req) => verifyCheckout(uid(req), req.params.id)),
);
sharedRouter.get(
  "/orders",
  run((req) => listOrdersV2(uid(req), req.query)),
);
sharedRouter.get(
  "/orders/:id",
  run((req) => orderView(uid(req), req.params.id)),
);
sharedRouter.get(
  "/orders/:id/receipt",
  run((req) => receiptView(uid(req), req.params.id)),
);
sharedRouter.post(
  "/orders/:id/prepare",
  run((req) => prepareOrder(uid(req), req.params.id)),
);
sharedRouter.post(
  "/orders/:id/packages/:packageId/dispatch",
  run((req) =>
    dispatchV2(uid(req), req.params.id, req.params.packageId, req.body),
  ),
);
sharedRouter.post(
  "/orders/:id/packages/:packageId/confirm",
  run((req) =>
    confirmV2(uid(req), req.params.id, req.params.packageId, req.body),
  ),
);
sharedRouter.post(
  "/issues/:id/reply",
  run((req) => replyIssue(uid(req), req.params.id, req.body)),
);
sharedRouter.post(
  "/lines/:id/issues",
  run((req) => openIssue(uid(req), req.params.id, req.body)),
);
sharedRouter.get(
  "/issues",
  run((req) => {
    const p = page(req.query);
    return db
      .prepare(
        "SELECT i.*,o.seller_id,o.buyer_id,o.id AS order_id FROM shared_issues i JOIN shared_order_lines l ON l.id=i.line_id JOIN shared_orders o ON o.id=l.order_id WHERE o.buyer_id=? OR o.seller_id=? ORDER BY i.created_at DESC LIMIT ? OFFSET ?",
      )
      .all(uid(req), uid(req), p.limit, p.offset);
  }),
);
sharedRouter.post(
  "/lines/:id/review",
  run((req) => saveReview(uid(req), req.params.id, req.body)),
);
sharedRouter.patch(
  "/reviews/:id",
  run((req) => reviewAction(uid(req), req.params.id, req.body)),
);
sharedRouter.get(
  "/wallet/banks",
  run(() => banks()),
);
sharedRouter.get(
  "/wallet/recipient",
  run((req) => recipient(uid(req))),
);
sharedRouter.put(
  "/wallet/recipient",
  authLimit,
  run((req) => saveRecipient(req.auth, req.body)),
);
sharedRouter.get(
  "/wallet",
  run((req) => walletView(uid(req))),
);
sharedRouter.post(
  "/wallet/topups",
  run((req) =>
    createTopup(
      uid(req),
      z.object({ amountKobo: z.number() }).strict().parse(req.body).amountKobo,
      key(req),
    ),
  ),
);
sharedRouter.post(
  "/wallet/topups/:id/verify",
  run((req) => verifyTopup(uid(req), req.params.id)),
);
sharedRouter.post(
  "/wallet/withdrawals",
  authLimit,
  run((req) =>
    requestWithdrawal(
      uid(req),
      z.object({ amountKobo: z.number() }).strict().parse(req.body).amountKobo,
      key(req),
    ),
  ),
);
sharedRouter.post(
  "/wallet/withdrawals/:id/verify",
  run((req) => verifyWithdrawal(uid(req), req.params.id)),
);
sharedRouter.get(
  "/library",
  run((req) => library(uid(req), req.query)),
);
sharedRouter.post(
  "/library/:id/download-token",
  run((req) =>
    downloadToken(
      uid(req),
      req.params.id,
      z.object({ mediaId: identifier }).strict().parse(req.body).mediaId,
    ),
  ),
);
sharedRouter.post("/library/download", (req, res) =>
  sendAsset(
    res,
    consumeDownload(
      uid(req),
      z
        .object({ token: z.string().max(100) })
        .strict()
        .parse(req.body).token,
    ),
    true,
  ),
);
sharedRouter.use("/admin", requireAdminRole);
sharedRouter.get('/admin/verifications',run(req => db.prepare("SELECT user_id,approved_tier,requested_tier,status,updated_at FROM shared_verification WHERE status='under_review' ORDER BY updated_at LIMIT ? OFFSET ?").all(page(req.query).limit,page(req.query).offset)));
sharedRouter.get('/admin/verifications/:id',run(req => verification(req.params.id)));
sharedRouter.post('/admin/verifications/:id/review',run(req => reviewVerification(uid(req),req.params.id,req.body)));
sharedRouter.get('/admin/verifications/:id/media/:mediaId',run((req,res) => {
 const submission=verification(req.params.id).submission;
 if(![...(submission.documentIds||[]),...(submission.addressEvidenceIds||[])].includes(req.params.mediaId)) throw new HttpError(404,'Evidence not found.');
 const row=db.prepare("SELECT * FROM shared_media WHERE id=? AND owner_id=? AND scan_status='clean'").get(req.params.mediaId,req.params.id);
 if(!row)throw new HttpError(404,'Evidence not found.'); sendAsset(res,row,true);
}));
sharedRouter.get(
  "/admin/deletions",
  run(() => deletionCandidates()),
);
sharedRouter.post(
  "/admin/deletions/:id/finalize",
  run((req) => finalizeDeletion(uid(req), req.params.id)),
);
sharedRouter.post(
  "/admin/refunds/:id/link-provider",
  run((req) =>
    linkProviderRefund(
      uid(req),
      req.params.id,
      z.object({ providerId: z.string() }).strict().parse(req.body).providerId,
    ),
  ),
);
sharedRouter.post(
  "/admin/recoveries/:id/link-provider",
  run((req) =>
    linkProviderRefund(
      uid(req),
      req.params.id,
      z.object({ providerId: z.string() }).strict().parse(req.body).providerId,
      true,
    ),
  ),
);
sharedRouter.post(
  "/admin/recoveries/:id/reconcile",
  run((req) => recoverPayment(req.params.id)),
);
sharedRouter.get(
  "/admin/reports",
  run((req) => {
    const p = page(req.query);
    return db
      .prepare(
        "SELECT * FROM shared_reports WHERE status='pending' ORDER BY created_at LIMIT ? OFFSET ?",
      )
      .all(p.limit, p.offset);
  }),
);
sharedRouter.post(
  "/admin/reports/:id/resolve",
  run((req) => {
    const d = z
      .object({
        note: z.string().trim().min(5).max(2000),
        hide: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);
    return transaction(() => {
      const r = db
        .prepare("SELECT * FROM shared_reports WHERE id=?")
        .get(req.params.id);
      if (!r) throw new HttpError(404, "Report not found.");
      if (d.hide) {
        if (r.kind === "post")
          db.prepare("UPDATE shared_posts SET active=0 WHERE id=?").run(
            r.target_id,
          );
        else if (r.kind === "review")
          db.prepare("UPDATE shared_reviews SET deleted_at=? WHERE id=?").run(
            now(),
            r.target_id,
          );
        else if (r.kind === "comment")
          db.prepare("UPDATE product_comments SET is_deleted=1 WHERE id=?").run(
            r.target_id,
          );
        else if (r.kind === "product") {
          db.prepare("UPDATE products SET status='draft' WHERE id=?").run(
            r.target_id,
          );
          db.prepare(
            "UPDATE shared_products SET state='paused' WHERE product_id=?",
          ).run(r.target_id);
        } else
          throw new HttpError(422, "Use account moderation for this target.");
      }
      db.prepare(
        "UPDATE shared_reports SET status='resolved',resolution=? WHERE id=?",
      ).run(d.note, r.id);
      audit(uid(req), "resolve-report", r.id, d);
      return { resolved: true };
    });
  }),
);
sharedRouter.get(
  "/admin/products",
  run((req) => {
    const p = page(req.query);
    return db
      .prepare(
        "SELECT product_id,state,publish_at,updated_at FROM shared_products WHERE state='pending_review' ORDER BY updated_at LIMIT ? OFFSET ?",
      )
      .all(p.limit, p.offset);
  }),
);
sharedRouter.post(
  "/admin/products/:id/review",
  run((req) =>
    reviewSharedProduct(
      req.auth,
      req.params.id,
      z.object({ approved: z.boolean() }).strict().parse(req.body).approved,
    ),
  ),
);
sharedRouter.post(
  "/admin/issues/:id/resolve",
  run((req) => resolveIssue(uid(req), req.params.id, req.body)),
);
sharedRouter.post(
  "/admin/refunds/:id/reconcile",
  run((req) => processRefund(req.params.id)),
);
sharedRouter.get(
  "/admin/finance",
  run(() => ({
    checkouts: db
      .prepare(
        "SELECT id,buyer_id,status,reference,total_kobo FROM shared_checkouts WHERE status IN ('refund_required','initializing') LIMIT 100",
      )
      .all(),
    refunds: db
      .prepare(
        "SELECT * FROM shared_refunds WHERE status<>'processed' LIMIT 100",
      )
      .all(),
    withdrawals: db
      .prepare(
        "SELECT * FROM shared_transfers WHERE status='pending' LIMIT 100",
      )
      .all(),
    holds: db.prepare("SELECT * FROM shared_wallet_holds LIMIT 100").all(),
    recoveries: db
      .prepare(
        "SELECT * FROM shared_payment_recoveries WHERE status<>'processed' LIMIT 100",
      )
      .all(),
  })),
);

function rejectNativeDigitalPayment(req,row){if(req.mobileAuth&&row.status!=='paid'&&checkoutView(row).items.some(item=>item.product?.kind==='digital'))throw new HttpError(422,'Digital purchases are not currently available in this mobile app.');}
