# Recovery status — 2026-10-12

## Evidence and repository state

The original supplied archive and the previously edited `gleenc-backend-shared-v1` directory were recovered. There is no Git checkout in this backend workspace; branch, remote and deployment state cannot be inferred from these files. The comparison baseline was rebuilt from the original archive, including its static `src/data` modules. No original source file is missing.

Prior logs contained 55 passing combined tests and 23 passing PostgreSQL scenarios, but the validation document lagged behind the last added test. The final compatibility patch and delivery archive were absent. The previous execution reported transport disconnection/environment-offline failures during packaging. These are observed execution blockers; the unresponsive UI Stop button cannot be diagnosed from backend source.

Fresh recovery verification passed all 56 pre-change regression tests. After completing five additional boundary scenarios, the complete suite passed 61 tests and embedded PostgreSQL passed 28 scenarios. The explicit test-file list replaces a wildcard invocation that previously ended without a complete summary.

## Recovered implemented work

- Additive shared schema and `/api/v2` routes alongside historical browser APIs.
- Revocable mobile authentication, browser cookies, Google/Apple identity verification, profiles, settings and account lifecycle.
- Catalogue-linked product pricing, variants, menu/pack ordering, scheduled publication, scanned media and private digital files.
- Private capped offers, attributed capped reshares, selective cart and instant checkout.
- Verified Paystack processing, held/available wallet ledger, refunds, withdrawal and recovery queues.
- Seller fulfilment, per-unit buyer-bound confirmation labels, delivery evidence and release eligibility.
- Chat, grouped activity, moderation, reviews, discovery and optional push outbox.
- Shared browser/Expo client, types, API contract and operational guides.

The inventory records all source files, imports, exports and hashes. It is a structural inventory, **not** a claim that every historical logistics/rider line received a complete security audit.

## Completed recovery fixes

- Accepted legacy offers bind pricing/options and cannot survive later price changes.
- Legacy seller edit/delete/publish/validation/stock/availability APIs cannot overwrite configured shared metadata or reset reserved/unsettled inventory.
- Existing admin moderation synchronizes shared product/post visibility and preserves scheduled publication. Flagged/rejected/hidden products cannot be reactivated with seller availability toggles.
- Product/reshare archival enforces ownership and retains purchase/financial references. Legacy delete requests with shared references return a conflict with archival guidance rather than attempting a foreign-key-breaking deletion.
- Package-profile mutations with an actor require the product owner or a real admin.
- Current route inventory reflects actual mounted router paths, including login/register and archival endpoints.

## Remaining work and release blockers

1. Wire mobile and new web screens to the included API client. Existing local frontend stores do not automatically become server-backed. Historical order screens keep historical contracts; configured products must use v2.
2. Run the staging checklist against a copied Neon database and real external services: payment/webhook/refund/payout, email, storage/scanning, provider sign-in and push.
3. Validate competing API instances, network/TLS recovery, peak load, shared rate limiting and private durable storage. PGlite tests cover SQL/transaction behavior, not these deployment properties.
4. Integrate native Apple/Google billing before offering paid digital purchases inside mobile apps. The backend currently supports web purchase and mobile access to purchased entitlements, with a native-checkout gate.
5. Finalize retention/deletion, operational chargeback procedures and store-facing policies. No complete-erasure or store-approval claim is made.

No live database, provider account, repository merge or deployment was modified. Deployment approval is a separate future step after staging verification.
