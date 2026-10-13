# App Store and Google Play readiness

The frontend includes report/block entry points for posts, profiles, comments, reviews and messages; versioned community consent; support/privacy/terms access; an account deletion entry; contextual native permission strings; native recovery; and test-payment gates. These are preparatory controls, not a statement that this prototype is approved or fully compliant.

## Required before submission

1. Connect moderation. Reports in this build are local queued records. A production report must reach an operated moderation service, with timely handling, prohibited-content filtering and reliable account blocking. Publish and maintain valid contact details. Verify the configured `support@gleenc.com` mailbox before launch.
2. Publish approved privacy and terms documents, disclose actual SDK/data collection/retention, and complete Apple's privacy labels and Google Play Data Safety using the shipped app's real behavior. The in-app frontend text is not a substitute for those declarations.
3. Complete live account deletion. The current route queues a local request. It must delete/revoke the real account as required. Google Play additionally requires a functional external deletion-request web resource; provide its URL in Play Console.
4. Complete the iOS login requirement for Google Sign-In. Apple's login-services rules generally require an equivalent privacy-preserving option, unless an exception applies. Assess and implement Sign in with Apple where appropriate, including server token validation. This package does not add a fake Apple authentication button.
5. Separate physical and digital billing. Physical goods/services and digital content consumed in-app follow different store rules. Apple and Google normally require their applicable in-app billing system for in-app digital purchases, subject to current regional/program/entitlement exceptions. Do not enable the prototype's external wallet/card/transfer flow for digital in-app content merely by changing a flag. Determine eligibility per storefront and implement receipt/transaction verification server-side. Mixed baskets may need separate checkout groups.
6. Replace payment success simulation with verified server/processor/store results. Never credit a wallet based on a client button. Review marketplace payouts, refund/dispute handling and legal obligations for the intended operating regions.
7. Disable preview in release builds, remove demonstration actors/content, connect actual product and relationship data, supply a working review account/demo access and accurate review notes. The `__DEV__` guard here disables prototype mutations by default in release; it does not make the app launch-ready by itself.
8. Build the actual native binary, inspect resolved permissions/entitlements/privacy manifests from all dependencies, and test camera/microphone/picking/printing/sharing, accessibility, smaller screens, dark mode, offline recovery and lifecycle behavior on real Android/iOS devices.

## Primary references checked for this implementation

- Apple App Review Guidelines, especially 1.2 (UGC), 3.1 (payments), 4.8 (login services) and 5.1.1 (privacy/deletion): https://developer.apple.com/app-store/review/guidelines/
- Google Play UGC: https://support.google.com/googleplay/android-developer/answer/9876937
- Google Play account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Google Play payments: https://support.google.com/googleplay/android-developer/answer/9858738
- Expo Audio/configuration: https://docs.expo.dev/versions/latest/sdk/audio/
- Expo media permission plugin options: https://docs.expo.dev/versions/latest/sdk/imagepicker/
- Expo Network: https://docs.expo.dev/versions/latest/sdk/network/

Store rules and SDK capabilities can change. Recheck the policies and the documentation for the project's installed Expo SDK when preparing submission. Store approval is determined by the stores after reviewing the complete shipped app and its services.
