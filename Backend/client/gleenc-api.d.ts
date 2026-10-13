export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type Data = Record<string, unknown>;
export type Platform = "web" | "android" | "ios";
export interface Session {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  expiresAt: string;
  sessionId: string;
  tokenType: "Bearer";
}
export interface Person {
  followed?: boolean;
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  bio?: string;
  coverUrl?: string | null;
  website?: string;
}
export interface Component {
  id: string;
  name: string;
  group?: string;
  unit: string;
  unitDescription?: string;
  priceKobo: number;
  stock: number;
  min?: number;
  max?: number;
  required?: boolean;
  photoId?: string;
  photoUrl?: string|null;
}
export interface Ordering {
  format: "single" | "fixed_pack" | "menu" | "pack_extras";
  unit?: string;
  unitDescription?: string;
  groups?: {name:string;min:number;max:number}[];
  packSize?: number;
  components?: Component[];
  packagingKobo?: number;
  preparationMinutes?: number;
  orderingHours?: string;
  ingredients?: string;
  allergens?: string[];
  pickup?: boolean;
  delivery?: boolean;
}
export interface Variant {
  photoUrls?:string[];
  labels?: Record<string,string>;
  sku?: string;
  id: string;
  size?: string;
  color?: string;
  colorHex?: string;
  priceKobo?: number;
  stock: number;
  photoIds?: string[];
}
export interface ProductInput {
  name: string;
  description: string;
  category: string;
  priceKobo: number;
  stock: number;
  kind?: "physical" | "digital";
  presentation?: "image" | "video";
  mediaIds?: string[];
  posterId?: string;
  fileIds?: string[];
  licence?: string;
  attributes?: Record<string, string>;
  variants?: Variant[];
  ordering?: Ordering;
  catalogueId?: string;
  offersEnabled?: boolean;
  minimumOfferPercent?: number;
  reshareEnabled?: boolean;
  returnDays?: number;
  deliveryKobo?: number;
  publication?: "draft" | "publish" | "schedule";
  publishAt?: string;
}
export interface Product extends ProductInput {
  id: string;
  ownerId: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  version: number;
  state?: string;
  media: { id?: string; kind: string; url: string }[];
  posterUrl?: string | null;
}
export interface Selection {
  productId: string;
  quantity?: number;
  variantId?: string;
  components?: { id: string; quantity: number }[];
  postId?: string;
  offerId?: string;
}
export interface Address {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country?: string;
}
export interface CheckoutInput {
  items?: Selection[];
  cartLineIds?: string[];
  address?: Address;
  method?: "wallet" | "paystack";
}
export interface Quote {
  input: Selection;
  productId: string;
  ownerId: string;
  product: Product;
  quantity: number;
  sellerKobo: number;
  commissionKobo: number;
  platformKobo: number;
  totalKobo: number;
  unitPriceKobo: number;
  markupBps: number;
  discountBps: number;
  promoterId: string | null;
}
export interface Checkout {
  id: string;
  status: string;
  amountKobo: number;
  currency: "NGN";
  reference: string;
  authorizationUrl: string | null;
  expiresAt: string;
  method: string;
  items: Quote[];
}
export interface Wallet {
  currency: "NGN";
  availableKobo: number;
  heldKobo: number;
  transactions: Data[];
}
export interface RequestOptions {
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  binary?: boolean;
  signal?: AbortSignal;
  retry?: boolean;
}
export interface AuthResult {
  user: Data;
  store?: Data | null;
  session?: Session;
  emailVerificationRequired?: boolean;
}
export class GleencApiError extends Error {
  status: number;
  requestId: string | null;
  constructor(status: number, message: string, requestId: string | null);
}
export interface GleencApi {
  request<T = unknown>(path: string, options?: RequestOptions): Promise<T>;
  refresh(): Promise<boolean>;
  activityCounts(): Promise<{
    notificationCount: number;
    messageCount: number;
  }>;
  watchActivity(options: {
    onChange: (counts: {
      notificationCount: number;
      messageCount: number;
    }) => void;
    signal?: AbortSignal;
    intervalMs?: number;
  }): Promise<void>;
  capabilities(): Promise<Data>;
  legal: { get(kind:'privacy'|'terms'|'community'):Promise<{kind:string;title:string;version:string;effectiveDate:string;supportEmail:string;sections:[string,string][]}> };
  verification: {
    get():Promise<Data>;
    policy():Promise<Data>;
    submit(body:{tier:2|3;legalName:string;documentType:'national_id'|'passport'|'drivers_licence'|'voters_card';documentIds:string[];address:string;addressEvidenceIds?:string[];businessName?:string;sourceOfGoods?:string}):Promise<Data>;
    requestPhone(phone:string):Promise<Data>;
    confirmPhone(code:string):Promise<Data>;
  };
  auth: {
    googleExchange(body:{code:string;verifier:string}):Promise<AuthResult>;
    login(body: {
      email: string;
      password: string;
      deviceName?: string;
    }): Promise<AuthResult>;
    register(body: {
      name: string;
      email: string;
      password: string;
      country?: string;
      deviceName?: string;
    }): Promise<AuthResult>;
    challenge(): Promise<{
      id: string;
      nonce: string;
      appleNonce: string;
      expiresAt: string;
    }>;
    identity(body: {
      provider: "google" | "apple";
      idToken: string;
      challengeId: string;
      nonce: string;
      name?: string;
    }): Promise<AuthResult>;
    logout(): Promise<Data>;
  };
  account: {
    get(): Promise<Data>;
    blocks():Promise<Data[]>;
    acceptTerms(version: string): Promise<Data>;
    editProfile(body: Data): Promise<Data>;
    settings(body: Data): Promise<Data>;
    selling(body: Data): Promise<Data>;
    addresses(): Promise<Data[]>;
    saveAddress(
      body: Address & { label?: string },
      key?: string,
    ): Promise<Data>;
    deleteAddress(key: string): Promise<Data>;
    delete(body: { password: string; confirm: "DELETE" }): Promise<Data>;
    devices(): Promise<Data[]>;
    revokeDevice(key: string): Promise<Data>;
    presence(): Promise<Data>;
    registerPush(body: {
      token: string;
      projectId: string;
      platform: "ios" | "android";
    }): Promise<Data>;
    block(key: string, blocked?: boolean): Promise<Data>;
  };
  feed(
    params?: Record<string, string | number>,
  ): Promise<{ posts: Data[]; nextOffset: number | null }>;
  search(params: {
    q: string;
    limit?: number;
    offset?: number;
  }): Promise<{ products: Product[]; people: Person[] }>;
  categories(): Promise<string[]>;
  products: {
    archive(key: string): Promise<{ active: false }>;
    editable(key: string): Promise<Product>;
    get(key: string): Promise<Product>;
    mine(params?: Record<string, string | number>): Promise<Product[]>;
    save(body: ProductInput, key?: string): Promise<Product>;
    availability(key: string, active: boolean): Promise<Data>;
    like(key: string, liked?: boolean): Promise<Data>;
    comments(key: string,params?:Record<string,string|number>): Promise<Data[]>;
    comment(
      key: string,
      body: { body: string; parentCommentId?: string },
    ): Promise<Data>;
    reviews(key: string): Promise<Data[]>;
  };
  catalogue: {
    get(key: string): Promise<Data[]>;
    save(
      body: { name: string; priceKobo: number; ordering: Ordering },
      key?: string,
    ): Promise<Data>;
  };
  people: {
    get(key: string): Promise<Person>;
    connections(
      key: string,
      params?: Record<string, string | number>,
    ): Promise<{ people: Person[]; total: number }>;
    follow(key: string, active?: boolean): Promise<Data>;
  };
  media: {
    upload(formData: FormData): Promise<{
      id: string;
      kind: string;
      mimeType: string;
      bytes: number;
      url: string | null;
    }>;
    private(key: string): Promise<Blob>;
  };
  posts: {
    archive(key: string): Promise<{ active: false }>;
    reshare(
      key: string,
      body: { markupPercent: number; caption?: string },
    ): Promise<Data>;
    event(key: string, kind: "share" | "view" | "open"): Promise<Data>;
    analytics(): Promise<Data>;
  };
  offers: {
    get(key:string):Promise<Data>;
    preview(body:Selection & {discountPercent:number}):Promise<Quote>;
    create(body: Selection & { discountPercent: number }): Promise<Data>;
    list(params?: Record<string, string | number>): Promise<Data[]>;
    answer(key: string, decision: "accept" | "reject"): Promise<Data>;
  };
  quote(body: Selection): Promise<Quote>;
  cart: {
    list(): Promise<(Quote & { lineId: string; available: boolean })[]>;
    add(body: Selection): Promise<{ lineId: string; cart: Data[] }>;
    update(key: string, body: Selection): Promise<Data>;
    remove(key: string): Promise<Data>;
  };
  checkout: {
    list(params?:Record<string,string|number>):Promise<Checkout[]>;
    create(body: CheckoutInput, key: string): Promise<Checkout>;
    get(key: string): Promise<Checkout>;
    cancel(key: string): Promise<Checkout>;
    payWallet(key: string): Promise<Checkout>;
    initialize(key: string): Promise<Checkout>;
    verify(key: string): Promise<Checkout>;
  };
  orders: {
    list(params?: Record<string, string | number>): Promise<Data[]>;
    get(key: string): Promise<Data>;
    prepare(key: string): Promise<Data>;
    dispatch(order: string, pkg: string, body: Data): Promise<Data>;
    confirm(order: string, pkg: string, code: string): Promise<Data>;
    receipt(key: string): Promise<Data>;
    issue(line: string, body: Data): Promise<Data>;
    review(
      line: string,
      body: { rating: number; body: string; photoIds?: string[] },
    ): Promise<Data>;
  };
  wallet: {
    banks(): Promise<{ name: string; code: string }[]>;
    recipient(): Promise<{
      accountName: string;
      bankCode: string;
      last4: string;
    } | null>;
    saveRecipient(body: {
      accountNumber: string;
      bankCode: string;
      password: string;
    }): Promise<Data>;
    get(): Promise<Wallet>;
    topup(amountKobo: number, key: string): Promise<Data>;
    verifyTopup(key: string): Promise<Data>;
    withdraw(amountKobo: number, key: string): Promise<Data>;
    verifyWithdrawal(key: string): Promise<Data>;
  };
  notifications: {
    list(
      params?: Record<string, string | number>,
    ): Promise<{ notifications: Data[]; unreadCount: number }>;
    read(ids: string[]): Promise<Data>;
    readAll(): Promise<Data>;
  };
  chat: {
    list(params?: Record<string, string | number>): Promise<Data[]>;
    open(userId: string): Promise<{ id: string }>;
    messages(
      key: string,
      params?: Record<string, string | number>,
    ): Promise<{ messages: Data[]; nextOffset: number | null }>;
    send(
      key: string,
      body: {
        body?: string;
        attachmentId?: string;
        replyId?: string;
        productId?: string;
        postId?: string;
        offerId?: string;
      },
      requestKey: string,
    ): Promise<Data>;
    ack(
      key: string,
      messageIds: string[],
      status: "delivered" | "read",
    ): Promise<Data>;
    messageAction(key: string, message: string, body: Data): Promise<Data>;
    settings(key: string, body: Data): Promise<Data>;
  };
  library: {
    list(): Promise<Data[]>;
    grant(
      key: string,
      mediaId: string,
    ): Promise<{ token: string; expiresAt: string; path: string }>;
    download(token: string): Promise<Blob>;
  };
  saved: {
    list(): Promise<Product[]>;
    set(key: string, active: boolean): Promise<Data>;
  };
  report(body: {
    kind: "product" | "post" | "account" | "comment" | "review" | "message";
    targetId: string;
    reason: "spam" | "fraud" | "harassment" | "unsafe" | "copyright" | "other";
    details?: string;
  }): Promise<Data>;
}
export function createGleencApi(options: {
  baseUrl: string;
  platform?: Platform;
  fetchImpl?: typeof fetch;
  getSession?: () => Promise<Session | null>;
  saveSession?: (session: Session) => Promise<unknown>;
  clearSession?: () => Promise<unknown>;
  allowLocalHttp?: boolean;
}): GleencApi;
