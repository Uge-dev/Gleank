import { originalSeller, summarizeOrder } from './settlement';
import { validateDigital } from '@/features/digital/files';
import { text, uri, integer } from '@/features/marketplace/domain';
import { money, validatePlan } from '@/features/marketplace/domain';
import type { Settlement } from './settlement';
export type Storage = {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, data: string) => Promise<void>;
};
export let localStorage: Storage | null = null;
try {
    localStorage = require('@react-native-async-storage/async-storage').default;
}
catch {
}
/** These are local demo records, never proof of payment or server authorization. */
export function restoreSettlement(raw: string, buyerId: string): Settlement {
    if (raw.length > 3000000)
        throw new Error('Saved orders exceed the local limit.');
    const s: Settlement = JSON.parse(raw);
    money(s.buyerBalanceKobo);
    if (!Array.isArray(s.orders) || !Array.isArray(s.earnings) || !Array.isArray(s.transactions) || s.orders.length > 200 || s.earnings.length > 10000 || s.transactions.length > 10000)
        throw new Error('Invalid saved orders.');
    const payments = new Set<string>();
    const ticketIds = new Set<string>(), codes = new Set<string>(), earningIds = new Set<string>();
    for (const o of s.orders) {
        if (o.buyerId !== buyerId || !Array.isArray(o.items) || !o.items.length || o.items.length > 1000)
            throw new Error('Order ownership mismatch.');
        text(o.id);
        if (o.paymentAttemptId) {
            if (!/^PAY-[A-F0-9]{32}$/.test(o.paymentAttemptId) || payments.has(o.paymentAttemptId))
                throw new Error('Invalid or duplicate payment reference.');
            payments.add(o.paymentAttemptId);
        }
        text(o.recipient, 80);
        text(o.phone, 25);
        text(o.address, 500);
        text(o.note, 500);
        if (!['Placed', 'Partially delivered', 'Delivered', 'Partially refunded', 'Refunded'].includes(o.status) || !['wallet', 'card', 'transfer'].includes(o.paymentMethod) || !['pickup', 'delivery'].includes(o.fulfillment))
            throw new Error('Invalid order state.');
        money(o.totalKobo, false);
        money(o.subtotalKobo, false);
        money(o.deliveryKobo);
        if (o.totalKobo !== o.subtotalKobo + o.deliveryKobo)
            throw new Error('Order total mismatch.');
        let total = 0;
        for (const row of o.items) {
            if (row.item.digital)
                validateDigital(row.item.digital);
            text(row.lineId);
            if (row.phase && !['Placed', 'Preparing', 'Dispatched', 'Awaiting confirmation', 'Delivered', 'Refunded'].includes(row.phase))
                throw new Error('Invalid fulfilment state.');
            if (row.receipt) {
                uri(row.receipt.uri);
                text(row.receipt.name, 150);
            }
            if (row.events) {
                if (!Array.isArray(row.events) || row.events.length > 1020)
                    throw new Error('Invalid order history.');
                for (const ev of row.events) {
                    text(ev.title);
                    text(ev.actorId);
                    integer(ev.at, 1, Number.MAX_SAFE_INTEGER, 'event time');
                }
            }
            money(row.item.priceKobo, false);
            if (!Number.isSafeInteger(row.quantity) || row.quantity < 1 || row.quantity > 1000 || row.tickets.length !== row.quantity)
                throw new Error('Invalid order quantity.');
            if (row.item.plan)
                validatePlan(row.item.plan);
            total += row.item.priceKobo * row.quantity;
            for (const ticket of row.tickets) {
                if (ticket.buyerId !== buyerId || ticketIds.has(ticket.id) || codes.has(ticket.code) || !/^GLC:[A-Z0-9:-]+$/.test(ticket.code) || !['awaiting', 'confirmed', 'refunded'].includes(ticket.status))
                    throw new Error('Invalid delivery label.');
                ticketIds.add(ticket.id);
                codes.add(ticket.code);
            }
        }
        if (o.status !== summarizeOrder(o.items))
            throw new Error('Order status does not match its units.');
        if (total !== o.subtotalKobo)
            throw new Error('Subtotal mismatch.');
    }
    for (const e of s.earnings) {
        money(e.amountKobo, false);
        if (!ticketIds.has(e.ticketId) || earningIds.has(e.id) || !['pending', 'available', 'withdrawn', 'refunded'].includes(e.status))
            throw new Error('Invalid saved earning.');
        const sourceOrder = s.orders.find(o => o.id === e.orderId), sourceRow = sourceOrder?.items.find(r => r.tickets.some(t => t.id === e.ticketId));
        if (!sourceRow || !['sale', 'commission', 'delivery'].includes(e.kind) || (e.kind === 'commission' ? e.ownerId !== sourceRow.item.offer?.promoterId : e.ownerId !== originalSeller(sourceRow)))
            throw new Error('Earning ownership mismatch.');
        const ticket = s.orders.flatMap(o => o.items).flatMap(r => r.tickets).find(t => t.id === e.ticketId);
        if ((e.status === 'pending') !== (ticket?.status === 'awaiting') || (e.status === 'refunded') !== (ticket?.status === 'refunded'))
            throw new Error('Delivery and earning status mismatch.');
        earningIds.add(e.id);
    }
    for (const order of s.orders) {
        for (const row of order.items)
            for (const ticket of row.tickets) {
                const own = s.earnings.filter(e => e.ticketId === ticket.id);
                if (own.filter(e => e.kind === 'sale').reduce((n, e) => n + e.amountKobo, 0) !== (row.item.offer?.basePriceKobo ?? row.item.priceKobo) || own.filter(e => e.kind === 'commission').reduce((n, e) => n + e.amountKobo, 0) !== (row.item.offer?.commissionKobo ?? 0))
                    throw new Error('Ticket proceeds mismatch.');
            }
        if (s.earnings.filter(e => e.orderId === order.id).reduce((n, e) => n + e.amountKobo, 0) !== order.totalKobo)
            throw new Error('Earnings allocation mismatch.');
    }
    for (const t of s.transactions) {
        text(t.id);
        text(t.ownerId);
        text(t.title);
        if (!['in', 'out'].includes(t.direction))
            throw new Error('Invalid wallet transaction.');
        money(t.amountKobo);
    }
    s.issues = s.issues ?? [];
    s.withdrawals = s.withdrawals ?? [];
    if (!Array.isArray(s.issues) || s.issues.length > 500 || !Array.isArray(s.withdrawals) || s.withdrawals.length > 500)
        throw new Error('Invalid commerce history.');
    for (const i of s.issues) {
        const order = s.orders.find(o => o.id === i.orderId), row = order?.items.find(r => r.lineId === i.lineId);
        if (!row || i.buyerId !== buyerId || i.sellerId !== (row.item.sellerId ?? 'seller:' + row.item.store) || !['cancellation', 'return', 'refund', 'dispute'].includes(i.kind) || !['requested', 'return-approved', 'escalated', 'declined', 'refunded', 'closed'].includes(i.status))
            throw new Error('Invalid issue ownership or state.');
        text(i.reason, 1000);
        text(i.response, 1000);
        if (!Array.isArray(i.evidence) || i.evidence.length > 4)
            throw new Error('Invalid issue evidence.');
        i.evidence.forEach(uri);
    }
    for (const w of s.withdrawals) {
        money(w.amountKobo, false);
        money(w.feeKobo);
        text(w.ownerId);
        if (!/^\d{4}$/.test(w.last4) || !['pending', 'completed', 'failed'].includes(w.status) || !Array.isArray(w.earningIds) || w.earningIds.length > 10000)
            throw new Error('Invalid withdrawal history.');
        const reserved = s.earnings.filter(e => w.earningIds.includes(e.id));
        if (w.status !== 'failed' && (reserved.length !== w.earningIds.length || reserved.some(e => e.ownerId !== w.ownerId) || reserved.some(e => e.status !== 'withdrawn') || reserved.reduce((n, e) => n + e.amountKobo, 0) !== w.amountKobo + w.feeKobo))
            throw new Error('Invalid withdrawal allocation.');
    }
    if (new Set(s.orders.map(o => o.id)).size !== s.orders.length || new Set(s.issues.map(i => i.id)).size !== s.issues.length || new Set(s.withdrawals.map(w => w.id)).size !== s.withdrawals.length)
        throw new Error('Duplicate commerce record.');
    return s;
}
