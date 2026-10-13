import type { FeedItem } from '@/features/feed/data';
import type { Earning, Issue, Order } from './settlement';
import type { Activity } from '@/features/community/domain';
export function reshareAnalytics(ownerId: string, offers: FeedItem[], orders: Order[], earnings: Earning[], issues: Issue[], activity: Activity[], since = 0) {
    const rows = orders.filter(o => o.placedAt >= since).flatMap(o => o.items.filter(r => r.item.offer?.promoterId === ownerId).map(r => ({ order: o, row: r })));
    const products = new Map<string, FeedItem>();
    for (const offer of offers.filter(p => p.offer?.promoterId === ownerId))
        products.set(offer.id, offer);
    for (const { row } of rows)
        products.set(row.item.config?.postId ?? row.item.id, row.item);
    const groups = [...products].map(([id, item]) => {
        const own = rows.filter(r => (r.row.item.config?.postId ?? r.row.item.id) === id);
        const tickets = new Set(own.flatMap(r => r.row.tickets.map(t => t.id)));
        const commission = earnings.filter(e => e.ownerId === ownerId && e.kind === 'commission' && tickets.has(e.ticketId));
        const held = new Set(own.filter(r => issues.some(i => i.lineId === r.row.lineId && ['requested', 'return-approved', 'escalated'].includes(i.status))).flatMap(r => r.row.tickets.map(t => t.id)));
        const sum = (status: Earning['status']) => commission.filter(e => e.status === status && !(status === 'available' && held.has(e.ticketId))).reduce((n, e) => n + e.amountKobo, 0);
        const events = activity.filter(a => a.postId === id && a.at >= since);
        const views = events.filter(a => a.kind === 'view').length, opens = events.filter(a => a.kind === 'open').length;
        return { id, item, orders: new Set(own.map(r => r.order.id)).size, units: own.flatMap(r => r.row.tickets).filter(t => t.status !== 'refunded').length, views, opens, forwards: events.filter(a => a.kind === 'share').length, conversion: opens ? new Set(own.map(r => r.order.id)).size / opens * 100 : null, pending: sum('pending'), available: sum('available'), withdrawn: sum('withdrawn'), refunded: sum('refunded'), held: commission.filter(e => e.status === 'available' && held.has(e.ticketId)).reduce((n, e) => n + e.amountKobo, 0), net: commission.filter(e => e.status !== 'refunded').reduce((n, e) => n + e.amountKobo, 0) };
    });
    const total = { orders: new Set(rows.map(r => r.order.id)).size, units: 0, views: 0, opens: 0, pending: 0, available: 0, withdrawn: 0, refunded: 0, held: 0, net: 0 };
    for (const group of groups)
        for (const key of ['units', 'views', 'opens', 'pending', 'available', 'withdrawn', 'refunded', 'held', 'net'] as const)
            total[key] += group[key];
    const days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - 6 + i);
        const from = date.getTime(), to = from + 86400000;
        const ticketIds = new Set(rows.filter(r => r.order.placedAt >= from && r.order.placedAt < to).flatMap(r => r.row.tickets.map(t => t.id)));
        return { label: date.toLocaleDateString(undefined, { weekday: 'short' }), amount: earnings.filter(e => e.kind === 'commission' && e.ownerId === ownerId && e.status !== 'refunded' && ticketIds.has(e.ticketId)).reduce((n, e) => n + e.amountKobo, 0) };
    });
    return { groups: groups.sort((a, b) => b.net - a.net), total, days, rows };
}
