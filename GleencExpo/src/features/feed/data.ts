import type { Plan, Configuration } from '@/features/marketplace/domain';
// Demonstration catalog built from Gleenc's web demo plus stock food footage.
// These are illustrative listings, not real seller uploads or current inventory.
import type { DigitalDetails } from '@/features/digital/files';
export type FeedItem = {
    remote?: {
        productId: string; postId: string; authorId: string; ownerId: string;
        authorName: string; avatarUrl: string; viewerLiked: boolean; viewerFollowing?: boolean;
    viewerReshared?:boolean;
        offersEnabled: boolean; orderingFormat: string; markupBps: number;
    };
    productType?: 'physical' | 'digital';
    listingStatus?: 'active' | 'paused' | 'archived' | 'deleted';
    fullDescription?: string;
    subcategory?: string;
    attributes?: Record<string, string>;
    colorImages?: {
        uri: string;
        color: string;
    }[];
    colors?: Record<string, string>;
    variants?: {
        id: string;
        labels: Record<string, string>;
        sku: string;
        priceKobo: number;
        stock: number;
    }[];
    shipping?: {
        pickup: boolean;
        delivery: boolean;
        interstate: boolean;
        pickupArea: string;
        dispatchArea: string;
        localFeeKobo?: number;
        preparation: string;
        handling: string;
    };
    digital?: DigitalDetails;
    sellerId?: string;
    catalogueId?: string;
    plan?: Plan;
    priceVersion?: number;
    config?: Configuration;
    quoteId?: string;
    offer?: {
        originalProductId: string;
        promoterId: string;
        promoterName: string;
        basePriceKobo: number;
        commissionKobo: number;
        markupPercent: number;
    };
    id: string;
    kind: 'video' | 'product';
    name: string;
    priceKobo: number;
    image: string;
    images?: string[];
    videoUrl?: string;
    videoAsset?: 'noodles' | 'cake' | 'shawarma';
    store: string;
    handle: string;
    category: string;
    description: string;
    likes: number;
    comments: number;
    reshares?: number;
    shares?: number;
    views: number;
    stock: number;
    createdAt: number;
};
const shawarma = [
    'https://images.unsplash.com/photo-1633321702518-7feccafb94d5?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=900&q=80',
];
const noodles = [
    'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1555126634-323283e090fa?auto=format&fit=crop&w=900&q=80',
];
const cake = [
    'https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1464305795204-6f5bbfc7fb81?auto=format&fit=crop&w=900&q=80',
];
const rice = [
    'https://images.unsplash.com/photo-1604909052743-94e838986d24?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=80',
];
const sneakers = [
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=80',
    'https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=900&q=80',
];
export const FEED: FeedItem[] = [
    {
        id: 'noodles-prep-video', videoAsset: 'noodles', kind: 'video', name: 'Belleful noodles', priceKobo: 525000,
        store: 'Movers', handle: '@movers', category: 'Food', description: 'Fresh noodles prepared to order. Pickup and delivery available.',
        image: noodles[0], images: noodles,
        videoUrl: 'https://videos.pexels.com/video-files/35000996/14828081_1920_1080_30fps.mp4',
        likes: 142, reshares: 18, shares: 31, comments: 19, views: 870, stock: 6, createdAt: 1790736100,
    },
    {
        id: 'chicken-pie', kind: 'product', name: 'Grilled Chicken Pie', priceKobo: 315000,
        store: 'Movers', handle: '@movers', category: 'Food', description: 'Grilled chicken, fresh vegetables and sauce, made for a quick campus meal.',
        image: shawarma[0], images: shawarma, likes: 23, reshares: 2, shares: 7, comments: 3, views: 94, stock: 2, createdAt: 1790736000,
    },
    {
        id: 'cake-decorating-video', videoAsset: 'cake', kind: 'video', name: 'Celebration Cake', priceKobo: 525000,
        store: 'Movers', handle: '@movers', category: 'Food', description: 'A celebration cake made for birthdays and special moments.',
        image: cake[0], images: cake,
        videoUrl: 'https://videos.pexels.com/video-files/7525480/7525480-hd_1080_1920_25fps.mp4',
        likes: 51, reshares: 5, shares: 10, comments: 7, views: 410, stock: 6, createdAt: 1790735900,
    },
    {
        id: 'campus-sneakers', kind: 'product', name: 'Trendy Sneakers', priceKobo: 2500000,
        store: 'Campus Wears', handle: '@campus-wears', category: 'Fashion', description: 'Comfortable everyday sneakers available around campus.',
        image: sneakers[0], images: sneakers, likes: 120, reshares: 12, shares: 24, comments: 21, views: 875, stock: 8, createdAt: 1790735800,
    },
    {
        id: 'shawarma-making-video', videoAsset: 'shawarma', kind: 'video', name: 'Campus Shawarma', priceKobo: 200000,
        store: 'Snack Spot', handle: '@snackspot', category: 'Food', description: 'Fresh shawarma with fast pickup and local delivery.',
        image: shawarma[0], images: shawarma,
        videoUrl: 'https://videos.pexels.com/video-files/34276044/14521211_2160_3840_30fps.mp4',
        likes: 334, reshares: 36, shares: 61, comments: 29, views: 1940, stock: 30, createdAt: 1790735700,
    },
    {
        id: 'rice-combo', kind: 'product', name: 'Jollof Rice Combo', priceKobo: 250000,
        store: 'Tasty Bowl', handle: '@tasty-bowl', category: 'Food', description: 'Rice, protein and a drink for lunch. Made fresh each day.',
        image: rice[0], images: rice, likes: 75, reshares: 6, shares: 16, comments: 11, views: 431, stock: 25, createdAt: 1790735600,
    },
    {
        id: 'store-noodles', kind: 'product', name: 'Belleful noodles', priceKobo: 525000,
        store: 'Movers', handle: '@movers', category: 'Food', description: 'Prepared to order for lunch.',
        image: noodles[0], images: noodles, likes: 5, reshares: 0, shares: 2, comments: 1, views: 41, stock: 6, createdAt: 1790735500,
    },
    {
        id: 'engineering-textbook', kind: 'product', name: 'Engineering Textbook', priceKobo: 600000,
        store: 'Book Plug', handle: '@bookplug', category: 'Academic', description: 'Useful engineering reference book for students.',
        image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80',
        images: [
            'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80',
            'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=900&q=80',
        ],
        likes: 18, reshares: 1, shares: 4, comments: 2, views: 87, stock: 12, createdAt: 1790735400,
    },
    {
        id: 'classic-watch', kind: 'product', name: 'Classic Wristwatch', priceKobo: 1200000,
        store: 'Time House', handle: '@timehouse', category: 'Accessories', description: 'Everyday wristwatch and accessories.',
        image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80',
        images: [
            'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80',
            'https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=900&q=80',
        ],
        likes: 34, reshares: 2, shares: 8, comments: 4, views: 207, stock: 15, createdAt: 1790735300,
    },
    {
        id: 'campus-backpack', kind: 'product', name: 'Everyday Backpack', priceKobo: 1450000,
        store: 'Campus Wears', handle: '@campus-wears', category: 'Fashion',
        description: 'A roomy everyday backpack for books and essentials.',
        image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80',
        images: ['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80'],
        likes: 28, reshares: 3, shares: 6, comments: 5, views: 129, stock: 7, createdAt: 1790735200,
    },
];
export const PROFILE_PRODUCTS: FeedItem[] = FEED.filter(item => item.store === 'Movers');
export const formatPrice = (value: number) => `₦${(value / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
export const shortCount = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(value);

/** Menu totals require a server quote; never present a zero base as the final meal price. */
export function listingPrice(item: FeedItem): string {
    if (item.remote && ['menu', 'pack_extras'].includes(item.remote.orderingFormat)) {
        return item.priceKobo > 0 ? `From ${formatPrice(item.priceKobo)}` : 'Choose items for price';
    }
    return `${item.plan?.components.length ? 'From ' : ''}${formatPrice(item.priceKobo)}`;
}
