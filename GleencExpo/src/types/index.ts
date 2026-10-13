export type UserRole =
  | 'buyer'
  | 'seller'
  | 'rider'
  | 'admin';

export type AccountActivity =
  | 'selling'
  | 'dropshipping'
  | 'marketing';

export type AccountProfile = {
  username: string;
  displayName: string;
  bio: string;
  activities: AccountActivity[];
  interests: string[];
  completedAt: string;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  profile: AccountProfile | null;
  campus: string;
  phone: string;
  country: string;
  state: string;
  city: string;
  address: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  phoneVerified: boolean;
  phoneVerifiedAt: string | null;
  lastLoginAt: string | null;
};

export type SellerStore = {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  description: string;
  campus: string;
  category: string;
  phone: string;
  logoUrl: string | null;
  coverUrl: string | null;
  status: 'active' | 'paused' | 'suspended';
  verified: boolean;
  verificationStatus?: string;
  country?: string;
  state?: string;
  city?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductInteraction = {
  likeCount: number;
  commentCount: number;
  saveCount: number;
  shareCount: number;
  viewCount: number;
  liked: boolean;
};

export type Product = {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  sellerPriceKobo?: number;
  platformFeeKobo?: number;
  buyerPriceKobo?: number;
  priceKobo: number;
  price: number;
  stock: number;
  availableSizes?: string[];
  status: 'draft' | 'active' | 'out_of_stock';
  isFeatured: boolean;
  imageUrls: string[];
  interaction?: ProductInteraction;
  createdAt: string;
  updatedAt: string;
};

export type AuthPayload = {
  user: AuthUser;
  store: SellerStore | null;
  emailVerificationRequired?: boolean;
};

export type AuthApiResponse = {
  success?: boolean;
  message?: string;
  data?: AuthPayload;
  user?: AuthUser;
  store?: SellerStore | null;
  emailVerificationRequired?: boolean;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type ApiMessageResponse = {
  success?: boolean;
  message: string;
};

export type ApiListResponse<T> = {
  items: T[];
  total?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
};