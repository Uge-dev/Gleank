import type { FeedItem } from '@/features/feed/data';
export type Format = 'item' | 'pack' | 'menu' | 'extras';
export type Component = {
    id: string;
    name: string;
    group: string;
    unit: string;
    description: string;
    priceKobo: number;
    stock: number;
    min: number;
    max: number;
    image?: string;
    photoId?: string;
    available: boolean;
};
export type Group = {
    name: string;
    min: number;
    max: number;
};
export type Plan = {
    mode: Format;
    unit: string;
    baseKobo: number;
    stock: number;
    packagingKobo: number;
    components: Component[];
    groups: Group[];
    preparation: string;
    hours: string;
    ingredients: string;
    allergens: string;
    takingOrders: boolean;
    allowOffers: boolean;
    minimumPercent: number;
};
export type Catalogue = {
    id: string;
    ownerId: string;
    store: string;
    title: string;
    version: number;
    updatedAt: number;
    hidden: boolean;
    plan: Plan;
};
export type Configuration = {
    postId: string;
    version: number;
    selections: {
        id: string;
        name: string;
        unit: string;
        quantity: number;
        priceKobo: number;
    }[];
    merchandiseKobo: number;
    packagingKobo: number;
    sellerKobo: number;
    fingerprint: string;
};
export type Quote = {
    id: string;
    buyerId: string;
    buyerName: string;
    sellerId: string;
    item: FeedItem;
    quantity: number;
    requestedKobo: number;
    approvedKobo?: number;
    sellerKobo?: number;
    commissionKobo?: number;
    note: string;
    updatedBy?: string;
    createdAt: number;
    expiresAt: number;
    updatedAt: number;
    state: 'pending' | 'counter' | 'accepted' | 'declined' | 'cancelled' | 'purchased';
};
export const MAX_OFFER_DISCOUNT = 20;
export function offerMinimumPercent(plan?: Plan) { return Math.max(100 - MAX_OFFER_DISCOUNT, plan?.minimumPercent ?? 80); }
export function offerPrice(item: FeedItem, percent: number) { money(item.priceKobo, false); integer(percent, offerMinimumPercent(item.plan), 100, 'offer percentage (maximum 20% discount)'); return money(Math.ceil(item.priceKobo * percent / 100), false); }
export function assertOfferPrice(item: FeedItem, amount: number) { money(amount, false); if (amount < offerPrice(item, offerMinimumPercent(item.plan)) || amount > item.priceKobo) throw new Error('Offers can reduce the listed price by at most 20%, or the seller’s stricter limit.'); }
export const MAX_MONEY = 100000000000;
export function integer(value: number, min: number, max: number, label: string) { if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error('Invalid ' + label + '.'); return value; }
export function money(value: number, allowZero = true) { return integer(value, allowZero ? 0 : 1, MAX_MONEY, 'amount'); }
export function naira(value: string) { if (!/^\d{1,10}(\.\d{1,2})?$/.test(value.trim()))
    throw new Error('Enter a valid naira amount, with at most two decimal places.'); return money(Math.round(Number(value) * 100)); }
export function text(value: string, max = 200) { if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))
    throw new Error('Invalid text.'); return value.trim(); }
export function uri(value: string) { if (value && !/^(https:\/\/|file:\/\/|content:\/\/|ph:\/\/)/i.test(value))
    throw new Error('Use an HTTPS image or a selected device file.'); if (value.length > 2000)
    throw new Error('Image address is too long.'); return value; }
