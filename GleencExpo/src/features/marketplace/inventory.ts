import type { FeedItem } from '@/features/feed/data';
import { configure, integer, type Catalogue } from './domain';
export type Usage = {
    packs: number;
    components: Record<string, number>;
};
export function stockKey(item: FeedItem) { return item.catalogueId ?? item.offer?.originalProductId ?? item.config?.postId ?? item.id; }
export function stockAdjusted(item: FeedItem, usage?: Usage): FeedItem {
    if (!usage)
        return item;
    const stock = Math.max(0, item.stock - usage.packs);
    return { ...item, stock, plan: item.plan ? { ...item.plan, stock, components: item.plan.components.map(c => ({ ...c, stock: Math.max(0, c.stock - (usage.components[c.id] ?? 0)) })) } : undefined };
}
export function purchaseInventory(definitions: Catalogue[], inventory: Record<string, Usage>, lines: {
    item: FeedItem;
    quantity: number;
}[], resolve: (item: FeedItem) => FeedItem) {
    const totals = new Map<string, {
        item: FeedItem;
        usage: Usage;
    }>();
    for (const row of lines) {
        integer(row.quantity, 1, 1000, 'quantity');
        const key = stockKey(row.item);
        const total = totals.get(key) ?? { item: row.item, usage: { packs: 0, components: {} } };
        total.usage.packs += row.quantity;
        for (const c of row.item.config?.selections ?? [])
            total.usage.components[c.id] = (total.usage.components[c.id] ?? 0) + c.quantity * row.quantity;
        totals.set(key, total);
    }
    for (const { item, usage } of totals.values()) {
        const live = resolve(item);
        if (live.stock < usage.packs || live.plan?.takingOrders === false)
            throw new Error('Insufficient stock for ' + item.name + '.');
        if (live.plan)
            for (const [id, amount] of Object.entries(usage.components)) {
                const c = live.plan.components.find(c => c.id === id);
                if (!c?.available || c.stock < amount)
                    throw new Error('Insufficient stock for ' + (c?.name ?? 'a selected component') + '.');
            }
    }
    const nextDefinitions = definitions.map(d => { const t = totals.get(d.id); return !t ? d : { ...d, plan: { ...d.plan, stock: d.plan.stock - t.usage.packs, components: d.plan.components.map(c => ({ ...c, stock: c.stock - (t.usage.components[c.id] ?? 0) })) } }; });
    const nextInventory = { ...inventory };
    for (const [key, { usage }] of totals) {
        if (definitions.some(d => d.id === key))
            continue;
        const old = nextInventory[key] ?? { packs: 0, components: {} };
        const components = { ...old.components };
        for (const [id, n] of Object.entries(usage.components))
            components[id] = (components[id] ?? 0) + n;
        nextInventory[key] = { packs: old.packs + usage.packs, components };
    }
    return { definitions: nextDefinitions, inventory: nextInventory };
}
