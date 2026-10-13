import { list, required } from '@/features/account/guards';
import { integer, money, uri, validatePlan } from '@/features/marketplace/domain';
import type { Entry } from './feed-state';
export function restoreCart(value: unknown, ownerId: string): {
    ownerId: string;
    cart: Entry[];
} {
    const s = value as {
        ownerId: string;
        cart: Entry[];
    };
    if (!s || s.ownerId !== ownerId)
        throw new Error('Cart ownership mismatch.');
    const ids = new Set<string>();
    for (const row of list<Entry>(s.cart, 100)) {
        const item = row.item;
        if (!item || ids.has(item.id))
            throw new Error('Invalid cart item.');
        ids.add(required(item.id, 'a product id'));
        required(item.name, 'a product name');
        required(item.store, 'a seller', 100);
        money(item.priceKobo, false);
        integer(item.stock, 0, 1000000, 'stock');
        integer(row.quantity, 1, 1000, 'quantity');
        uri(item.image);
        if (item.plan)
            validatePlan(item.plan);
        if (item.config) {
            required(item.config.postId, 'a configured product');
            list(item.config.selections, 100);
        }
        if (item.offer) {
            required(item.offer.originalProductId, 'an original product');
            required(item.offer.promoterId, 'a promoter');
            money(item.offer.basePriceKobo, false);
            money(item.offer.commissionKobo);
            if (item.offer.basePriceKobo + item.offer.commissionKobo !== item.priceKobo)
                throw new Error('Invalid reshare cart total.');
        }
    }
    return s;
}