export function validatePlan(plan: Plan) {
    if (!['item', 'pack', 'menu', 'extras'].includes(plan.mode))
        throw new Error('Choose an ordering format.');
    if (!text(plan.unit, 60))
        throw new Error('Name the selling unit.');
    money(plan.baseKobo);
    money(plan.packagingKobo);
    integer(plan.stock, 0, 1000, 'stock');
    integer(plan.minimumPercent, 1, 100, 'minimum offer');
    if (plan.components.length > 60 || plan.groups.length > 20)
        throw new Error('Reduce the catalogue size.');
    if (new Set(plan.components.map(c => c.id)).size !== plan.components.length || new Set(plan.groups.map(g => g.name)).size !== plan.groups.length)
        throw new Error('Duplicate item or group.');
    for (const group of plan.groups) {
        if (!text(group.name, 60))
            throw new Error('Name the group.');
        integer(group.min, 0, 1000, 'group minimum');
        integer(group.max, Math.max(1, group.min), 1000, 'group maximum');
    }
    for (const c of plan.components) {
        if (!text(c.name) || !text(c.id) || !text(c.unit, 60) || !plan.groups.some(g => g.name === c.group))
            throw new Error('Complete item and group details.');
        money(c.priceKobo, false);
        integer(c.stock, 0, 1000, 'item stock');
        integer(c.min, 0, 1000, 'minimum');
        integer(c.max, Math.max(c.min, 1), 1000, 'maximum');
        text(c.description, 500);
        uri(c.image ?? '');
    }
    for (const field of [plan.preparation, plan.hours, plan.ingredients, plan.allergens])
        text(field, 1000);
    if ((plan.mode === 'menu' || !plan.baseKobo) && !plan.components.length)
        throw new Error('Add priced items or a base price.');
    if (!plan.baseKobo && !plan.groups.some(g => g.min > 0) && !plan.components.some(c => c.min > 0))
        throw new Error('Require at least one priced selection.');
    return plan;
}
export function defaultPlan(): Plan { return { mode: 'item', unit: 'piece', baseKobo: 100000, stock: 20, packagingKobo: 0, components: [], groups: [], preparation: '', hours: '', ingredients: '', allergens: '', takingOrders: true, allowOffers: true, minimumPercent: 80 }; }
export function minimumSelections(plan: Plan) {
    const result: Record<string, number> = {};
    for (const c of plan.components)
        if (c.available && c.stock >= c.min)
            result[c.id] = c.min;
    for (const group of plan.groups) {
        let need = group.min - plan.components.filter(c => c.group === group.name).reduce((n, c) => n + (result[c.id] ?? 0), 0);
        for (const c of plan.components.filter(c => c.group === group.name && c.available).sort((a, b) => a.priceKobo - b.priceKobo)) {
            const add = Math.min(Math.max(0, need), Math.max(0, Math.min(c.max, c.stock) - (result[c.id] ?? 0)));
            result[c.id] = (result[c.id] ?? 0) + add;
            need -= add;
        }
        if (need > 0)
            throw new Error('A required menu group is unavailable.');
    }
    return result;
}
export function configure(item: FeedItem, selections: Record<string, number>, packs: number): FeedItem {
    const plan = item.plan;
    if (!plan)
        return item;
    validatePlan(plan);
    integer(packs, 1, Math.min(plan.stock, 1000), 'pack quantity');
    if (!plan.takingOrders)
        throw new Error('This seller is not taking orders for this item.');
    if (Object.keys(selections).some(id => !plan.components.some(c => c.id === id)))
        throw new Error('Unknown menu item.');
    if (plan.components.some(c => c.min > 0 && (!c.available || c.stock < c.min * packs)))
        throw new Error('A required item is unavailable.');
    const chosen = plan.components.map(c => { const quantity = integer(selections[c.id] ?? 0, c.available ? c.min : 0, c.available ? c.max : 0, 'component quantity'); if (quantity * packs > c.stock)
        throw new Error(c.name + ' has insufficient stock.'); return { ...c, quantity }; });
    for (const g of plan.groups)
        integer(chosen.filter(c => c.group === g.name).reduce((n, c) => n + c.quantity, 0), g.min, g.max, 'selection in ' + g.name);
    const merchandiseKobo = money(plan.baseKobo + chosen.reduce((n, c) => n + c.priceKobo * c.quantity, 0), false);
    const sellerKobo = money(merchandiseKobo + plan.packagingKobo, false);
    const rate = item.offer?.markupPercent ?? 0;
    if (!Number.isFinite(rate) || rate < 0 || rate > 20)
        throw new Error('Reshare markup exceeds 20%.');
    const commissionKobo = Math.floor(merchandiseKobo * rate / 100);
    const fingerprint = chosen.filter(c => c.quantity).sort((a, b) => a.id.localeCompare(b.id)).map(c => encodeURIComponent(c.id) + '=' + c.quantity).join('&') || 'base';
    const config: Configuration = { postId: item.config?.postId ?? item.id, version: item.priceVersion ?? 1, selections: chosen.filter(c => c.quantity).map(({ id, name, unit, quantity, priceKobo }) => ({ id, name, unit, quantity, priceKobo })), merchandiseKobo, packagingKobo: plan.packagingKobo, sellerKobo, fingerprint };
    return { ...item, stock: Math.min(plan.stock, ...chosen.filter(c => c.quantity).map(c => Math.floor(c.stock / c.quantity))), id: config.postId + '~' + fingerprint, priceKobo: money(sellerKobo + commissionKobo, false), config, offer: item.offer ? { ...item.offer, basePriceKobo: sellerKobo, commissionKobo } : undefined };
}
export function hydrate(item: FeedItem, entries: Catalogue[]) {
    const entry = entries.find(e => e.id === item.catalogueId);
    const plan = entry?.plan ?? item.plan;
    const next = { ...item, plan: plan ? { ...plan, takingOrders: plan.takingOrders && !entry?.hidden } : undefined, priceVersion: entry?.version ?? item.priceVersion, sellerId: entry?.ownerId ?? item.sellerId };
    if (!plan)
        return next;
    try {
        const priced = configure(next, minimumSelections(plan), 1);
        return { ...next, priceKobo: priced.priceKobo, stock: plan.stock, offer: priced.offer };
    }
    catch {
        return { ...next, stock: 0 };
    }
}
export function quoteSplit(item: FeedItem, buyerUnitKobo: number) {
    money(buyerUnitKobo, false);
    const packaging = item.config?.packagingKobo ?? 0;
    if (buyerUnitKobo <= packaging)
        throw new Error('The offer must cover the product and packaging.');
    const markup = item.offer?.markupPercent ?? 0;
    if (markup < 0 || markup > 20 || !Number.isFinite(markup))
        throw new Error('Invalid markup.');
    const merchandise = Math.ceil((buyerUnitKobo - packaging) / (1 + markup / 100));
    const commissionKobo = buyerUnitKobo - packaging - merchandise;
    if (commissionKobo < 0 || commissionKobo > Math.floor(merchandise * 0.2))
        throw new Error('Invalid commission.');
    return { sellerKobo: merchandise + packaging, commissionKobo };
}
export function assertLive(q: Quote, at = Date.now()) { if (q.expiresAt <= at)
    throw new Error('This offer has expired.'); if (['purchased', 'declined', 'cancelled'].includes(q.state))
    throw new Error('This offer is closed.'); }
