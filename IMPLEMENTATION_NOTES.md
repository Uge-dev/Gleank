# Gleank Secure Auth + Seller Commercial Workflow Implementation

This version adds a hardened authentication and seller access workflow while preserving the existing Gleank buyer, seller, used-market, order, messaging, saved, and dashboard flows.

## Added

- Email verification tokens and `/api/auth/verify-email`.
- Resend verification endpoint and development verification link support.
- Strong password policy shared by registration, reset, and password change.
- Login attempt recording and temporary account lock after repeated failed logins.
- Secure sessions with user agent, IP address, last-used timestamp, and revocation.
- Logout other devices from the account security page.
- Security event logging for registration, login, email verification, password reset, and password change.
- Seller verification profile with identity proof, seller agreement, and review status.
- Seller monthly subscription table and development activation workflow for the ₦3,000 monthly seller fee.
- Backend seller publishing protection: seller must be verified and subscription-active before product/service publishing in production.
- 5% platform fee calculation for normal seller products/services and Used Market listings.
- Buyer-facing price compatibility: existing UI still reads `price` and `priceKobo`, now representing final buyer price.
- New professional frontend pages:
  - `/verify-email`
  - `/account/security`
  - `/seller/onboarding`
  - `/seller/subscription`

## Commercial pricing behavior

When a seller enters an item price, the backend treats it as seller base price and adds Gleank's 5% platform fee.

Example:

- Seller enters: ₦10,000
- Gleank fee: ₦500
- Buyer-facing price: ₦10,500

The database stores seller price, platform fee, and buyer price separately for future payout and accounting.

## Payment note

The seller subscription activation endpoint is development-only. In production, it rejects direct activation and should be connected to Paystack/Flutterwave verification before go-live.
