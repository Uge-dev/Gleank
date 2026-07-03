# Gleenc production deployment runbook

This document is the production setup checklist for Gleenc.

## 1. Third-party accounts required

Create these before deploying:

- Neon: production PostgreSQL database.
- Cloudinary: production image storage.
- SMTP provider such as Brevo: email verification and password reset.
- Payment provider: Paystack or Flutterwave live account before real payments.
- Frontend host: Vercel, Netlify, or similar static React hosting.
- Backend host: Render, Railway, Fly.io, or another Node.js server host.

## 2. Neon PostgreSQL

Neon gives you a Postgres connection string that looks like:

```env
DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DB?sslmode=verify-full&channel_binding=require
```

Verify the connection from the backend folder:

```bash
cd Backend
npm run neon:check
```

Important: the backend now supports `DATABASE_PROVIDER=postgres` through the shared database adapter. Use Neon for production so accounts, stores, products, uploads, chats, notifications, and admin data persist after Render redeploys.

If you have useful local SQLite data to copy into Neon, run this from the backend folder after setting `DATABASE_URL`:

```bash
npm run migrate:neon
```

By default it reads `./data/gleank.sqlite`. To choose another SQLite file, set:

```bash
SQLITE_MIGRATION_SOURCE=/absolute/path/to/gleank.sqlite npm run migrate:neon
```

The migration creates the Neon schema first, then upserts rows table-by-table. It does not delete the SQLite file.

## 3. Cloudinary image storage

Set these backend environment variables:

```env
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_FOLDER=gleenc
IMAGE_MAX_WIDTH=1800
IMAGE_WEBP_QUALITY=86
MAX_UPLOAD_MB=5
```

When `STORAGE_PROVIDER=cloudinary`, uploaded images are:

1. Accepted by Multer.
2. Compressed through Sharp.
3. Converted to high-quality WebP where safe.
4. Uploaded to Cloudinary.
5. Stored in the database as Cloudinary secure URLs.

GIF files are kept as GIF to avoid destroying animation.

## 4. Backend production environment

Minimum backend production variables:

```env
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://your-frontend-domain.com
JWT_SECRET=use-a-long-random-secret-at-least-48-characters
SESSION_DAYS=7

DATABASE_PROVIDER=postgres
DATABASE_URL=postgresql://...

STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=gleenc

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=Gleenc <no-reply@your-domain.com>
SMTP_FROM_NAME=Gleenc
SMTP_FROM_EMAIL=no-reply@your-domain.com
EMAIL_PROVIDER=brevo-api
BREVO_API_KEY=
EMAIL_DIAGNOSTIC_TOKEN=replace-with-a-private-random-token

PAYMENT_PROVIDER=paystack
PAYSTACK_MODE=live
ALLOW_PAYSTACK_TEST_KEYS_IN_PRODUCTION=false
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...
PAYSTACK_CALLBACK_URL=https://your-frontend-domain.com/payment/callback

AUTO_VERIFY_AUTH=false
AUTO_ACTIVATE_SELLER_SUBSCRIPTION=false
AUTO_APPROVE_USED_LISTINGS=false
```

Run:

```bash
cd Backend
npm run production:check
```

If the Paystack account is still in test mode on a deployed backend, set:

```env
PAYSTACK_MODE=test
PAYSTACK_SECRET_KEY=sk_test_...
PAYSTACK_PUBLIC_KEY=pk_test_...
```

While testing email delivery on Render, set `EMAIL_DIAGNOSTIC_TOKEN` to a private random value and call `/api/diagnostics/email/test` with that token. Remove or rotate the token after debugging.

## 5. Frontend production environment

Set this on the frontend host:

```env
VITE_API_URL=https://your-backend-domain.com/api
VITE_SUPPORT_WHATSAPP_NUMBER=234XXXXXXXXXX
```

Build command:

```bash
npm run build
```

Publish directory:

```text
Frontend/dist
```

## 6. Backend deployment

Backend build/install command:

```bash
npm install
```

Backend start command:

```bash
npm start
```

If your host starts from the repo root, use:

```bash
npm --prefix Backend install
npm --prefix Backend start
```

## 7. Production readiness order

Use this order:

1. Create the Neon database and copy the pooled connection string.
2. Set `DATABASE_PROVIDER=postgres` and `DATABASE_URL` on the backend host.
3. If needed, run `npm run migrate:neon` locally to copy SQLite data into Neon.
4. Confirm Cloudinary uploads work.
5. Confirm Brevo/API email verification works.
6. Run `npm run neon:check`.
7. Run `npm run production:check`.
8. Deploy backend with the Neon environment variables.
9. Deploy frontend with `VITE_API_URL` pointing to the backend `/api`.
10. Create one buyer, one seller, upload images, create a product, message, order, and verify notifications.
