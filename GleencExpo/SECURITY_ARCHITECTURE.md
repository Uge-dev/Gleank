# Security architecture and backend handoff

## Current trust boundary

This package is a frontend implementation. Device state, timestamps, preview actors, order completion, wallet amounts, verification badges and local file URIs are all untrusted outside the prototype. AsyncStorage is not encrypted storage, and chat is not end-to-end encrypted. No claim is made that a client can secure a real marketplace or certify every line of code.

All new financial and messaging operations fail closed outside development preview. No PAN, CVV, banking password, wallet PIN, payment secret or service key is collected in the new features. Existing account/auth integration still needs its own production audit.

## Implemented client controls

- Account-scoped namespaces, ownership checks on restored records and stale-callback rejection after an account switch.
- Bounded JSON size, list lengths, message/review text, IDs, file metadata, quantities, ratings, timestamps and payment histories.
- Cryptographically random identifiers through Expo Crypto for comments, messages, reports, payment attempts, events and retained media. They identify local records; they do not authorize a transaction.
- Comments enforce same-post root references and prevent arbitrary third-level replies. Author deletion retains a tombstone for valid replies. Client text filtering and versioned community consent improve UX; server moderation must independently enforce policy.
- Follow/block operations filter the same profile identities across discovery and messages. Block names are normalized to resist case/whitespace bypasses. Production must use immutable account IDs, including after a profile rename.
- Review eligibility is derived from the current account's completed order line, never a submitted `verified` flag. Open issues/refunds revoke eligibility. One review per line; original-seller-only replies.
- Messages check recipient blocking, own-message edit ownership and a 15-minute edit window. Multi-recipient forwarding commits atomically to local chat state, preventing partial sends when a target is blocked/full.
- Attachments use allowed type/extension/MIME combinations, HTTPS or selected-device URI schemes and size limits. Documents/voice/images are limited to 15 MB; videos to 50 MB; voice to two minutes. No attachment is executed by app code. Real uploads require content inspection and malware scanning, not trust in metadata.
- Native availability is checked before loading audio/video/picker/file/print/sharing/clipboard modules. Permissions are requested only for the user-selected action. Recording does not begin while backgrounded; missing/denied permissions have recovery controls.
- Cart snapshots remain separate from canonical current listings. Checkout checks quantities, product status, stock, selected rows, current pricing and private quote ownership.
- Payment sessions hold an immutable checkout fingerprint, expire after 30 minutes and cap retries. Pending/failed/cancelled attempts do not create orders. Order idempotency is enforced in the commerce provider, before checking a now-consumed quote or removed cart row; replay returns the existing order and never debits a wallet twice.
- Production confirmations are gated. A client tap labelled as success in development is never represented as a server-verified payment.
- Escaped text in receipt HTML prevents user strings becoming executable HTML. PDF receipts omit delivery QR secrets and private asset URIs. Test receipts explicitly do not claim a bank/tax payment.
- Per-promoter reshare aggregation derives commission from settlement entries; refunds and held amounts remain distinct. Analytics are explicitly device-local and bounded/deduplicated.
- Local writes are serialized. Failed hydration is retried by reading the stored record, not writing a new default over it. Native render/permission errors have recovery routes.

## Required service architecture

| Service | Authority and enforcement |
|---|---|
| Identity | Verify session on every request, short-lived access credentials, secure token storage, refresh rotation/revocation, rate limits and equivalent iOS login option where required. |
| Posts/comments/community | Server-owned post/profile IDs, consent version, filtering plus moderation queue, report acknowledgement, escalation/removal, immutable blocked IDs, spam controls and audit trail. |
| Chat | Authenticated conversation membership, sender ownership, attachment grants, server edit/delete windows, delivery/read acknowledgements, message limits and push preferences. If E2EE is promised, use an audited protocol with identity keys and recovery, not a custom cipher. |
| Reviews | Check paid/completed order entitlement on the server, unique order-line review constraints, immutable author, seller-only responses and dispute/refund revocation. |
| Files | Private bucket, limited signed upload/download URLs, MIME/content signature checks, malware scanning, quotas, authorization per buyer/recipient and licence entitlement. Never publish permanent private download URLs. |
| Orders/payments | Server-generated checkout quotes, separate physical/digital billing rules, immutable pricing/selection snapshot, inventory reservation, verified processor/store callbacks, unique idempotency key, transactional order/ledger writes and reconciliation. Never trust local balances, success screens or QR state. |
| Wallet/commission | Double-entry ledger, integer minor units, original seller attribution, verified delivery release per unit, dispute holds, reversal/refund handling, payout verification and jurisdictional payment requirements. |
| Delivery | Buyer-bound random single-use token; store only a secure verifier server-side, authenticate the buyer, validate active purchase/unit and replay protection, invalidate on refund. |
| Analytics | Server-owned attribution, bot/dedup controls and account authorization. Do not interpret prototype local views as marketplace-wide conversions. |
| Privacy/deletion | Published retention policy, reauthentication where appropriate, delete/anonymize eligible data and revoke credentials; legally required transaction retention must be disclosed. |

The current local read/write flows provide testable interfaces for these services. They do not replace them. A release must remove seeded demonstration data and pass a separate native, backend and store review.
