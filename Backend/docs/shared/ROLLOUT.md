# Apply and validate

1. Back up the existing backend source, production database and uploads. Apply the ZIP overlay at the backend project root, preserving all files not listed in `CHANGED-FILES.json`. No existing table is dropped and no historical balance is rewritten by the shared migration.
2. Use Node 24 or later and install the exact lockfile:

```sh
npm ci
npm test
npm run test:postgres
```

`test:postgres` uses a disposable embedded PostgreSQL database and a temporary source copy. It never uses `DATABASE_URL` to contact your live database. Development dependencies are needed for tests; `npm ci --omit=dev` is for the tested production image.

3. Add `.env.shared.example` values to your existing **server** environment. Do not replace your current Neon/Paystack/email configuration or copy secrets into the frontend. Use stable `JWT_SECRET` and `PACKAGE_LABEL_SECRET`; rotating package encryption keys without a migration makes existing labels unreadable.
4. Configure ClamAV and private durable storage. The new upload endpoint fails closed outside tests if scanning is unavailable. Private digital/chat/evidence files must never be placed under the existing public `/uploads` mount. Back up the private volume together with the database. Shared storage is necessary when running more than one API instance.
5. Run first against a staging copy of Neon. Starting the API applies additive shared tables. Check repeated startup/migration, browser cookie login, mobile bearer login, current web checkout, stock reservation, declined payment, provider timeout, one signed webhook, digital download, QR confirmation, refund and payout with verified recipient.
6. Keep the Paystack webhook URL `/api/payments/webhook`. It dispatches shared references to the new ledger and legacy references to the existing services. Preserve raw JSON bytes through the reverse proxy. A client success redirect never marks an order paid.
7. Launch with `npm start`. This starts the existing settlement worker and the shared maintenance worker. Monitor logs plus `/api/v2/admin/finance`. Alert on initializing payments, pending payouts, reconciliation refunds and wallet holds; do not silently release them based on a network timeout.
8. Wire the mobile and new web screens through `client/gleenc-api.js`. Do not mix old cart/order IDs with shared cart/checkout IDs. Old web orders remain on their historical APIs. Confirm TLS/CORS and secure-cookie behavior from the actual deployment domains.
9. Before a multi-process launch, use a persistent distributed rate-limit store, run simultaneous same-stock/same-reference tests on PostgreSQL and configure an operational refund/chargeback recovery procedure. Embedded PostgreSQL tests do not test the network or competing API processes.

## Rollback

Keep the additive tables and private files. Rolling back application code does not refund new orders or withdraw new held balances. If any v2 purchase has occurred, pause new purchases, complete/reconcile new payment obligations and keep a compatible maintenance worker available. Do not drop shared tables or reset ledger balances to zero.

## Review queue

- Product/report actions require the existing admin cookie portal and role checks.
- Refunds require an admin decision; sellers may respond but cannot release funds to themselves or manufacture buyer delivery.
- Provider refund submission timeouts become `needs_reconciliation`. Use the provider dashboard/reference to locate the existing refund, then `POST /admin/refunds/:id/link-provider` with its ID. The server verifies the reference and amount before linking it. The same mechanism exists for late-payment recovery.
- A verified payment reversal freezes the affected accounts and revokes entitlements for finance review. Recover funds with a documented, audited finance procedure before lifting holds; no arbitrary public balance-edit endpoint is provided.
- Close accounts only when outstanding orders and balances are settled. Reviewed finalization is available after the recorded grace period. Retention of financial/security evidence and purchased licences is explicit.
