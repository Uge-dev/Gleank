# Mobile completion review — 13 October 2026

This change connects the supplied Expo pages to the shared API and preserves the existing v1 web routes. It is a review candidate, not a deployed or certified release. No production database, payment account, repository branch or deployment was changed during this work.

## Contracts and behaviour

- `/legal/:kind` returns versioned Privacy Policy, Terms and Community Guidelines; `/legal/:kind/page` serves a readable public HTML version. `kind` is privacy, terms or community. Terms version is now `2026-10-13`; shared clients must reaccept it.
- `/verification-policy` and `/me/verification` expose the configured tiers. POST `/me/verification` accepts tier 2/3, legalName, documentType, documentIds, address, optional addressEvidenceIds, businessName and sourceOfGoods. Media must belong to the applicant. Identity/address evidence is private.
- `/me/phone/request` accepts `{phone}` in E.164 format; `/me/phone/confirm` accepts `{code}`. Only a successful Twilio Verify check updates the verified phone. Provider unavailability does not approve an account.
- Existing web-admin cookie authentication controls `/admin/verifications`, `/admin/verifications/:id` and `/admin/verifications/:id/review`. Review accepts decision approve/needs_changes/reject, reason and payoutOwnershipConfirmed. Approval requires an explicit payout ownership review. `/admin/verification-media/:id` is an administrator-only evidence download. Native user tokens cannot become admin sessions. A verification review creates an account notification.
- `/auth/google/start`, callback and exchange implement browser OIDC with state, nonce, pinned keys, audience checks and a device-held verifier. Exchange codes are single-use; tokens are not placed in redirect URLs. Linking requires password confirmation. Google is hidden until server configuration is available.
- Native Apple sign-in uses the existing challenge/identity contracts, a hashed nonce, pinned Apple keys and configured audiences. The UI uses the system Apple button. Provisioning and real-device validation remain necessary; Apple grant revocation on deletion is a separate release requirement.
- `/offers/preview` returns a server-calculated quote with a bounded discount, without creating an offer or changing a public price. GET `/offers/:id` is buyer/seller scoped. Offers, reshares, menu groups, stock, checkout values and tier restrictions remain server enforced.
- GET `/me/checkouts` is an account-scoped payment history. Existing checkout, wallet, transfer, escrow, QR delivery and private digital-entitlement APIs remain authoritative.
- Feed modes are latest, hot, vendors and following. Hot uses recorded likes/comments; vendors orders original listings by account creation. Following and blocks are filtered before pagination. Existing latest remains supported.
- Chat settings updates preserve independent settings; partial mute changes do not overwrite pinned/archive preferences. Edit/delete ownership and the 15-minute window stay server enforced.
- Public products include owned public component and variant photos. Private digital file IDs are still excluded from public products. Editable product metadata is owner scoped.

## Tier rollout

`SELLER_TIER_ENFORCEMENT=true` is required in the review environment to test enforcement. It is deliberately opt-in so this patch does not silently impose new limits on the existing production web app. Defaults: tier 1 up to ₦100,000, tier 2 up to ₦1,000,000, tier 3 up to ₦10,000,000. Values are configured in kobo. Basic verification checks email, phone, profile and selling details; higher tiers use private evidence and manual review. These are proposed platform thresholds, not statutory KYC limits. Publication, schedule release and quoted purchases are checked when the flag is enabled. Catalogue prices are reusable; inventory remains listing-specific.

## Configuration and operations

Merge `.env.mobile-completion.example` and the existing `.env.shared.example` into an isolated review environment. Keep the original database URL, stable signing secrets, payment keys, email settings and storage configuration. Never place server credentials in EXPO_PUBLIC_* or VITE_*.

Email requires a configured sender/provider and a reachable AUTH_LINK_ORIGIN. Real uploads require the existing malware scanner and durable private storage. Phone verification requires Twilio Verify. Google browser sign-in requires a Web OAuth client on the server even when only the native app uses that flow. Apple requires bundle/audience/capability configuration. Push requires Expo project credentials and provider delivery configuration. Payment provider confirmation must be tested with test-mode credentials and webhooks in a separate environment.

The new policies describe the implemented permissions, private communications, held proceeds, offers, reshares, delivery confirmation, disputes, deletion and digital licences. The business owner must confirm the legal operator, support mailbox, retention practice, transfer safeguards and applicable consumer terms before publishing them. The implementation is not legal advice or app-store certification.

## Release requirements still open

1. Actual Expo SDK 57 typechecking, bundling and iOS/Android physical-device checks; the verification environment did not have the complete native SDK dependency tree.
2. Real provider tests: email delivery, Twilio, Google, Apple, push and Paystack test-mode payments/webhooks. Automated provider interactions were mocked.
3. Native digital purchases remain disabled (`digitalNativeBilling:false`). Implement store billing, product mappings and backend receipt/revocation handling before enabling them. Existing purchased files can be downloaded through private entitlements.
4. Apple authorization grant revocation on account deletion requires the Apple server credentials and token lifecycle integration. Do not claim an App Store release is ready before completing it.
5. Connect the existing web administration UI to the verification review endpoints, or establish the reviewed administrative API workflow. This package does not replace an unseen web frontend.
6. Test on a separate staging PostgreSQL database, including concurrent workers, storage/scanner availability, backups, provider reconciliation and rollback. Embedded PostgreSQL checks do not test Neon TLS or multi-process concurrency.
7. Enable the tier rollout only after existing sellers have been assessed. Do not auto-approve old accounts or alter production balances.

## Useful primary references

- https://docs.expo.dev/versions/v57.0.0/sdk/notifications/
- https://docs.expo.dev/versions/v57.0.0/sdk/apple-authentication/
- https://developers.google.com/identity/openid-connect/openid-connect
- https://www.twilio.com/docs/verify/api/verification-check
- https://developer.apple.com/app-store/review/guidelines/

Run `npm test` and `npm run test:postgres` using Node 24 or newer. The latter uses an isolated embedded PostgreSQL instance and never connects to Neon.

Comment lists now support limit/offset and newest/popular ordering, with native like/unlike controls and existing sender/seller deletion permissions. Digital purchase gating in v2 uses the authenticated session transport, so a mobile caller cannot bypass it by claiming clientPlatform=web. Native payment initialisation and wallet payment also reject unpaid digital checkouts created elsewhere. The original web checkout and purchased file access remain available.
