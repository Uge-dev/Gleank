# Validation record

Re-run on 2026-10-12 against the recovered backend and lockfile; prior successful logs were not treated as proof of the recovered state. No production database or real provider account was used.

| Check | Result |
|---|---|
| Existing regression suites | 30 passed |
| Shared browser/Expo client tests | 3 passed |
| New shared-backend integration scenarios | 28 passed |
| Combined `npm test` | 61 passed; 0 failed |
| Embedded PostgreSQL `npm run test:postgres` | Same 28 backend scenarios passed; 0 failed |
| Server build/syntax check | Passed |
| Dependency audit after lockfile updates | 0 known vulnerabilities reported by npm audit |

The PostgreSQL test runs the actual API/migrations/SQL through the existing SQL-normalization adapter and an isolated PGlite PostgreSQL engine. It validates PostgreSQL SQL/type/transaction behavior for these scenarios. It does **not** validate the deployed Neon connection, TLS, worker/network failure recovery, multi-instance lock contention or production throughput.

## Recovery boundary tests

Five additional scenarios verify accepted legacy offers after a price change; guards on legacy edit/delete/publish/validate/stock routes; preservation of moderation schedules and prevention of flagged-post reactivation; owner-only archival retaining paid records; and owner authorization for package-profile changes.

## Tested boundaries

- Guest versus authenticated/private/admin APIs; browser cookie Origin protection and mobile bearer authentication.
- Refresh rotation and consumed-token replay revocation; no privilege assignment through profile input.
- Google pinned JWKS, issuer/audience/nonce checks, fresh tokens and no email-only account auto-link.
- Seller-owned media, normalized product input, separate ordering formats, variants, menu quantities and server pricing.
- Maximum 20% offer discount and 20% reshare markup; original seller ownership and immutable selected options.
- Idempotent instant checkout/payment; selected cart lines; cancellation stock restoration and prevention of overselling.
- Held versus available funds; buyer-bound package codes; seller cannot confirm the buyer's receipt; duplicate confirmation/release prevention.
- Verified purchase reviews, grouped notification counts, reports and block enforcement.
- Digital entitlements, private file access, buyer-only expiring grants, single use and refund revocation.
- Participant-only conversations, idempotent send, explicit delivery/read acknowledgement, sender-only edit and private attachment access.
- Refund admin authorization and once-only wallet credit; late successful payments cannot create unreserved orders.
- Provider transfer amount/recipient verification, one transfer submission per intent, stale failed-event handling and once-only reversal.
- Raw-body HMAC webhook rejection and canonical provider verification rather than trusting webhook metadata.
- Account closure refuses unsettled financial obligations and revokes eligible closed-account access.
- Client browser cookies, single-flight native refresh, preserved idempotency keys and safe URL/path handling.

## Limits

Provider tests use controlled mocks. Google token verification uses locally generated test RSA keys returned by a mocked pinned endpoint. Apple verification follows the same verifier with a different pinned issuer/JWKS/audience/hashed nonce; a live Apple token still needs a staging check. Scanning is bypassed only under NODE_ENV=test; operational ClamAV and malware fixtures need deployment testing. No live email, Cloudinary, Expo push, bank transfer, refund, App Store or Play billing was executed.

Updating Nodemailer from the supplied 9.x range to 10.0.16 addresses reported advisories; the existing development email/auth tests pass, but the actual SMTP/Brevo account still needs a smoke test. Rate limits are in-process in this initial deployment package; use a shared store before running multiple API instances.

Zero npm advisories is a point-in-time dependency result, not proof of complete application security. Keep dependency scanning, backups, monitoring, least-privilege database/storage credentials, provider reconciliation and a staged rollout in the production process.
