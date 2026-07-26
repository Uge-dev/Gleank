# Gleenc Step 1 security operations

This document covers the Step 1 identity/payment/security changes.

## One-time admin bootstrap

The backend no longer creates default admin credentials and no longer accepts static admin bearer tokens.

Create the first admin explicitly:

```bash
cd Backend
ADMIN_BOOTSTRAP_PASSWORD='replace-with-a-strong-password' npm run admin:bootstrap -- --email admin@example.com
```

Rotate an existing admin password:

```bash
cd Backend
ADMIN_BOOTSTRAP_PASSWORD='replace-with-a-new-strong-password' npm run admin:bootstrap -- --email admin@example.com --rotate-existing-password
```

The password is never printed. Remove `ADMIN_BOOTSTRAP_PASSWORD` from shell history or provider env values after the command succeeds.

## Account reconciliation

Dry-run first:

```bash
cd Backend
npm run accounts:reconcile
```

Apply only safe automatic corrections:

```bash
cd Backend
npm run accounts:reconcile -- --apply
```

The script reports duplicate normalized emails, seller/rider profile conflicts, and accounts that need manual review. Applied corrections revoke affected sessions and write admin audit entries.

## Production payment checks

Render/backend production should use one canonical frontend URL:

- `FRONTEND_URL=https://your-frontend-domain`
- `CORS_ORIGINS=https://your-frontend-domain`
- `PAYSTACK_CALLBACK_URL=https://your-frontend-domain/payment/callback`
- `PAYMENT_PROVIDER=paystack`
- `PAYSTACK_MODE=live` with `sk_live_...`, or explicit test mode with `ALLOW_PAYSTACK_TEST_KEYS_IN_PRODUCTION=true` while testing.

The public payment recovery route is:

```text
POST /api/payments/public/verify
{ "reference": "PAYSTACK_REFERENCE" }
```

It verifies the reference server-side, returns a public-safe paid summary, and never marks payment paid from query parameters alone.

## Required production placeholders

Set these in Render with real values:

- `NODE_ENV=production`
- `FRONTEND_URL`
- `CORS_ORIGINS`
- `DATABASE_PROVIDER=postgres`
- `DATABASE_URL`
- `JWT_SECRET`
- `STORAGE_PROVIDER=cloudinary`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `PAYMENT_PROVIDER=paystack`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_PUBLIC_KEY`
- `PAYSTACK_CALLBACK_URL`
- `EMAIL_PROVIDER`
- `BREVO_API_KEY` or SMTP values
- `KYC_PROVIDER=manual` or `dojah`
- If `KYC_PROVIDER=dojah`: `DOJAH_APP_ID`, `DOJAH_SECRET_KEY`, `DOJAH_WEBHOOK_SECRET`

