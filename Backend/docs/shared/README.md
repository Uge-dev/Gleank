# Gleenc shared backend — version 2

This package extends the supplied production Express backend. It keeps the existing web API routes, accounts, historical order snapshots, seller-managed delivery, payout recipients and verification services. It adds `/api/v2` for the browser and Expo app. No live server, database, secrets or provider account was accessed or changed.

The upload contains 114 JavaScript files. The architecture inventory maps the entire source tree; implementation review focused on active authentication, products, social interactions, payments, orders, fulfillment, settlement, messaging, moderation and the PostgreSQL adapter. The retired rider and used-market modules remain retained and unmounted. This is not a claim of an exhaustive security audit of every legacy line.

## Included behavior

| Area | Shared implementation |
|---|---|
| Authentication | Password registration/login; browser cookies; hashed mobile access/refresh tokens; rotation, replay revocation, device logout; server-verified Google and Apple ID tokens; explicit identity linking |
| Profile | Existing account onboarding; avatar/cover updates through owned media; public profiles and connections; private settings; addresses; seller fulfillment settings; account closure and reviewed deletion |
| Discovery | Guest feed/product pages; existing web products/video posts enter the shared feed; search/categories; follow, likes, threaded comments, save; reports; verified purchase reviews and seller replies |
| Create product | Image/video presentation independent of ordering; single item, fixed pack, menu and pack with extras; sizes/colours and variant stock; prices per defined unit; allergens/ingredients; private digital files; drafts and scheduled publication; existing listing moderation |
| Profile price catalogue | Seller-owned catalogue entries link to products and propagate future prices/ordering. Purchased order snapshots never change. Inventory-affecting edits are blocked while reservations or unsettled orders depend on them |
| Reshare | Creates an attributed product post with 0–20% markup, without changing the original seller. A reshare chain resolves to the original post rather than stacking commissions |
| Share | Records forwarding separately from reshare. A product can be forwarded into a participant-owned conversation. The mobile OS share sheet remains a frontend action; record the share after a successful send |
| Make offer | Private buyer/seller offer; maximum 20% discount; seller acceptance/rejection appears in messages and activity; 24-hour expiry; product version and selected options bound to the offer; one checkout reservation per accepted offer |
| Cart and instant checkout | Add/configure cart lines; checkout directly from a product using `items`; or submit only selected `cartLineIds`. Server calculates menu quantities, stock, fees, discounts and commission |
| Payments and wallet | Paystack initialization, canonical verification, signed shared/legacy webhook dispatch; idempotent wallet top-ups, purchases, held earnings and withdrawals; recipient/amount verification; late-payment refund recovery |
| Seller orders | Immutable selected variants/menu quantities; preparation; unique package codes per physical unit/order; dispatch and private transport evidence; buyer-only single-use confirmation; return-window earnings release |
| Issues/refunds | Buyer cancellation/return/dispute; seller response; audited admin decision; held-fund refund, verified provider reconciliation, wallet refund and digital entitlement revocation; uncertain outcomes stay reserved for review |
| Digital products | Private scanned files; web purchase; immediate buyer entitlement after verified payment; authenticated, two-minute, single-use download grants; receipt JSON; purchased file versions remain available independently of later catalogue edits |
| Messaging/activity | Participant authorization; profile images; idempotent sends; product/offer forwarding; replies, reactions, edits/deletion windows, archive/mute/pin/clear, search; explicit delivered/read acknowledgements; unread activity counts; grouped actors and legacy activity |
| Push/maintenance | Expo push registration, outbox, retry, receipt checks and invalid-token removal; scheduling, reservation expiry, payment reconciliation, refunds and held-fund release jobs |
| Reuse | Dependency-free `client/gleenc-api.js` for browser/Expo; Zod request schemas; OpenAPI contract; existing web API remains available for historical orders and services |

## Pricing rules

All amounts are integer kobo. For a configured selection, seller base includes chosen menu items/variant and packaging. An accepted offer reduces that base by at most 20%. Reshare commission is calculated on the resulting seller amount and is at most 20%. The existing configured platform fee is added separately. Delivery is charged once per seller, using the greatest selected product delivery charge; absent a product override it uses seller fulfillment settings.

For example, a ₦5,000 base with 20% markup and a 5% platform fee costs ₦6,250 before delivery: seller ₦5,000, promoter ₦1,000, platform ₦250. A 10% increase on ₦5,000 is ₦500, not ₦1,000. The product remains owned and fulfilled by its original seller.

## What still requires configuration or integration

- This backend does not automatically replace the mobile frontend's local stores. Use the included client and integration guide to connect screens. The existing web frontend continues using its old API until migrated screen by screen.
- Historical web orders retain their existing `/api/orders` and `/api/commerce` contracts and their original payout/earning terms. The new order ledger is additive; historical balances are not copied into a second spendable wallet.
- Google/Apple applications, client-side provider authentication and their allowed audiences must be configured. The server verifies ID tokens; it does not fabricate provider credentials.
- Mobile digital checkout is deliberately unavailable until verified Apple/Google native billing is integrated. Web digital purchase and authenticated mobile access to an existing entitlement are implemented. The `clientPlatform` field is routing metadata, not a security attestation. Do not expose a mobile workaround to this gate.
- Paystack, bank-recipient verification, email, Cloudinary/durable disk and ClamAV need operational credentials/services. No simulated payment path is enabled for the new wallet.
- Uploaded video formats are MP4/MOV-compatible containers; deployment must confirm playback codecs on supported Android/iOS devices. The API alone cannot guarantee every uploaded codec plays.
- Push uses Expo's gateway. It needs an Expo access token, matching project ID and permission/configuration in the native app. In-app activity polling works independently of push.
- Multi-instance deployments need a shared rate-limit store and shared durable private storage. The supplied synchronous database adapter remains a compatibility boundary; high traffic needs an async repository migration and load testing.
- Account deletion pseudonymizes public/account records after balances and orders settle. Financial/security records and already-purchased digital files are retained. Set and document a retention/purge policy for historical messages, files, verification documents, third-party assets and backups before representing this as complete data erasure.

## Validation

See `VALIDATION.md` for the actual test results and their limits. Store approval, live payment success, penetration-test certification and production concurrency safety are not asserted by this package.
