import { checkoutFingerprint } from '@/features/payments/domain';
import { useAccount } from '@/features/account/account-state';
import { secureId, required, clone } from '@/features/account/guards';
import { advanceLine, requestIssue, respondIssue, requestWithdrawal, completeWithdrawal, originalSeller, type Issue, type Phase, type Withdrawal } from './settlement';
import { localStorage, restoreSettlement } from './session-storage';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { useFeedState } from '@/features/feed/feed-state';
import type { FeedItem } from '@/features/feed/data';
import { buildOrder, redeemDelivery, walletAmounts, withdrawEarnings, type CheckoutDetails, type Order, type Settlement } from './settlement';
export { deliveryFee, orderDeliveryFee } from './settlement';
export type { CheckoutDetails, Order, Fulfillment, PaymentMethod, WalletTransaction, Earning, DeliveryTicket } from './settlement';
export type CheckoutSource = {
    kind: 'cart';
    ids: string[];
} | {
    kind: 'product';
    item: FeedItem;
    quantity: number;
} | {
    kind: 'quote';
    id: string;
};
type Commerce = {
    buyerId: string;
    balanceKobo: number;
    orders: Order[];
    earnings: Settlement['earnings'];
    transactions: Settlement['transactions'];
    walletOwners: {
        id: string;
        name: string;
    }[];
    walletSummary: (id: string) => ReturnType<typeof walletAmounts>;
    addDemoFunds: (amountKobo: number) => void;
    orderForPayment: (id: string) => Order | undefined;
    prepareCheckout: (details: CheckoutDetails, source: CheckoutSource) => {
        rows: {
            item: FeedItem;
            quantity: number;
        }[];
        totalKobo: number;
        fingerprint: string;
    };
    placeOrder: (details: CheckoutDetails, source: CheckoutSource, paymentAttemptId?: string, expectedFingerprint?: string) => Order;
    confirmReceipt: (code: string) => void;
    withdrawDemo: (ownerId: string) => void;
    ready: boolean;
    storageNotice: string;
    issues: Issue[];
    withdrawals: Withdrawal[];
    updateFulfilment: (orderId: string, lineId: string, next: Phase, actorId: string, receipt?: {
        uri: string;
        name: string;
    }) => void;
    openIssue: (orderId: string, lineId: string, kind: Issue['kind'], reason: string, evidence: string[]) => Issue;
    replyIssue: (id: string, action: 'approve' | 'decline' | 'escalate' | 'received', response: string, actorId: string) => void;
    requestPayout: (ownerId: string, bankId: string, amountKobo: number) => Withdrawal;
    resolvePayout: (id: string, ownerId: string, success: boolean) => void;
    purchasedFiles: (orderId: string, lineId: string) => ReturnType<ReturnType<typeof useMarketplace>['accessFiles']>;
};
const Context = createContext<Commerce | null>(null);
const initial = (): Settlement => ({ buyerBalanceKobo: 8500000, orders: [], earnings: [], transactions: [], issues: [], withdrawals: [] });
export function CommerceProvider({ children }: {
    children: ReactNode;
}) {
    const { user } = useAuth();
    const buyerId = user?.id ?? 'demo-buyer';
    const market = useMarketplace();
    const account = useAccount();
    const { cart, catalog, resolveCartItem, removeCartItems } = useFeedState();
    const [state, setState] = useState<Settlement>(initial);
    const current = useRef(state);
    const [loaded, setLoaded] = useState(false);
    const [storageNotice, setStorageNotice] = useState('');
    const activeBuyer = useRef(buyerId);
    const writes = useRef(Promise.resolve());
    const commit = (next: Settlement) => {
        if (!loaded)
            throw new Error('Orders are loading.');
        if (next.orders.length > 200 || next.earnings.length > 10000 || next.transactions.length > 10000)
            throw new Error('The local record limit was reached.');
        restoreSettlement(JSON.stringify(next), buyerId);
        if (activeBuyer.current !== buyerId)
            throw new Error('Account changed. Reopen this action.');
        current.current = next;
        setState(next);
        const data = JSON.stringify(next);
        const writeBuyer = buyerId;
        writes.current = writes.current.catch(() => {
        }).then(async () => {
            if (localStorage)
                await localStorage.setItem('gleenc:orders:v7:' + writeBuyer, data);
        }).catch(() => {
            if (activeBuyer.current === writeBuyer)
                setStorageNotice('Changes could not be saved on this device.');
        });
    };
    useEffect(() => {
        let alive = true;
        activeBuyer.current = buyerId;
        current.current = initial();
        setState(current.current);
        setLoaded(false);
        if (!localStorage) {
            setLoaded(true);
            return () => {
                alive = false;
            };
        }
        localStorage.getItem('gleenc:orders:v7:' + buyerId).then(raw => {
            if (alive && raw) {
                current.current = restoreSettlement(raw, buyerId);
                setState(current.current);
            }
        }).catch(() => {
            if (alive)
                setStorageNotice('Saved orders could not be loaded.');
        }).finally(() => {
            if (alive)
                setLoaded(true);
        });
        return () => {
            alive = false;
        };
    }, [buyerId]);
    const addDemoFunds = (amountKobo: number) => {
        if (!FRONTEND_PREVIEW)
            throw new Error('Live wallet actions require the payment service.');
        if (!loaded)
            throw new Error('Wallet is loading.');
        if (!Number.isSafeInteger(amountKobo) || amountKobo < 10000 || amountKobo > 50000000)
            throw new Error('Choose an amount from ₦100 to ₦500,000.');
        const previous = current.current;
        commit({ ...previous, buyerBalanceKobo: previous.buyerBalanceKobo + amountKobo, transactions: [{ id: 'topup-' + Date.now(), ownerId: buyerId, title: 'Demo wallet top-up', amountKobo, direction: 'in', at: Date.now() }, ...previous.transactions] });
    };
    const prepareCheckout = (details: CheckoutDetails, source: CheckoutSource) => {
        if (activeBuyer.current !== buyerId)
            throw new Error('Account changed. Reopen checkout.');
        if (!loaded || !market.ready)
            throw new Error('Your orders are still loading.');
        if (!source || !['cart', 'product', 'quote'].includes(source.kind))
            throw new Error('Choose a valid checkout source.');
        if (source.kind === 'cart' && (!Array.isArray(source.ids) || !source.ids.length || source.ids.length > 100 || new Set(source.ids).size !== source.ids.length || source.ids.some(id => typeof id !== 'string' || id.length > 200)))
            throw new Error('Choose valid cart items.');
        const q = source.kind === 'quote' ? market.quotes.find(q => q.id === source.id) : undefined;
        const canonical = source.kind === 'product' ? catalog.find(item => item.id === source.item.id) : undefined;
        const selected = source.kind === 'quote' && q ? [{ item: market.checkoutQuote(q.id), quantity: q.quantity }]
            : source.kind === 'cart' ? cart.filter(row => source.ids.includes(row.item.id)) : canonical && source.kind === 'product' ? [{ item: canonical, quantity: source.quantity }] : [];
        if (source.kind === 'cart')
            for (const row of selected) {
                const currentItem = resolveCartItem(row.item, row.quantity);
                if (currentItem.stock < row.quantity)
                    throw new Error('This product is no longer available in the selected quantity.');
                if (currentItem.priceKobo !== row.item.priceKobo || currentItem.priceVersion !== row.item.priceVersion)
                    throw new Error('The seller updated this product. Review and update its price in your bag before checkout.');
            }
        if (q) {
            const liveItem = resolveCartItem(q.item, q.quantity);
            if (!liveItem.stock || liveItem.stock < q.quantity)
                throw new Error('This accepted offer is no longer in stock.');
        }
        if (source.kind === 'cart' && selected.length !== source.ids.length)
            throw new Error('A selected cart item is no longer available.');
        let sequence = 0;
        const { order } = buildOrder(details, selected, buyerId, 'ESTIMATE', () => String(++sequence));
        return { rows: clone(selected), totalKobo: order.totalKobo, fingerprint: checkoutFingerprint(details, selected) };
    };
    const placeOrder = (details: CheckoutDetails, source: CheckoutSource, paymentAttemptId?: string, expectedFingerprint?: string): Order => {
        if (!FRONTEND_PREVIEW)
            throw new Error('Live checkout will be enabled with the payment service.');
        if (!loaded || !market.ready)
            throw new Error('Your orders are still loading.');
        if (activeBuyer.current !== buyerId)
            throw new Error('Account changed. Reopen checkout.');
        if (paymentAttemptId) {
            if (!/^PAY-[A-F0-9]{32}$/.test(paymentAttemptId))
                throw new Error('Invalid payment reference.');
            const existing = current.current.orders.find(o => o.paymentAttemptId === paymentAttemptId && o.buyerId === buyerId);
            if (existing)
                return existing;
        }
        const prepared = prepareCheckout(details, source);
        if (expectedFingerprint && prepared.fingerprint !== expectedFingerprint)
            throw new Error('Your order changed. Return to checkout to review its updated details and price.');
        const selected = prepared.rows;
        const id = secureId('GL');
        const { order, earnings } = buildOrder(details, selected, buyerId, id, () => secureId('TOKEN').replace('TOKEN-', ''));
        if (paymentAttemptId)
            order.paymentAttemptId = paymentAttemptId;
        const previous = current.current;
        if (details.paymentMethod === 'wallet' && previous.buyerBalanceKobo < order.totalKobo)
            throw new Error('Your demo balance is too low. Add funds or choose another method.');
        const next: Settlement = { ...previous, buyerBalanceKobo: previous.buyerBalanceKobo - (details.paymentMethod === 'wallet' ? order.totalKobo : 0), orders: [order, ...previous.orders], earnings: [...earnings, ...previous.earnings], transactions: [{ id, ownerId: buyerId, title: details.paymentMethod === 'wallet' ? 'Order payment · funds held' : 'Demo payment · ' + details.paymentMethod, amountKobo: order.totalKobo, direction: 'out', at: order.placedAt }, ...previous.transactions] };
        restoreSettlement(JSON.stringify(next), buyerId);
        market.consumePurchase(selected, source.kind === 'quote' ? source.id : undefined);
        commit(next);
        if (source.kind === 'cart')
            removeCartItems(selected.map(row => row.item.id));
        return order;
    };
    const confirmReceipt = (code: string) => {
        if (!FRONTEND_PREVIEW)
            throw new Error('Live delivery confirmation requires the order service.');
        if (!loaded)
            throw new Error('Orders are loading.');
        commit(redeemDelivery(current.current, code, buyerId));
    };
    const withdrawDemo = (ownerId: string) => {
        if (!FRONTEND_PREVIEW)
            throw new Error('Live wallet actions require the payment service.');
        if (!loaded)
            throw new Error('Wallet is loading.');
        if (!FRONTEND_PREVIEW && ownerId !== buyerId)
            throw new Error('This wallet belongs to another account.');
        commit(withdrawEarnings(current.current, ownerId));
    };
    function actor(id: string) {
        if (!loaded || activeBuyer.current !== buyerId)
            throw new Error('Orders are unavailable.');
        if (!FRONTEND_PREVIEW && id !== buyerId)
            throw new Error('Account ownership mismatch.');
    }
    function updateFulfilment(orderId: string, lineId: string, next: Phase, actorId: string, receipt?: {
        uri: string;
        name: string;
    }) {
        actor(actorId);
        commit(advanceLine(current.current, orderId, lineId, actorId, next, receipt));
    }
    function openIssue(orderId: string, lineId: string, kind: Issue['kind'], reason: string, evidence: string[]) {
        actor(buyerId);
        const row = current.current.orders.find(o => o.id === orderId)?.items.find(r => r.lineId === lineId);
        if (!row)
            throw new Error('Order unavailable.');
        const issue: Issue = { id: secureId('ISSUE'), orderId, lineId, buyerId, sellerId: originalSeller(row), kind, reason, evidence, status: 'requested', response: '', createdAt: Date.now(), updatedAt: Date.now() };
        commit(requestIssue(current.current, issue, buyerId));
        return issue;
    }
    function replyIssue(id: string, action: 'approve' | 'decline' | 'escalate' | 'received', response: string, actorId: string) {
        actor(actorId);
        const before = current.current, issue = before.issues?.find(i => i.id === id), row = before.orders.find(o => o.id === issue?.orderId)?.items.find(r => r.lineId === issue?.lineId);
        const next = respondIssue(before, id, actorId, action, response);
        commit(next);
        if (action === 'approve' && issue?.kind === 'cancellation' && row && next.issues?.find(i => i.id === id)?.status === 'refunded')
            market.restoreInventory(row);
    }
    function requestPayout(ownerId: string, bankId: string, amountKobo: number) {
        actor(ownerId);
        if (!FRONTEND_PREVIEW)
            throw new Error('Live withdrawals require the payout service.');
        const bank = account.banks.find(b => b.id === bankId && b.ownerId === account.ownerId);
        if (!bank)
            throw new Error('Select your saved bank account.');
        const request: Withdrawal = { id: secureId('PAYOUT'), ownerId, bankId, bank: bank.bank, last4: bank.last4, amountKobo, feeKobo: 0, earningIds: [], status: 'pending', createdAt: Date.now() };
        const next = requestWithdrawal(current.current, request);
        commit(next);
        return next.withdrawals![0];
    }
    function resolvePayout(id: string, ownerId: string, success: boolean) {
        actor(ownerId);
        if (!FRONTEND_PREVIEW)
            throw new Error('Only the payout service can resolve a transfer.');
        commit(completeWithdrawal(current.current, id, ownerId, success));
    }
    function purchasedFiles(orderId: string, lineId: string) {
        actor(buyerId);
        const order = current.current.orders.find(o => o.id === orderId && o.buyerId === buyerId), row = order?.items.find(r => r.lineId === lineId);
        if (!row || row.item.productType !== 'digital' || !row.item.digital || row.tickets.some(t => t.status !== 'confirmed'))
            throw new Error('This purchase does not grant digital access.');
        return market.accessFiles(row.item.digital.files.map(f => f.id), originalSeller(row));
    }
    const walletOwners = [{ id: buyerId, name: 'Buyer wallet' }, ...Array.from(new Map(state.earnings.map(value => [value.ownerId, { id: value.ownerId, name: value.ownerName }])).values()).filter(value => value.id !== buyerId)];
    return <Context.Provider value={{ ready: loaded, storageNotice, issues: state.issues ?? [], withdrawals: state.withdrawals ?? [], updateFulfilment, openIssue, replyIssue, requestPayout, resolvePayout, purchasedFiles, buyerId, balanceKobo: state.buyerBalanceKobo, orders: state.orders, earnings: state.earnings, transactions: state.transactions, walletOwners, walletSummary: id => walletAmounts(state, id), addDemoFunds, orderForPayment: id => {
                if (activeBuyer.current !== buyerId)
                    throw new Error('Account changed. Reopen payment.');
                return current.current.orders.find(o => o.paymentAttemptId === id && o.buyerId === buyerId);
            }, prepareCheckout, placeOrder, confirmReceipt, withdrawDemo }}>{children}</Context.Provider>;
}
export function useCommerce() {
    const value = useContext(Context);
    if (!value)
        throw new Error('CommerceProvider is missing');
    return value;
}
