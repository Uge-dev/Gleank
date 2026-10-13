# Verification performed

## Passed in this workspace

- TypeScript cross-file contract checks for every changed/new TypeScript source, using explicit native module stubs.
- Actual provider integration tests covering existing items 1–11 and the new items 12–18.
- Reply ownership/thread references, comment likes/deletion, content bounds, moderation report deduplication and account-scoped restored records.
- Profile-linked follow/unfollow, searchable list data and two-way preview relationships.
- Completed-order review verification, duplicate review prevention, ratings/photos, editing, helpful votes, seller response, forged-order rejection and refund revocation.
- Message editing time/ownership, reactions, deletion, attachment MIME/extension/size/URI bounds, voice-duration cap, mute/archive, case-normalized blocking and atomic multi-recipient forwarding.
- Pending/failed/retry/cancel/expiry/success payment states; no early order creation; duplicate synchronous completion; one wallet debit; changed-cart rejection; unique persisted payment reference; escaped PDF receipt input and production service gates.
- Promoter-specific reshare attribution, view deduplication and pending/released commission calculations.
- Provider-backed route rendering for all new routes, with native view surfaces mocked.
- Actual persistence-hook hydration, write ordering, account switching, stale callback rejection and safe retry after a failed read.
- Existing configuration/cart/offer/scheduling/delivery/refund/digital entitlement/payout/blocked-account regressions.

The included test harness uses the delivered source providers and deterministic native mocks. It is not a test-only reimplementation of the business rules. Run it from the project root with `node tests/gleenc-frontend-v13.cjs`.

## Not performed here

This execution environment has no installed Expo project dependency tree matching your Mac, EAS credentials, Xcode simulator or physical Android/iOS device. Consequently no EAS build, native playback/recording test, actual picker/share/PDF test, native layout screenshot inspection or store submission was performed. Cross-file stub checks are not equivalent to `npx tsc --noEmit` against the project's real Expo SDK.

Run the project SDK checks and the device checklist in README.md on the newly installed builds. Backend authorization, transport delivery, real billing, malware scanning, moderation operations, actual account deletion and store approval are outside the intentionally frontend-only implementation.
