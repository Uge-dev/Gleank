# Use the same client on web and Expo

Copy `client/gleenc-api.js` into your frontend API layer. It has no backend database imports and adds no frontend dependency.

Browser:

```js
import { createGleencApi } from './gleenc-api.js';
export const api = createGleencApi({
  baseUrl: 'https://YOUR_API_HOST/api/v2',
  platform: 'web',
});
```

Expo:

```js
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createGleencApi } from './gleenc-api.js';
export const api = createGleencApi({
  baseUrl: process.env.EXPO_PUBLIC_API_URL + '/api/v2',
  platform: Platform.OS,
  getSession: async () => JSON.parse(await SecureStore.getItemAsync('gleenc.session') || 'null'),
  saveSession: session => SecureStore.setItemAsync('gleenc.session', JSON.stringify(session)),
  clearSession: () => SecureStore.deleteItemAsync('gleenc.session'),
});
```

The public API URL is not a secret. Provider keys and signing/encryption secrets belong on the server only. Store mobile session tokens in SecureStore; browsers use the HttpOnly cookie. Clear frontend account caches when changing accounts. Never log tokens or private download grants.

## Screen mapping

| Screen/action | Client method |
|---|---|
| Startup/feed | `capabilities()`, `feed()`; guests may browse |
| Sign in/register | `auth.login()`, `auth.register()`; complete email verification through existing `/api/auth` routes |
| Google/Apple | `auth.challenge()` → provider ID token with the returned nonce → `auth.identity()`. Google uses `nonce`; Apple uses `appleNonce` in its native request; send the original nonce to Gleenc |
| First authenticated activity | `account.acceptTerms(capabilities.termsVersion)` |
| Profile/setup | `account.editProfile()`, `account.selling()`, `catalogue.save()` |
| Create product | Upload media first, then `products.save()` with returned media IDs. Video publication needs a poster image. Digital files are uploaded using kind `digital` |
| Profile pricing | `catalogue.save()` then choose `catalogueId` on the product. Server inherits prices and ordering; snapshots of existing purchases remain unchanged |
| Product selection | `quote()` with productId, quantity, variantId and components. Use `postId` when buying through a reshare |
| Add to cart modal | `cart.add(selection)` then either continue browsing or `checkout.create({cartLineIds:[lineId], ...}, key)` from that modal |
| Direct checkout | `checkout.create({items:[selection], address, method:'paystack'}, key)` |
| Selected cart checkout | Pass only the checked `cartLineIds`; unselected rows stay in the cart |
| Payment | `checkout.initialize(id)` → provider page → `checkout.verify(id)`. For wallet, call `checkout.payWallet(id)` |
| Make offer | `offers.create({...selection, discountPercent})`; seller `offers.answer(id,'accept')`; buyer adds returned `offerId` to the same selection |
| Reshare | `posts.reshare(postId,{markupPercent,caption})`; this creates a new attributed feed post |
| Share/forward | `chat.open(userId)` + `chat.send(conversationId,{productId,postId},key)` or the OS share sheet; record `posts.event(postId,'share')` after sending |
| Seller fulfillment | `orders.prepare(id)` returns codes only to seller. Dispatch each returned package; buyer confirms with its code and explicit receipt acceptance |
| Return/dispute | `orders.issue(lineId,{kind,reason,evidenceIds})`; seller can use `request('/issues/:id/reply',{method:'POST',body})`. Resolution remains admin controlled |
| Digital purchases | Web checkout → `library.list()` → `library.grant(entitlementId,mediaId)` → `library.download(token)` using authenticated POST. Downloaded files must remain private to the account on shared devices |
| Wallet | `wallet.get()`, `wallet.topup(amountKobo,key)`, `wallet.withdraw(amountKobo,key)`, verification methods. Set up bank recipients through the existing `/api/commerce` bank APIs |
| Activity/chat | `notifications.list()`, `chat.list()`, `chat.messages()`, explicit `chat.ack(...,'delivered'/'read')`. Online presence does not imply delivery or reading |
| Badges | `activityCounts()` or `watchActivity({onChange,signal})`; cancel polling on screen/app exit |
| Profile images | Upload kind `avatar`/`cover`, then `account.editProfile({avatarId,coverId})` |
| Reports/blocking | `report()`, `account.block()` |

## Important input rules

- Currency values are **kobo**, not naira. Percentages on offer/reshare inputs are 0–20; snapshots use basis points (100 bps = 1%).
- `components: [{id:'rice',quantity:2}]` means two seller-defined units per outer quantity. An order with outer quantity 3 requires six rice units. The seller sees the exact snapshot.
- An accepted offer is bound to quantity, variant, menu selection, product version and post attribution. Changing these requires a new offer.
- Generate and persist an idempotency key **once per user intent** for checkout, top-up, withdrawal and message send. Reuse it after a network retry; never reuse it for different input. Payment initialization uses the checkout's existing reference.
- Do not submit client-calculated prices, user IDs, commission amounts, wallet balances or QR ownership. The server derives these.
- Browser mutating requests need their normal trusted `Origin` header and `credentials: include`. Native requests use bearer tokens; do not add a forged Origin to bypass browser checks.
- Upload a private chat photo as `chat_image`, not public `image`. Evidence uses `evidence`/`receipt`/`document`. Send attachment IDs, not arbitrary URLs.
- The upload endpoint accepts one `file` and one `kind` multipart field. Do not manually set the multipart Content-Type boundary. React Native FormData uses `{uri,name,type}`; browser FormData uses a File.
- Relative `/api/v2/media` and `/uploads` URLs refer to the API host, not the web frontend host. The client resolves these asset fields to the API origin.
- Do not mix local demo IDs with server IDs. Replace local cart/order/wallet sources incrementally and preserve loading, empty, error and retry states.

## Existing web data

The new feed includes historical active products and product-linked video posts. Existing conversations/messages remain in the same tables. Existing orders and payouts retain their historical API and financial terms. Keep those screens on `/api/orders` and `/api/commerce` until their frontend adapter is explicitly migrated; do not credit historical payouts into the new wallet a second time.


## Product API boundaries

Use `api.products.save` for configured products. Legacy seller edit/publish/validate/stock/availability routes return 409 for these products so they cannot overwrite menu/variant/digital/schedule metadata. Historical products keep their legacy editing APIs while no shared reservation or unsettled order depends on their inventory.

Use `api.products.archive(id)` (DELETE `/products/:id`) to remove a product from discovery without deleting purchases, licences or financial history. `api.posts.archive(id)` archives an owned reshare; archiving an original post also pauses its product. A flagged, rejected or hidden product cannot be reactivated by a seller's availability toggle. Legacy admin moderation remains available and synchronizes shared publication state.

Existing configured product screens in the web app must switch to the shared API before rollout. Do not mix shared checkout IDs and historical order IDs.
