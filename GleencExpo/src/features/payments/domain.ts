import type { CheckoutDetails, CheckoutSource } from '@/features/commerce/commerce-state';
import type { Entry } from '@/features/feed/feed-state';
import { list, required, timestamp } from '@/features/account/guards';
import { integer, money, text } from '@/features/marketplace/domain';
export type PaymentAttempt = {
    id: string;
    ownerId: string;
    createdAt: number;
    expiresAt: number;
    updatedAt: number;
    status: 'ready' | 'pending' | 'failed' | 'succeeded' | 'cancelled' | 'expired';
    details: CheckoutDetails;
    source: CheckoutSource;
    totalKobo: number;
    fingerprint: string;
    failure: string;
    retries: number;
    orderId?: string;
};
export function checkoutFingerprint(details: CheckoutDetails, rows: Entry[]) {
    return JSON.stringify({ method: details.paymentMethod, fulfillment: details.fulfillment, recipient: details.recipient.trim(), phone: details.phone.trim(), address: details.address.trim(), note: details.note.trim(), items: rows.map(r => ({ id: r.item.id, quantity: r.quantity, price: r.item.priceKobo, version: r.item.priceVersion ?? 0, seller: r.item.sellerId ?? r.item.store, config: r.item.config ?? null, offer: r.item.offer ?? null, shipping: r.item.shipping ?? null })).sort((a, b) => a.id.localeCompare(b.id)) });
}
export function restorePayments(v: unknown, ownerId: string): {
    ownerId: string;
    attempts: PaymentAttempt[];
} {
    const s = v as {
        ownerId: string;
        attempts: PaymentAttempt[];
    };
    if (!s || s.ownerId !== ownerId)
        throw new Error('Payment ownership mismatch.');
    const ids = new Set<string>();
    for (const a of list<PaymentAttempt>(s.attempts, 200)) {
        if (a.ownerId !== ownerId || ids.has(a.id) || !/^PAY-[A-F0-9]{32}$/.test(a.id) || !['ready', 'pending', 'failed', 'succeeded', 'cancelled', 'expired'].includes(a.status))
            throw new Error('Invalid payment attempt.');
        ids.add(a.id);
        timestamp(a.createdAt);
        timestamp(a.expiresAt);
        timestamp(a.updatedAt);
        if (a.expiresAt !== a.createdAt + 30 * 60000)
            throw new Error('Invalid payment expiry.');
        money(a.totalKobo, false);
        integer(a.retries, 0, 10, 'retry count');
        text(a.failure, 500);
        text(a.fingerprint, 250000);
        if (!['wallet', 'card', 'transfer'].includes(a.details?.paymentMethod) || !['delivery', 'pickup'].includes(a.details?.fulfillment))
            throw new Error('Invalid payment method.');
        text(a.details.recipient, 80);
        text(a.details.phone, 25);
        text(a.details.address, 500);
        text(a.details.note, 500);
        if (a.source.kind === 'cart') {
            list<string>(a.source.ids, 100).forEach(x => required(x, 'a cart item'));
            if (!a.source.ids.length || new Set(a.source.ids).size !== a.source.ids.length)
                throw new Error('Invalid cart selection.');
        }
        else if (a.source.kind === 'quote')
            required(a.source.id, 'an offer');
        else if (a.source.kind === 'product') {
            required(a.source.item.id, 'a product');
            integer(a.source.quantity, 1, 1000, 'quantity');
        }
        else
            throw new Error('Invalid checkout source.');
        if ((a.status === 'succeeded') !== !!a.orderId)
            throw new Error('Invalid payment result.');
        if (a.orderId)
            required(a.orderId, 'an order');
    }
    return s;
}
