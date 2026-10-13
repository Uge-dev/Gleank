import { createContext, useContext, type ReactNode } from 'react';
import { useCommerce } from '@/features/commerce/commerce-state';
import { originalSeller } from '@/features/commerce/settlement';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { useCommunity } from '@/features/community/community-state';
import { useAccount } from '@/features/account/account-state';
import { contentText } from '@/features/community/domain';
import { useLocalRecord } from '@/features/experience/local-record';
import { list, required, secureId, timestamp } from '@/features/account/guards';
import { integer, uri } from '@/features/marketplace/domain';
import type { FeedItem } from '@/features/feed/data';
export type Review = {
    id: string;
    ownerId: string;
    productId: string;
    orderId: string;
    lineId: string;
    name: string;
    avatar: string;
    rating: number;
    body: string;
    photos: string[];
    at: number;
    updatedAt: number;
    helpful: string[];
    reply?: {
        ownerId: string;
        text: string;
        at: number;
    };
};
type Record = {
    ownerId: string;
    reviews: Review[];
};
export const reviewProductId = (item: FeedItem) => item.offer?.originalProductId ?? item.config?.postId ?? item.id;
export function restoreReviews(v: unknown, ownerId: string): Record {
    const s = v as Record;
    if (!s || s.ownerId !== ownerId)
        throw new Error('Review ownership mismatch.');
    const ids = new Set<string>(), lines = new Set<string>();
    for (const r of list<Review>(s.reviews, 500)) {
        if (r.ownerId !== ownerId || ids.has(r.id) || lines.has(r.lineId))
            throw new Error('Invalid review ownership or duplicate purchase review.');
        ids.add(required(r.id, 'a review id'));
        lines.add(required(r.lineId, 'an order line'));
        required(r.orderId, 'an order');
        required(r.productId, 'a product');
        required(r.name, 'a display name', 100);
        uri(r.avatar);
        integer(r.rating, 1, 5, 'rating');
        contentText(r.body);
        timestamp(r.at);
        timestamp(r.updatedAt);
        list<string>(r.photos, 4).forEach(uri);
        list<string>(r.helpful, 1000).forEach(x => required(x, 'an account id'));
        if (new Set(r.helpful).size !== r.helpful.length)
            throw new Error('Duplicate helpful vote.');
        if (r.reply) {
            required(r.reply.ownerId, 'a seller id');
            contentText(r.reply.text);
            timestamp(r.reply.at);
        }
    }
    return s;
}
const Context = createContext<ReturnType<typeof useReviewValue> | null>(null);
function useReviewValue() {
    const commerce = useCommerce();
    const market = useMarketplace();
    const community = useCommunity();
    const account = useAccount();
    const ownerId = commerce.buyerId;
    const store = useLocalRecord('gleenc:reviews:v13:' + ownerId, () => ({ ownerId, reviews: [] } as Record), v => restoreReviews(v, ownerId));
    const eligible = (id: string) => commerce.orders.flatMap(o => o.buyerId === ownerId ? o.items.filter(row => reviewProductId(row.item) === id && row.tickets.every(t => t.status === 'confirmed') && !commerce.issues.some(i => i.lineId === row.lineId && ['requested', 'escalated', 'return-approved', 'refunded'].includes(i.status)) && originalSeller(row) !== ownerId).map(row => ({ orderId: o.id, lineId: row.lineId, item: row.item })) : []);
    const verified = (r: Review) => eligible(r.productId).some(p => p.lineId === r.lineId && p.orderId === r.orderId);
    function saveReview(productId: string, orderId: string, lineId: string, rating: number, body: string, photos: string[]) {
        community.assertPosting();
        integer(rating, 1, 5, 'rating');
        body = contentText(body);
        list<string>(photos, 4).forEach(uri);
        if (!commerce.ready || !eligible(productId).some(p => p.orderId === orderId && p.lineId === lineId))
            throw new Error('Reviews require a completed purchase for this product.');
        const previous = store.current.current.reviews.find(r => r.lineId === lineId);
        const review: Review = { id: previous?.id ?? secureId('REV'), ownerId, productId, orderId, lineId, name: community.me.name, avatar: community.me.avatar, rating, body, photos, at: previous?.at ?? Date.now(), updatedAt: Date.now(), helpful: previous?.helpful ?? [], ...(previous?.reply ? { reply: previous.reply } : {}) };
        store.commit(s => ({ ...s, reviews: [review, ...s.reviews.filter(r => r.lineId !== lineId)] }));
        return review;
    }
    function removeReview(id: string) {
        store.commit(s => {
            const r = s.reviews.find(r => r.id === id);
            if (!r || r.ownerId !== ownerId)
                throw new Error('Only the review author can delete it.');
            return { ...s, reviews: s.reviews.filter(r => r.id !== id) };
        });
    }
    function helpful(id: string) {
        community.assertPosting();
        store.commit(s => ({ ...s, reviews: s.reviews.map(r => {
                if (r.id !== id)
                    return r;
                if (!verified(r))
                    throw new Error('This review is unavailable.');
                return { ...r, helpful: r.helpful.includes(ownerId) ? r.helpful.filter(x => x !== ownerId) : [...r.helpful, ownerId] };
            }) }));
    }
    function reply(id: string, body: string) {
        community.assertPosting();
        body = contentText(body);
        store.commit(s => ({ ...s, reviews: s.reviews.map(r => {
                if (r.id !== id)
                    return r;
                const o = commerce.orders.find(o => o.id === r.orderId), row = o?.items.find(row => row.lineId === r.lineId);
                if (!row || originalSeller(row) !== market.ownerId)
                    throw new Error('Only the original seller can reply.');
                return { ...r, reply: { ownerId: market.ownerId, text: body, at: Date.now() } };
            }) }));
    }
    const forProduct = (id: string) => store.value.reviews.filter(r => r.productId === id && verified(r) && !account.isBlocked(r.name));
    return { ...store, eligible, verified, saveReview, removeReview, helpful, reply, forProduct };
}
export function ReviewProvider({ children }: {
    children: ReactNode;
}) {
    return <Context.Provider value={useReviewValue()}>{children}</Context.Provider>;
}
export function useReviews() {
    const v = useContext(Context);
    if (!v)
        throw new Error('ReviewProvider is missing.');
    return v;
}
