import { createContext, useContext, type ReactNode } from 'react';
import { useCommerce, type CheckoutDetails, type CheckoutSource } from '@/features/commerce/commerce-state';
import { useLocalRecord } from '@/features/experience/local-record';
import { secureId, clone } from '@/features/account/guards';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { restorePayments, type PaymentAttempt } from './domain';
const Context = createContext<ReturnType<typeof usePaymentValue> | null>(null);
function usePaymentValue() {
    const commerce = useCommerce();
    const ownerId = commerce.buyerId;
    const store = useLocalRecord('gleenc:payments:v13:' + ownerId, () => ({ ownerId, attempts: [] as PaymentAttempt[] }), v => restorePayments(v, ownerId));
    function gate() {
        if (!FRONTEND_PREVIEW)
            throw new Error('Live payments require a verified server payment service and the appropriate store billing flow.');
        if (!commerce.ready)
            throw new Error('Orders are loading.');
    }
    function find(id: string) {
        const a = store.current.current.attempts.find(a => a.id === id);
        if (!a || a.ownerId !== ownerId)
            throw new Error('Payment not found for this account.');
        return a;
    }
    function update(id: string, patch: Partial<PaymentAttempt>) {
        store.commit(s => ({ ...s, attempts: s.attempts.map(a => a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a) }));
    }
    function start(details: CheckoutDetails, source: CheckoutSource) {
        gate();
        const snapshot = commerce.prepareCheckout(details, source);
        const at = Date.now();
        const a: PaymentAttempt = { id: secureId('PAY'), ownerId, createdAt: at, updatedAt: at, expiresAt: at + 30 * 60000, status: details.paymentMethod === 'transfer' ? 'pending' : 'ready', details: clone(details), source: clone(source), totalKobo: snapshot.totalKobo, fingerprint: snapshot.fingerprint, failure: '', retries: 0 };
        store.commit(s => ({ ...s, attempts: [a, ...s.attempts] }));
        return a;
    }
    function complete(id: string) {
        gate();
        const a = find(id);
        const existing = commerce.orderForPayment(id);
        if (existing) {
            if (a.status !== 'succeeded')
                update(id, { status: 'succeeded', orderId: existing.id, failure: '' });
            return existing;
        }
        if (a.status === 'succeeded')
            throw new Error('Order history is unavailable. Retry loading before making another payment.');
        if (!['ready', 'pending'].includes(a.status))
            throw new Error('Retry or restart this payment before continuing.');
        if (Date.now() >= a.expiresAt) {
            update(id, { status: 'expired', failure: 'Payment session expired.' });
            throw new Error('Payment session expired. Review checkout again.');
        }
        try {
            const order = commerce.placeOrder(a.details, a.source, a.id, a.fingerprint);
            update(id, { status: 'succeeded', orderId: order.id, failure: '' });
            return order;
        }
        catch (e) {
            const message = e instanceof Error ? e.message.slice(0, 500) : 'Payment could not complete.';
            update(id, { status: 'failed', failure: message });
            throw e;
        }
    }
    function fail(id: string, reason = 'The payment was declined. No money was deducted.') {
        gate();
        const a = find(id);
        if (!['ready', 'pending'].includes(a.status))
            throw new Error('This payment cannot be failed.');
        if (commerce.orderForPayment(id))
            throw new Error('This payment already has an order.');
        update(id, { status: 'failed', failure: reason.slice(0, 500) });
    }
    function retry(id: string) {
        gate();
        const a = find(id);
        if (a.status !== 'failed' || a.retries >= 10 || Date.now() >= a.expiresAt)
            throw new Error('Start a new checkout session.');
        const current = commerce.prepareCheckout(a.details, a.source);
        if (current.fingerprint !== a.fingerprint)
            throw new Error('The order changed. Review checkout again.');
        update(id, { status: a.details.paymentMethod === 'transfer' ? 'pending' : 'ready', failure: '', retries: a.retries + 1 });
    }
    function cancel(id: string) {
        gate();
        const a = find(id);
        if (a.status === 'succeeded' || commerce.orderForPayment(id))
            throw new Error('A completed payment cannot be cancelled here. Open your order.');
        if (a.status === 'cancelled')
            return;
        update(id, { status: 'cancelled', failure: '' });
    }
    const attempts = store.value.attempts.map(a => {
        const order = commerce.orders.find(o => o.paymentAttemptId === a.id && o.buyerId === ownerId);
        return order ? { ...a, status: 'succeeded' as const, orderId: order.id } : Date.now() >= a.expiresAt && ['ready', 'pending', 'failed'].includes(a.status) ? { ...a, status: 'expired' as const } : a;
    });
    return { ...store, attempts, start, complete, fail, retry, cancel };
}
export function PaymentProvider({ children }: {
    children: ReactNode;
}) {
    return <Context.Provider value={usePaymentValue()}>{children}</Context.Provider>;
}
export function usePayments() {
    const v = useContext(Context);
    if (!v)
        throw new Error('PaymentProvider is missing.');
    return v;
}