export function respond(q: Quote, actorId: string, action: 'accept' | 'decline' | 'counter' | 'cancel', price?: number, at = Date.now()): Quote {
    assertLive(q, at);
    if (action === 'cancel') {
        if (actorId !== q.buyerId || q.state === 'accepted')
            throw new Error('This buyer cannot cancel the offer.');
        return { ...q, updatedBy: actorId, state: 'cancelled', updatedAt: Math.max(at, q.updatedAt + 1) };
    }
    const isSeller = actorId === q.sellerId;
    if (isSeller && q.state === 'counter' && action === 'accept')
        throw new Error('The buyer must accept your counteroffer.');
    if (!isSeller && !(actorId === q.buyerId && action === 'accept' && q.state === 'counter'))
        throw new Error('Only the authorized participant can respond.');
    if (isSeller && !['pending', 'counter'].includes(q.state))
        throw new Error('This offer has already been answered.');
    if (action === 'decline')
        return { ...q, updatedBy: actorId, state: 'declined', updatedAt: Math.max(at, q.updatedAt + 1) };
    const amount = action === 'counter' ? money(price ?? 0, false) : (q.state === 'counter' ? q.approvedKobo : q.requestedKobo);
    if (!amount || amount > q.item.priceKobo)
        throw new Error('Review the proposed price.');
    assertOfferPrice(q.item, amount);
    const split = quoteSplit(q.item, amount);
    return { ...q, ...split, updatedBy: actorId, approvedKobo: amount, state: action === 'counter' ? 'counter' : 'accepted', updatedAt: Math.max(at, q.updatedAt + 1) };
}
export function redeemQuote(q: Quote, buyerId: string, at = Date.now()): Quote { assertLive(q, at); if (q.buyerId !== buyerId || q.state !== 'accepted' || !q.approvedKobo)
    throw new Error('This checkout offer does not belong to this buyer.'); assertOfferPrice(q.item, q.approvedKobo); return { ...q, updatedBy: buyerId, state: 'purchased', updatedAt: Math.max(at, q.updatedAt + 1) }; }
