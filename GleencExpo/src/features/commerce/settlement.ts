import type { Entry } from '@/features/feed/feed-state';
import { clone, required } from '@/features/account/guards';
import { integer, money, text, uri } from '@/features/marketplace/domain';
export type Fulfillment = 'delivery' | 'pickup';
export type PaymentMethod = 'wallet' | 'card' | 'transfer';
export type CheckoutDetails = {
    recipient: string;
    phone: string;
    address: string;
    note: string;
    fulfillment: Fulfillment;
    paymentMethod: PaymentMethod;
};
export type DeliveryTicket = {
    id: string;
    code: string;
    unit: number;
    buyerId: string;
    status: 'awaiting' | 'confirmed' | 'refunded';
    confirmedAt?: number;
};
export type Phase = 'Placed' | 'Preparing' | 'Dispatched' | 'Awaiting confirmation' | 'Delivered' | 'Refunded';
export type OrderItem = Entry & {
    lineId: string;
    tickets: DeliveryTicket[];
    phase?: Phase;
    receipt?: {
        uri: string;
        name: string;
    };
    events?: {
        at: number;
        title: string;
        actorId: string;
    }[];
};
export type Order = CheckoutDetails & {
    paymentAttemptId?: string;
    id: string;
    buyerId: string;
    items: OrderItem[];
    subtotalKobo: number;
    deliveryKobo: number;
    totalKobo: number;
    placedAt: number;
    status: 'Placed' | 'Partially delivered' | 'Delivered' | 'Partially refunded' | 'Refunded';
};
export type Earning = {
    id: string;
    orderId: string;
    ticketId: string;
    ownerId: string;
    ownerName: string;
    kind: 'sale' | 'commission' | 'delivery';
    amountKobo: number;
    status: 'pending' | 'available' | 'withdrawn' | 'refunded';
};
export type WalletTransaction = {
    id: string;
    ownerId: string;
    title: string;
    amountKobo: number;
    at: number;
    direction: 'in' | 'out';
};
export type Issue = {
    id: string;
    orderId: string;
    lineId: string;
    buyerId: string;
    sellerId: string;
    kind: 'cancellation' | 'return' | 'refund' | 'dispute';
    reason: string;
    evidence: string[];
    status: 'requested' | 'return-approved' | 'escalated' | 'declined' | 'refunded' | 'closed';
    response: string;
    createdAt: number;
    updatedAt: number;
    refundKobo?: number;
};
export type Withdrawal = {
    id: string;
    ownerId: string;
    bankId: string;
    bank: string;
    last4: string;
    amountKobo: number;
    feeKobo: number;
    earningIds: string[];
    status: 'pending' | 'completed' | 'failed';
    createdAt: number;
};
export type Settlement = {
    orders: Order[];
    earnings: Earning[];
    transactions: WalletTransaction[];
    buyerBalanceKobo: number;
    issues?: Issue[];
    withdrawals?: Withdrawal[];
};
export const deliveryFee = (method: Fulfillment) => method === 'delivery' ? 120000 : 0;
export const sellerId = (name: string) => 'seller:' + name;
export const originalSeller = (row: Entry) => row.item.sellerId ?? sellerId(row.item.store);
export function orderDeliveryFee(method: Fulfillment, entries: Entry[]) {
    if (method !== 'delivery')
        return 0;
    const fees = new Map<string, number>();
    for (const row of entries.filter(r => r.item.productType !== 'digital')) {
        const fee = row.item.shipping?.localFeeKobo ?? 120000;
        money(fee);
        fees.set(originalSeller(row), Math.max(fees.get(originalSeller(row)) ?? 0, fee));
    }
    return money([...fees.values()].reduce((a, b) => a + b, 0));
}
export function summarizeOrder(items: OrderItem[]): Order['status'] {
    const tickets = items.flatMap(r => r.tickets);
    if (tickets.every(t => t.status === 'refunded'))
        return 'Refunded';
    if (tickets.some(t => t.status === 'refunded'))
        return 'Partially refunded';
    if (tickets.every(t => t.status === 'confirmed'))
        return 'Delivered';
    return tickets.some(t => t.status === 'confirmed') ? 'Partially delivered' : 'Placed';
}
export function activeIssue(state: Settlement, lineId: string) {
    return (state.issues ?? []).find(i => i.lineId === lineId && ['requested', 'return-approved', 'escalated'].includes(i.status));
}
export function buildOrder(details: CheckoutDetails, entries: Entry[], buyerId: string, id: string, token: () => string) {
    if (!entries.length || entries.length > 100)
        throw new Error('Select 1–100 products.');
    if (!['delivery', 'pickup'].includes(details.fulfillment) || !['wallet', 'card', 'transfer'].includes(details.paymentMethod))
        throw new Error('Invalid checkout options.');
    required(details.recipient, 'the recipient', 80);
    if (!/^\+?[0-9\s()-]{7,20}$/.test(details.phone.trim()))
        throw new Error('Enter a valid phone number.');
    text(details.address, 500);
    text(details.note, 500);
    const physical = entries.filter(r => r.item.productType !== 'digital');
    if (physical.length && details.fulfillment === 'delivery' && !details.address.trim())
        throw new Error('Enter a delivery address.');
    for (const row of entries) {
        integer(row.quantity, 1, row.item.stock, 'quantity');
        money(row.item.priceKobo, false);
        if (row.item.listingStatus && row.item.listingStatus !== 'active' || row.item.plan?.takingOrders === false)
            throw new Error('This listing is not taking orders.');
        if (row.item.productType === 'digital' && row.quantity !== 1)
            throw new Error('Buy one licence at a time.');
        const shipping = row.item.shipping;
        if (shipping && !(details.fulfillment === 'pickup' ? shipping.pickup : shipping.delivery || shipping.interstate))
            throw new Error(row.item.name + ' does not support this fulfilment method.');
        if (row.item.offer) {
            const { basePriceKobo, commissionKobo } = row.item.offer;
            money(basePriceKobo, false);
            money(commissionKobo);
            if (basePriceKobo + commissionKobo !== row.item.priceKobo)
                throw new Error('Invalid reshare price.');
        }
        if (row.item.offer?.promoterId === buyerId)
            throw new Error('Use the original listing to purchase your own reshare.');
    }
    if (entries.reduce((n, r) => n + r.quantity, 0) > 1000)
        throw new Error('Reduce this order to 1,000 units.');
    const items: OrderItem[] = entries.map((row, index) => {
        const lineId = id + '-L' + (index + 1), digital = row.item.productType === 'digital';
        return { ...clone(row), lineId, phase: digital ? 'Delivered' : 'Placed', events: [{ at: Date.now(), title: digital ? 'Digital access unlocked' : 'Order placed', actorId: buyerId }], tickets: Array.from({ length: row.quantity }, (_, unit) => ({ id: lineId + '-U' + (unit + 1), code: 'GLC:' + id + ':' + (index + 1) + ':' + (unit + 1) + ':' + token().toUpperCase(), unit: unit + 1, buyerId, status: digital ? 'confirmed' : 'awaiting', ...(digital ? { confirmedAt: Date.now() } : {}) })) };
    });
    const subtotalKobo = money(items.reduce((n, r) => n + r.item.priceKobo * r.quantity, 0), false), deliveryKobo = orderDeliveryFee(details.fulfillment, entries);
    const order: Order = { ...details, recipient: details.recipient.trim(), phone: details.phone.trim(), address: physical.length ? details.address.trim() : '', note: details.note.trim(), id, buyerId, items, subtotalKobo, deliveryKobo, totalKobo: money(subtotalKobo + deliveryKobo, false), placedAt: Date.now(), status: summarizeOrder(items) };
    const earnings: Earning[] = [];
    const sellerUnits = new Map<string, number>(), sellerFees = new Map<string, number>(), shippingIndexes = new Map<string, number>();
    for (const row of physical) {
        const seller = originalSeller(row);
        sellerUnits.set(seller, (sellerUnits.get(seller) ?? 0) + row.quantity);
        sellerFees.set(seller, details.fulfillment === 'delivery' ? Math.max(sellerFees.get(seller) ?? 0, row.item.shipping?.localFeeKobo ?? 120000) : 0);
    }
    for (const row of items)
        for (const ticket of row.tickets) {
            const add = (kind: Earning['kind'], amountKobo: number, ownerId: string, ownerName: string) => {
                if (amountKobo > 0)
                    earnings.push({ id: ticket.id + '-' + kind, orderId: id, ticketId: ticket.id, ownerId, ownerName, kind, amountKobo, status: ticket.status === 'confirmed' ? 'available' : 'pending' });
            };
            add('sale', row.item.offer?.basePriceKobo ?? row.item.priceKobo, originalSeller(row), row.item.store);
            if (row.item.offer)
                add('commission', row.item.offer.commissionKobo, row.item.offer.promoterId, row.item.offer.promoterName + ' · resharer');
            if (row.item.productType !== 'digital') {
                const seller = originalSeller(row), fee = sellerFees.get(seller) ?? 0, units = sellerUnits.get(seller) ?? 1, index = shippingIndexes.get(seller) ?? 0;
                add('delivery', Math.floor(fee / units) + Number(index < fee % units), seller, row.item.store);
                shippingIndexes.set(seller, index + 1);
            }
        }
    return { order, earnings };
}
export function redeemDelivery(state: Settlement, code: string, actorId: string, at = Date.now()): Settlement {
    const clean = required(code, 'a delivery code', 300).toUpperCase();
    const order = state.orders.find(o => o.items.some(r => r.tickets.some(t => t.code === clean))), row = order?.items.find(r => r.tickets.some(t => t.code === clean)), ticket = row?.tickets.find(t => t.code === clean);
    if (!order || !row || !ticket)
        throw new Error('Delivery code not found.');
    if (ticket.buyerId !== actorId || order.buyerId !== actorId)
        throw new Error('Only the purchasing buyer can confirm receipt.');
    if (row.item.productType === 'digital')
        throw new Error('Digital purchases do not use delivery codes.');
    if (ticket.status !== 'awaiting')
        throw new Error('This delivery code has already been used or refunded.');
    if (activeIssue(state, row.lineId))
        throw new Error('Resolve the open issue before confirming delivery.');
    const updatedItems = order.items.map(r => {
        if (r.lineId !== row.lineId)
            return r;
        const tickets = r.tickets.map(t => t.id === ticket.id ? { ...t, status: 'confirmed' as const, confirmedAt: at } : t);
        return { ...r, tickets, phase: tickets.every(t => t.status === 'confirmed') ? 'Delivered' as const : r.phase, events: [...(r.events ?? []), { at, title: 'Unit ' + ticket.unit + ' received', actorId }] };
    });
    const released = state.earnings.filter(e => e.ticketId === ticket.id && e.status === 'pending');
    return { ...state, orders: state.orders.map(o => o.id === order.id ? { ...o, items: updatedItems, status: summarizeOrder(updatedItems) } : o), earnings: state.earnings.map(e => e.ticketId === ticket.id && e.status === 'pending' ? { ...e, status: 'available' } : e), transactions: [...released.map(e => ({ id: 'release-' + e.id, ownerId: e.ownerId, title: e.kind === 'commission' ? 'Reshare commission released' : 'Sale earnings released', amountKobo: e.amountKobo, at, direction: 'in' as const })), ...state.transactions] };
}
export function advanceLine(state: Settlement, orderId: string, lineId: string, actorId: string, next: Phase, receipt?: {
    uri: string;
    name: string;
}, at = Date.now()): Settlement {
    const order = state.orders.find(o => o.id === orderId), row = order?.items.find(r => r.lineId === lineId);
    if (!order || !row || originalSeller(row) !== actorId)
        throw new Error('Only the original seller can update this order.');
    if (row.item.productType === 'digital' || activeIssue(state, lineId) || row.tickets.every(t => t.status !== 'awaiting'))
        throw new Error('This order cannot be advanced.');
    const allowed: Partial<Record<Phase, Phase>> = { 'Placed': 'Preparing', 'Preparing': order.fulfillment === 'pickup' ? 'Awaiting confirmation' : 'Dispatched', 'Dispatched': 'Awaiting confirmation' };
    if (allowed[row.phase ?? 'Placed'] !== next)
        throw new Error('Invalid fulfilment transition.');
    if (receipt) {
        uri(receipt.uri);
        required(receipt.name, 'receipt name', 150);
    }
    return { ...state, orders: state.orders.map(o => o.id === orderId ? { ...o, items: o.items.map(r => r.lineId === lineId ? { ...r, phase: next, receipt: receipt ?? r.receipt, events: [...(r.events ?? []), { at, title: next, actorId }] } : r) } : o) };
}
export function requestIssue(state: Settlement, issue: Issue, actorId: string): Settlement {
    const order = state.orders.find(o => o.id === issue.orderId), row = order?.items.find(r => r.lineId === issue.lineId);
    if (!order || !row || order.buyerId !== actorId || issue.buyerId !== actorId || issue.sellerId !== originalSeller(row))
        throw new Error('Issue ownership mismatch.');
    if (!['cancellation', 'return', 'refund', 'dispute'].includes(issue.kind))
        throw new Error('Invalid issue type.');
    if (activeIssue(state, row.lineId))
        throw new Error('An issue is already open for this product.');
    if (row.tickets.some(t => t.status === 'refunded'))
        throw new Error('This product has already been refunded.');
    if (issue.kind === 'cancellation' && (row.item.productType === 'digital' || !['Placed', 'Preparing'].includes(row.phase ?? 'Placed') || row.tickets.some(t => t.status === 'confirmed')))
        throw new Error('This product is past the cancellation stage.');
    if (issue.kind === 'return' && (row.item.productType === 'digital' || !row.tickets.every(t => t.status === 'confirmed')))
        throw new Error('Returns require a received physical product.');
    if (issue.kind === 'return' && Date.now() - Math.max(...row.tickets.map(t => t.confirmedAt ?? 0)) > 7 * 86400000)
        throw new Error('The local seven-day return window has ended.');
    required(issue.reason, 'the reason', 1000);
    if (issue.evidence.length > 4)
        throw new Error('Attach at most four evidence photos.');
    issue.evidence.forEach(uri);
    if ((state.issues ?? []).some(i => i.id === issue.id))
        throw new Error('Issue already submitted.');
    let next: Settlement = { ...state, issues: [clone(issue), ...(state.issues ?? [])] };
    const tickets = new Set(row.tickets.map(t => t.id));
    for (const withdrawal of next.withdrawals ?? []) {
        if (withdrawal.status === 'pending' && next.earnings.some(e => tickets.has(e.ticketId) && withdrawal.earningIds.includes(e.id)))
            next = completeWithdrawal(next, withdrawal.id, withdrawal.ownerId, false);
    }
    return next;
}
export function respondIssue(state: Settlement, id: string, actorId: string, action: 'approve' | 'decline' | 'escalate' | 'received', response: string, at = Date.now()): Settlement {
    const issue = (state.issues ?? []).find(i => i.id === id), order = state.orders.find(o => o.id === issue?.orderId), row = order?.items.find(r => r.lineId === issue?.lineId);
    if (!issue || !order || !row || !['requested', 'return-approved', 'escalated'].includes(issue.status))
        throw new Error('Issue is closed or unavailable.');
    if (action === 'escalate') {
        if (actorId !== issue.buyerId || issue.status !== 'requested')
            throw new Error('Only the buyer can escalate a requested issue.');
        return { ...state, issues: state.issues?.map(i => i.id === id ? { ...i, status: 'escalated', updatedAt: at } : i) };
    }
    if (actorId !== issue.sellerId)
        throw new Error('Only the original seller can respond.');
    if (!['approve', 'decline', 'received'].includes(action))
        throw new Error('Invalid issue action.');
    if (action === 'decline')
        return { ...state, issues: state.issues?.map(i => i.id === id ? { ...i, status: 'declined', response: required(response, 'a response', 1000), updatedAt: at } : i) };
    if (issue.kind === 'return' && issue.status !== 'return-approved') {
        if (action !== 'approve')
            throw new Error('Approve the return before confirming receipt.');
        return { ...state, issues: state.issues?.map(i => i.id === id ? { ...i, status: 'return-approved', response: text(response, 1000), updatedAt: at } : i) };
    }
    if (issue.kind === 'return' && action !== 'received')
        throw new Error('Confirm the returned product was received.');
    const ids = row.tickets.map(t => t.id), earnings = state.earnings.filter(e => ids.includes(e.ticketId));
    if (earnings.some(e => e.status === 'withdrawn'))
        throw new Error('Funds were already withdrawn. This issue needs support resolution.');
    const refundKobo = money(earnings.reduce((n, e) => n + (e.status !== 'refunded' ? e.amountKobo : 0), 0), false);
    const items = order.items.map(r => r.lineId === row.lineId ? { ...r, phase: 'Refunded' as const, tickets: r.tickets.map(t => ({ ...t, status: 'refunded' as const })), events: [...(r.events ?? []), { at, title: 'Refund credited', actorId }] } : r);
    return { ...state, buyerBalanceKobo: money(state.buyerBalanceKobo + refundKobo), orders: state.orders.map(o => o.id === order.id ? { ...o, items, status: summarizeOrder(items) } : o), earnings: state.earnings.map(e => ids.includes(e.ticketId) ? { ...e, status: 'refunded' } : e), issues: state.issues?.map(i => i.id === id ? { ...i, status: 'refunded', response: text(response, 1000), refundKobo, updatedAt: at } : i), transactions: [{ id: 'refund-' + id, ownerId: issue.buyerId, title: 'Refund credited to wallet', amountKobo: refundKobo, at, direction: 'in' }, ...state.transactions] };
}
export function walletAmounts(state: Settlement, ownerId: string) {
    const own = state.earnings.filter(e => e.ownerId === ownerId), locked = new Set(state.orders.flatMap(o => o.items.filter(r => activeIssue(state, r.lineId)).flatMap(r => r.tickets.map(t => t.id))));
    return { pendingKobo: own.filter(e => e.status === 'pending').reduce((n, e) => n + e.amountKobo, 0), availableKobo: own.filter(e => e.status === 'available' && !locked.has(e.ticketId)).reduce((n, e) => n + e.amountKobo, 0), withdrawnKobo: own.filter(e => e.status === 'withdrawn').reduce((n, e) => n + e.amountKobo, 0), heldKobo: own.filter(e => e.status === 'available' && locked.has(e.ticketId)).reduce((n, e) => n + e.amountKobo, 0) };
}
export function requestWithdrawal(state: Settlement, request: Withdrawal): Settlement {
    money(request.amountKobo, false);
    money(request.feeKobo);
    const total = request.amountKobo + request.feeKobo;
    if (walletAmounts(state, request.ownerId).availableKobo < total)
        throw new Error('Insufficient released earnings.');
    if ((state.withdrawals ?? []).some(w => w.id === request.id))
        throw new Error('Withdrawal already submitted.');
    const locked = new Set(state.orders.flatMap(o => o.items.filter(r => activeIssue(state, r.lineId)).flatMap(r => r.tickets.map(t => t.id))));
    let remaining = total;
    const reserved: string[] = [];
    const earnings: Earning[] = [];
    for (const e of state.earnings) {
        if (remaining && e.ownerId === request.ownerId && e.status === 'available' && !locked.has(e.ticketId)) {
            const amount = Math.min(remaining, e.amountKobo), id = e.id + '~' + request.id;
            earnings.push({ ...e, id, amountKobo: amount, status: 'withdrawn' });
            reserved.push(id);
            if (e.amountKobo > amount)
                earnings.push({ ...e, amountKobo: e.amountKobo - amount });
            remaining -= amount;
        }
        else
            earnings.push(e);
    }
    if (remaining)
        throw new Error('Withdrawal could not reserve the balance.');
    return { ...state, earnings, withdrawals: [{ ...request, earningIds: reserved, status: 'pending' }, ...(state.withdrawals ?? [])] };
}
export function completeWithdrawal(state: Settlement, id: string, ownerId: string, success: boolean, at = Date.now()): Settlement {
    const w = state.withdrawals?.find(w => w.id === id);
    if (!w || w.ownerId !== ownerId || w.status !== 'pending')
        throw new Error('Withdrawal unavailable or already processed.');
    if (success) {
        const held = new Set(state.orders.flatMap(o => o.items.filter(r => activeIssue(state, r.lineId)).flatMap(r => r.tickets.map(t => t.id))));
        if (state.earnings.some(e => w.earningIds.includes(e.id) && held.has(e.ticketId)))
            throw new Error('These payout funds are held for an open order issue.');
    }
    return { ...state, withdrawals: state.withdrawals?.map(v => v.id === id ? { ...v, status: success ? 'completed' : 'failed' } : v), earnings: success ? state.earnings : state.earnings.map(e => w.earningIds.includes(e.id) ? { ...e, status: 'available' } : e), transactions: success ? [{ id: 'withdraw-' + id, ownerId, title: 'Withdrawal completed', amountKobo: w.amountKobo + w.feeKobo, at, direction: 'out' }, ...state.transactions] : state.transactions };
}
export function withdrawEarnings(state: Settlement, ownerId: string, at = Date.now()): Settlement {
    const { availableKobo } = walletAmounts(state, ownerId);
    if (!availableKobo)
        throw new Error('There are no released earnings.');
    const req: Withdrawal = { id: 'legacy-' + at, ownerId, bankId: 'legacy', bank: 'Demo', last4: '0000', amountKobo: availableKobo, feeKobo: 0, earningIds: [], status: 'pending', createdAt: at };
    return completeWithdrawal(requestWithdrawal(state, req), req.id, ownerId, true, at);
}
