# Gleank production deployment runbook

This document is the production setup checklist for Gleank.

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
DATABASE_URL=postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DB?sslmode=require&channel_binding=require
```

Verify the connection from the backend folder:

```bash
cd Backend
npm run neon:check
```

Important: the current Gleank runtime still uses the synchronous SQLite data layer. The app now refuses to start with `DATABASE_PROVIDER=postgres` so it cannot accidentally pretend to be using Neon while writing to SQLite. The next required backend task is the full async Postgres repository migration.

Do not accept live production traffic on Neon until that migration is complete.

## 3. Cloudinary image storage

Set these backend environment variables:

```env
STORAGE_PROVIDER=cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_FOLDER=gleank
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
CLOUDINARY_FOLDER=gleank

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=Gleank <no-reply@your-domain.com>

PAYMENT_PROVIDER=paystack
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

1. Deploy backend with local SQLite only for staging tests, not live production.
2. Confirm Cloudinary uploads work.
3. Confirm SMTP verification works.
4. Complete async Postgres repository migration.
5. Run `npm run neon:check`.
6. Run `npm run production:check`.
7. Deploy backend with `DATABASE_PROVIDER=postgres`.
8. Deploy frontend with `VITE_API_URL` pointing to the backend `/api`.
9. Create one buyer, one seller, upload images, create a product, message, order, and verify notifications.

