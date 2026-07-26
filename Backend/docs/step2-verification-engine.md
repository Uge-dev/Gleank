# Step 2 verification engine

This Step 2 implementation replaces the fragmented seller/rider verification flow with an additive requirement-based engine. The old fields are still preserved as compatibility mirrors until production backfill is applied and verified.

## Legacy-to-new mapping

| Legacy source | New authoritative model |
| --- | --- |
| `users.role` | `verification_cases.role` for seller/rider verification; canonical `users.role` still controls account access. |
| `users.email_verified` | System requirements `seller_email_verified` / `rider_email_verified`. |
| `users.phone_verified`, `users.phone`, profile phone | System requirements `seller_phone_verified` / `rider_phone_verified`. |
| `rider_profiles.verification_status` | Compatibility mirror of approved/suspended rider verification. New authority is `verification_cases.current_verified_level`, `overall_status`, and per-requirement statuses. |
| Rider safety fields | `verification_cases.operational_status` plus `rider_profiles.safety_status` mirror. |
| Rider availability / `availability_mode` | Remains manual availability only. Admin approval no longer places a rider online. |
| `can_receive_auto_dispatch` | Eligibility check `autoDispatchEnabled`; not a verification boolean. |
| `stores.verified`, `stores.verification_status` | Compatibility mirror after level approval. New authority is seller verification case + requirements. |
| `seller_verification_profiles.status` / `admin_review_status` | Compatibility mirror and historical profile source; new submissions are also written to `verification_submissions`. |
| `kyc_verifications.status` / Dojah | Provider-backed requirements such as `rider_nin_dojah` and `rider_live_face`. Invalid/unconfigured Dojah cannot approve live-face. |
| Market/category approval | Kept separate from identity verification. It remains visible through market/category approval tables. |
| Seller subscription | Kept separate from identity verification and payout readiness. |
| Cloudinary/local document URLs | Preserved as versioned `verification_submissions.document_urls`. |

## New tables

- `verification_cases`
- `verification_requirements`
- `verification_submissions`
- `verification_reviews`
- `verification_level_requests`
- `verification_audit_events`

Every resubmission creates a new `verification_submissions.version`; old versions are retained. Requirement reviews write `verification_reviews` plus `verification_audit_events`.

## APIs

- `GET /api/verification/me?role=seller|rider&history=true`
- `POST /api/verification/requirements/:code/submissions`
- `POST /api/verification/level-requests`
- `GET /api/verification/admin/queues`
- `PATCH /api/verification/admin/requirements/:requirementId/review`
- `PATCH /api/verification/admin/cases/:caseId/level`
- `PATCH /api/verification/admin/cases/:caseId/operational-status`
- `GET /api/rider/eligibility`

## Rider eligibility rules

`GET /api/rider/eligibility` evaluates the same checks used by dispatch:

- Canonical rider role.
- Active account.
- Email verification.
- Phone readiness.
- Required verification level.
- Operational status.
- Safety status.
- Manual online status.
- Recent heartbeat/location.
- Location permission.
- Vehicle/package capacity.
- Service zones.
- Current workload.
- Delivery limit/high-value readiness.
- Auto-dispatch permission.

## Backfill

Run a dry run first:

```bash
npm --prefix Backend run verification:backfill:dry-run
```

After reviewing conflicts:

```bash
npm --prefix Backend run verification:backfill:apply
```

Backfill is idempotent. It preserves old document URLs, does not approve live-face from a static selfie, and marks uncertain historical data for review.

## Verification requirements

Rider Level 1:

- Email.
- Phone.
- Personal/residential profile.
- Vehicle/capacity.
- Service zones/location readiness.

Rider Level 2:

- Government ID.
- Identity selfie.
- Home address.
- Emergency contact.
- Guarantor/referee.
- Vehicle authorization.

Rider Level 3:

- NIN/Dojah identity verification.
- Live-face verification.
- Delivery history and complaint review.

Rider Level 4:

- High-value delivery approval.

Seller shared:

- Email.
- Phone.
- Identity/selfie.
- Store identity.
- Pickup information.
- Payout account.

Seller type-specific:

- Campus identity.
- Market selection/shop identity.
- Used item authenticity for higher-risk used sellers.
- Business documents for business sellers.

## Verification separation

The implementation separates:

1. Verification status: documents, identity, completed requirements.
2. Operational status: active, restricted, suspended, deactivated.
3. Availability status: online, offline, busy.

Admin review/approval never sets rider availability online.

## Test results

Verified with:

- `npm --prefix Backend run build`
- `npm --prefix Backend test` — 9/9 passing.
- `npm --prefix Frontend run build`

Added tests cover independent rider resubmissions, retained document versions, selfie not approving liveness, invalid live-face approval rejection, admin approval not setting rider online, precise eligibility blocking reasons, requirement definitions, and idempotent legacy backfill.

## Production checks

Before enabling admin review in production:

1. Run `verification:backfill:dry-run`.
2. Review conflicts in the JSON report.
3. Run `verification:backfill:apply`.
4. Open `/admin`, go to Riders, and check the “Requirement-based verification queue”.
5. Open a rider dashboard and visit `/rider/verification`.
6. Submit one replacement requirement and confirm only that requirement moves to review.
7. Confirm a verified rider remains offline until manually switching online and sending a fresh location update.

## Third-party credentials

No new mandatory third-party account is required for this step beyond existing production services. For Level 3 live-face/NIN, Dojah must be configured server-side before those provider requirements can pass.
