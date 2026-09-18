# Shared-account commerce MVP — first implementation milestone

## Product rules implemented

- One registration and login for members. Signup leads to Complete Profile: name,
  unique username, optional display name/bio, country/state/city, optional multiple
  activity interests and product interests. No mandatory role choice.
- Selling settings activate owner listings within the same account: store name,
  dispatch address, contact phone, delivery coverage, fee and estimated days.
  Existing internal buyer/seller role values remain a compatibility detail.
- Shared profile links to purchases/sales, products, settings, earnings and saved
  content. Admin remains separate. Existing social likes, comments, shares,
  follows, saved products and feed scoring are retained.
- Rider, Local Market and Used Market customer entry points/APIs are retired.
  Their tables and historical records remain for reconciliation. No destructive
  migration is performed. Old rider accounts are not silently converted.
- Checkout uses server prices and stock, quotes the seller's delivery charge and
  requires upfront payment. Multiple sellers produce separately paid orders.
  The checkout checkbox asks buyers to confirm the stated delivery coverage;
  coverage is descriptive text, not automatic geographic serviceability checking.
- Payment creates a held payout. Platform/seller amounts for new orders are
  snapshotted at checkout so subsequent pricing changes cannot change proceeds.
  The existing platform markup policy is retained. Delivery proceeds belong to
  the product owner, who arranges and pays for transport.
- After confirmed payment the owner generates printable QR + manual code labels.
  Each purchased **order line/package** has its own random, single-use code,
  including that line's quantity. This is not a reusable product-catalog code.
  Splitting one order line into separately confirmed parcels is future work.
- Personal delivery requires dispatch recording. Transport delivery requires the
  company name, shipment reference, expected date and a private receipt image.
  Receipt evidence alone never proves buyer receipt or releases money.
- Only the authenticated purchasing buyer can confirm a dispatched package,
  using its QR link or typed code, with explicit acknowledgment of physical
  receipt. QR links prefill the form; opening a link does not confirm anything.
  Codes are hashed for comparison, encrypted for owner reprints, hidden from
  buyer API responses, and locked for 15 minutes after five incorrect attempts.
- All packages must be confirmed before settlement eligibility. Open disputes
  and returns block settlement. Owners can send one in-app reminder per package
  per 24 hours. No automatic completion timeout is assumed.
- Admin can view package states and private transport receipts. Old manual
  completion, payout-release and refund status shortcuts cannot simulate money
  movement. Exceptions require dispute/provider reconciliation.

## Payment integration and deployment

Configure the existing Paystack payment integration first. The new earnings
screen resolves a Nigerian bank account and registers a Paystack transfer
recipient after confirming the member's current password. Only the account name,
provider recipient ID, bank code and last four account digits are stored here.

`ENABLE_AUTOMATIC_SETTLEMENT=true` enables the 30-second settlement worker.
It checks paid status, buyer-confirmed completion, all package confirmations and
open issues before requesting a transfer. It preserves the same transfer reference
and recipient across retries. Pending transfers are verified, and signed Paystack
`transfer.success`, `transfer.failed`, and `transfer.reversed` webhooks are handled.
Only a provider-confirmed successful transfer changes payout status to `released`.
Failed/reversed transfers require administrative reconciliation; they do not
create a fresh reference automatically. Missing bank details keep funds held.

Keep automatic settlement disabled until test-mode payout and webhook checks have
passed on staging. Production requires Paystack credentials, a funded transfer
balance, and a transfer setup that permits the chosen automatic payout flow.
Provider OTP-required transfers remain pending rather than being marked released.
No real transfers were executed during development. Provider fees and historical
manual releases require operational reconciliation outside this milestone.

Set `PRIVATE_RECEIPTS_PATH` to a persistent, private volume **outside** the public
uploads directory. The current receipt implementation uses local disk even when
product media uses Cloudinary. Multi-instance deployments need a shared persistent
volume before rollout; ephemeral storage is not sufficient. Receipts accept
JPEG/PNG/WebP, max 5 MB, and are re-encoded before saving. Access is restricted to
the order parties and admins.

Set a stable `PACKAGE_LABEL_SECRET` before issuing labels, or keep the existing
`JWT_SECRET` stable when using its fallback. Back up this secret with the database;
rotating the active key without re-encryption prevents label reprints. Roll out the
backend and frontend together. Additive schema creation runs at backend startup.
Legacy unpaid payment-on-delivery orders and unresolved rider assignments should
be reconciled before replacing a production deployment.

## Verification

Run `npm test --prefix Backend` and `npm run build --prefix Frontend` with Node 24+.
Integration coverage exercises shared signup, unique onboarding, retired routes,
prepaid-only checkout, authoritative fees, held funds, private labels/receipts,
identity boundaries, single-use confirmation, locking, reminders, multi-package
completion, disputes, immutable transfer references, signed webhooks, reversals,
admin/member isolation and social interactions. Obsolete rider-dependent test
scenarios were replaced by the seller-managed fulfillment suite.

Browser checks could not run because the cloud browser blocked access to the
local preview. Before rollout, check signup → profile → selling setup, a real image
listing, multi-seller checkout, printable labels, mobile camera QR opening while
logged out, manual entry, transport receipt upload/admin review, and the Paystack
test-mode callback/transfer lifecycle. PostgreSQL staging execution is also still
required; automated tests here use SQLite.

## Next implementation milestones

Onboarding explains all three core activities, but only actual-product-owner
commerce is transactional in this milestone. Opportunities explicitly labels
supplier-linked offers and commission tracking as unavailable, not operational.

1. Supplier-approved dropship offers, stock linkage, margin agreements and order
   attribution; supplier retains physical fulfillment responsibility.
2. Affiliate product links/collections, attribution rules, commission snapshots
   and beneficiary settlement using the same buyer-confirmation gates.
3. Shoppable short-video publishing/feed/checkout enhancements, rewards, streaks,
   badges, group buying and engagement-driven deals from the broader draft.
4. Multi-parcel order-line splitting, provider-backed refund UI, robust payout
   reconciliation UI, and operational handling of lost/unconfirmed deliveries.

There is no automatic “receipt uploaded = paid out” or “seller says delivered =
complete” fallback. Buyer disputes remain available after confirmation, but a
transfer already accepted by the provider cannot be retrospectively held.
