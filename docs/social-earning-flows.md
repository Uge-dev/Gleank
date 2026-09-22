# Social content and earning shares — review milestone

## User journeys

- Create opens four choices: video, owned product, dropshipping, marketing. No separate account or seller onboarding is required for videos or earning shares; email verification is required to publish.
- Latest is the default home tab. It merges the latest 50 public video/reshare posts with the latest 50 products by creation time. Trending keeps the existing engagement score. Following retains store-follow discovery.
- Real videos use `/create-video`, appear at home and `/reels`, and may tag a public product. Public personal feeds use `/community/:userId`. Video posting does not itself create commission.
- Owners open My products → Enable dropshipping & marketing rewards. Zero disables each activity. Owners explicitly opt in to funding rewards from their own proceeds.
- Opportunities → choose activity → choose eligible product → accept terms → Reshare & create earning link. Reshares appear at home and on the sharer's public feed. The resulting product URL includes `ref`; that exact attribution is carried in the cart to checkout.
- Earnings separates owned-product sales from dropshipping margins and marketing commissions. Only the owner of an earning can retrieve their records. No buyer contact information is exposed to promoters.

## MVP commercial model requiring product review

Dropshipping uses a supplier-approved fixed margin per unit, at the existing buyer price. Marketing uses a supplier-approved percentage of the supplier's selling price, excluding platform markup and delivery. This is not arbitrary reseller markup, a separate reseller inventory, or simultaneous dropship-plus-affiliate stacking. No numerical reward defaults are imposed; all offers start disabled.

Checkout accepts only a link ID, never a rate or beneficiary. The server verifies product, supplier permissions/version, self-referral exclusions and available stock. It snapshots the split at order creation and conserves buyer total across platform fee, supplier proceeds (including delivery), and sharer earnings. Seller term edits invalidate links for future checkouts, not existing orders. Re-sharing the same offer is idempotent. Adding the same product to the cart again replaces its referral with the incoming referral; ordinary additions remove attribution.

There is no cross-device referral cookie or attribution window: this MVP attributes the purchase added through the explicit link. Sign-in/profile completion preserves a referral product destination in the same browser session. Old invalidated links produce a checkout error and must be refreshed by the sharer.

## Payments and release gates

Earning amounts are reserved in an additive `earning_payouts` ledger, not treated as platform revenue or included in the supplier payout. Verified payment and every package's buyer confirmation are required. Existing disputes/returns and blocked parent payouts prevent initiating earning transfers. Transfer amount, currency and recipient are checked; provider references remain stable across retries. Signed transfer webhooks handle success, duplicates and reversals. Failed/reversed transfers block for reconciliation rather than initiating a fresh transfer.

Automatic earning transfers require **both** `ENABLE_AUTOMATIC_SETTLEMENT=true` and the new `ENABLE_EARNING_SETTLEMENT=true`. The new flag defaults off. Do not enable before staging tests; no live transfer was made as part of development. Admin reconciliation UI for failed earning transfers is not included; existing operational/provider reconciliation is still required. Changing payout account details does not redirect an already-created transfer.

## Video storage and safety

MP4/WebM uploads are authenticated, email-verified, limited to 30 MB and 10 uploads/user/hour, and validated by container signatures. Production uses Cloudinary's video resource type, with decoding delegated to the provider. Local storage supports development. Images continue through the existing image-only pipeline. Failed database writes clean up their uploaded asset. Captions are plain React-rendered text; deletion is owner/admin-only soft removal from feeds.

Video transcode quality, mobile playback, media moderation/reporting UI, dedicated video likes/comments/follows, arbitrary video reposts and paid-video attribution remain follow-up work. Product social interactions remain unchanged. `/reels` is now routed to real posts, not the old mock component.

## Validation and deployment review

Automated integration tests cover upload authentication/type rejection/removal ownership, newest-first catalog, seller-only offers, duplicate reshares, self-referral and cross-product rejection, term changes, ledger conservation, private earning records, buyer-confirmed payout eligibility, admin holds, transfer retry/idempotency and reversal.

The frontend production build and backend test suite are run for this milestone. Cloud browser access to localhost is blocked in this environment, so **visual/mobile QA is not verified**. The upload test uses a container-header fixture, not a real codec playback test. PostgreSQL migrations and Cloudinary/Paystack end-to-end tests must be verified against staging before merging/deploying. Check long captions, mobile tab overflow, 30 MB mobile uploads, referral signup/verification, a multi-seller/multi-package purchase, seller refunds, and unsuccessful/OTP-required transfers. Back up the production database; these migrations are additive and retain existing records.

This change is submitted as a draft review branch, not merged or deployed automatically.
