# Gleenc shared backend — recovered integration

This ZIP contains only added or changed backend files, relative to the supplied `01-Backend.zip`. Extract it into a **local or staging copy** of that backend project root. It is not a replacement production database and does not include credentials, uploads or installed dependencies.

1. Read `docs/shared/RECOVERY-STATUS.md` for recovered work, fixes and blockers.
2. Compare `CHANGED-FILES.json` baseline hashes with your current source. If production has newer changes, reconcile them in a local branch before applying the overlay.
3. Read `docs/shared/README.md` for feature coverage and limitations.
4. Follow `docs/shared/ROLLOUT.md` for installation, staging checks and rollback. Use Node 24+; run `npm ci`, `npm test`, and `npm run test:postgres` locally.
5. Use `docs/shared/CLIENT-INTEGRATION.md` and the reusable browser/Expo client to connect the frontend screens.

**No deployment, merge or live production-data modification was performed.** Starting the API against a database runs migrations and maintenance; do not point a local test instance at production. Historical web orders and earnings remain on their existing APIs and ledger. Configured products use `/api/v2` for editing and checkout.

Verified 2026-10-12: 61 regression tests, 28 embedded PostgreSQL scenarios, full JavaScript syntax checks, server build and 0 known npm dependency advisories. This does not certify production readiness, live-provider behavior, native-store compliance or complete application security.
