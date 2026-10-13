import { secureId, clone, required } from '@/features/account/guards';
import { validateDigital, validateFile, type PrivateFile } from '@/features/digital/files';
import { draftErrors } from '@/features/create/model';
import { useAccount } from '@/features/account/account-state';
import { AppState } from 'react-native';
import { validateSchedule, takeDuePosts, type ScheduledPost } from '@/features/create/scheduling';
import { stockAdjusted, stockKey, purchaseInventory, type Usage } from './inventory';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { FRONTEND_PREVIEW, PREVIEW_ACCOUNT_ID } from '@/config/preview';
import { FEED, type FeedItem } from '@/features/feed/data';
import { assertLive, offerPrice, offerMinimumPercent, configure, minimumSelections, defaultPlan, hydrate, integer, money, naira, quoteSplit, redeemQuote, respond, text, uri, validatePlan, type Catalogue, type Plan, type Quote } from './domain';
import type { ProductDraft } from '@/features/create/model';
type Snapshot = {
    definitions: Catalogue[];
    posts: FeedItem[];
    quotes: Quote[];
    reshares: FeedItem[];
    inventory: Record<string, Usage>;
    scheduled: ScheduledPost[];
    privateFiles: PrivateFile[];
};
type Value = Snapshot & {
    buyerId: string;
    ownerId: string;
    storeName: string;
    ready: boolean;
    storageIssue: string;
    saveReshare: (item: FeedItem) => void;
    saveCatalogue: (entry: Catalogue) => void;
    publish: (draft: ProductDraft) => FeedItem;
    editDraft: (id: string) => ProductDraft;
    updateStock: (id: string, stock: number) => void;
    setListingStatus: (id: string, status: 'active' | 'paused' | 'archived' | 'deleted') => void;
    accessFiles: (files: string[], sellerId: string) => PrivateFile[];
    restoreInventory: (row: {
        item: FeedItem;
        quantity: number;
    }) => void;
    schedule: (draft: ProductDraft, at: number) => ScheduledPost;
    cancelSchedule: (id: string) => void;
    publishDue: (now?: number) => void;
    requestOffer: (item: FeedItem, quantity: number, percent: number, note: string) => Quote;
    respondOffer: (id: string, action: 'accept' | 'decline' | 'counter' | 'cancel', price?: number, sellerPreview?: boolean) => void;
    checkoutQuote: (id: string) => FeedItem;
    consumePurchase: (lines: {
        item: FeedItem;
        quantity: number;
    }[], quoteId?: string) => void;
    resolve: (item: FeedItem) => FeedItem;
};
const Context = createContext<Value | null>(null);
export const localId = () => secureId('RECORD');
function seed(): Snapshot {
    const plan: Plan = { ...defaultPlan(), mode: 'menu', unit: 'meal pack', baseKobo: 0, packagingKobo: 20000, preparation: '25 minutes', hours: '9 am – 7 pm', ingredients: 'Rice, vegetables, proteins', allergens: 'Ask seller about your dietary requirements', groups: [{ name: 'Rice', min: 1, max: 6 }, { name: 'Protein', min: 0, max: 6 }, { name: 'Sides', min: 0, max: 4 }], components: [
            { id: 'rice', name: 'Fried rice', group: 'Rice', unit: 'serving spoon', description: 'One standard serving spoon', priceKobo: 100000, stock: 100, min: 0, max: 6, available: true },
            { id: 'beef', name: 'Beef', group: 'Protein', unit: 'piece', description: 'One cooked piece', priceKobo: 70000, stock: 60, min: 0, max: 6, available: true },
            { id: 'chicken', name: 'Chicken', group: 'Protein', unit: 'piece', description: 'One chicken portion', priceKobo: 150000, stock: 40, min: 0, max: 4, available: true },
            { id: 'salad', name: 'Salad', group: 'Sides', unit: 'portion', description: 'One side portion', priceKobo: 50000, stock: 50, min: 0, max: 4, available: true }
        ] };
    const regular: Plan = { ...defaultPlan(), mode: 'extras', unit: 'lunch pack', baseKobo: 350000, packagingKobo: 20000, preparation: '25 minutes', ingredients: 'Two rice servings, beef and salad', groups: [{ name: 'Extras', min: 0, max: 6 }], components: plan.components.filter(c => c.id !== 'rice').map(c => ({ ...c, group: 'Extras' })) };
    return { definitions: [{ id: 'movers-menu', ownerId: 'seller:Movers', store: 'Movers', title: 'Build your lunch', plan, hidden: false, version: 1, updatedAt: Date.now() }, { id: 'movers-pack', ownerId: 'seller:Movers', store: 'Movers', title: 'Lunch pack with extras', plan: regular, hidden: false, version: 1, updatedAt: Date.now() }], posts: [], quotes: [], reshares: [], inventory: {}, scheduled: [], privateFiles: [] };
}
let storage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
} | null = null;
try {
    storage = require('@react-native-async-storage/async-storage').default;
}
catch {
}
function safeFeed(item: FeedItem) {
    if (item.digital)
        item.digital = validateDigital(item.digital);
    if (item.productType === 'digital' && !item.digital)
        throw new Error('Digital file metadata is missing.');
    if (item.listingStatus && !['active', 'paused', 'archived', 'deleted'].includes(item.listingStatus))
        throw new Error('Invalid listing status.');
    if (item.fullDescription)
        text(item.fullDescription, 5000);
    for (const [key, value] of Object.entries(item.attributes ?? {})) {
        text(key, 80);
        text(value, 1000);
    }
    if (item.videoAsset && !['noodles', 'cake', 'shawarma'].includes(item.videoAsset))
        throw new Error('Invalid sample video.');
    text(item.id);
    text(item.store);
    text(item.name);
    money(item.priceKobo, false);
    integer(item.stock, 0, 1000, 'stock');
    uri(item.image);
    if (item.videoUrl)
        uri(item.videoUrl);
    if (item.plan)
        validatePlan(item.plan);
    if (item.offer) {
        money(item.offer.basePriceKobo, false);
        money(item.offer.commissionKobo);
        if (!Number.isFinite(item.offer.markupPercent) || item.offer.markupPercent < 0 || item.offer.markupPercent > 20 || item.offer.basePriceKobo + item.offer.commissionKobo !== item.priceKobo)
            throw new Error('Invalid stored markup.');
    }
}
function restore(raw: string, buyer: string): Snapshot {
    if (raw.length > 2000000)
        throw new Error('Stored catalogue is too large.');
    const v: Snapshot = JSON.parse(raw);
    if (!v || !v.inventory || typeof v.inventory !== 'object' || !Array.isArray(v.definitions) || !Array.isArray(v.posts) || !Array.isArray(v.quotes) || !Array.isArray(v.reshares) || v.definitions.length > 200 || v.posts.length > 200 || v.quotes.length > 500 || v.reshares.length > 200)
        throw new Error('Invalid saved catalogue.');
    for (const u of Object.values(v.inventory)) {
        integer(u.packs, 0, 1000000, 'used stock');
        for (const n of Object.values(u.components))
            integer(n, 0, 1000000, 'used component stock');
    }
    for (const d of v.definitions) {
        text(d.id);
        text(d.ownerId);
        text(d.store);
        text(d.title);
        integer(d.version, 1, 1000000, 'version');
        validatePlan(d.plan);
    }
    for (const p of [...v.posts, ...v.reshares])
        safeFeed(p);
    for (const q of v.quotes) {
        if (q.buyerId !== buyer)
            throw new Error('Stored offer belongs to another buyer.');
        text(q.id);
        text(q.sellerId);
        safeFeed(q.item);
        money(q.requestedKobo, false);
        integer(q.quantity, 1, 1000, 'quantity');
        if (!Number.isSafeInteger(q.expiresAt) || !['pending', 'counter', 'accepted', 'declined', 'cancelled', 'purchased'].includes(q.state))
            throw new Error('Invalid stored offer.');
        if (q.approvedKobo) {
            const split = quoteSplit(q.item, q.approvedKobo);
            if (split.sellerKobo !== q.sellerKobo || split.commissionKobo !== q.commissionKobo)
                throw new Error('Invalid stored allocation.');
        }
    }
    v.privateFiles = v.privateFiles ?? [];
    if (!Array.isArray(v.privateFiles) || v.privateFiles.length > 1000)
        throw new Error('Invalid digital vault.');
    for (const f of v.privateFiles) {
        validateFile(f);
        uri(f.uri);
        text(f.ownerId);
    }
    v.scheduled = v.scheduled ?? [];
    if (!Array.isArray(v.scheduled) || v.scheduled.length > 100)
        throw new Error('Invalid scheduled posts.');
    for (const p of v.scheduled) {
        text(p.id);
        text(p.ownerId);
        safeFeed(p.item);
        if (!Number.isSafeInteger(p.publishAt) || p.publishAt < 1 || p.item.sellerId !== p.ownerId || p.id !== p.item.id)
            throw new Error('Invalid publication schedule.');
    }
    // Older preview offers below the new floor cannot become new purchases.
    v.quotes = v.quotes.filter(q => q.state === 'purchased' || q.requestedKobo >= offerPrice(q.item, offerMinimumPercent(q.item.plan)) && (!q.approvedKobo || q.approvedKobo >= offerPrice(q.item, offerMinimumPercent(q.item.plan))));
    return v;
}
export function MarketplaceProvider({ children }: {
    children: ReactNode;
}) {
    const { user, store } = useAuth();
    const account = useAccount();
    const buyerId = user?.id ?? 'demo-buyer';
    const ownerId = user?.id ?? (FRONTEND_PREVIEW ? PREVIEW_ACCOUNT_ID : '');
    const storeName = account.profile.storeName || store?.name || user?.name || 'Gleenc Seller';
    const [state, setState] = useState<Snapshot>(seed);
    const ref = useRef(state);
    const [ready, setReady] = useState(false);
    const [storageIssue, setStorageIssue] = useState('');
    const session = useRef(buyerId);
    const writes = useRef(Promise.resolve());
    useEffect(() => {
        let active = true;
        session.current = buyerId;
        ref.current = seed();
        setState(ref.current);
        setReady(false);
        setStorageIssue('');
        if (!storage) {
            setReady(true);
            return () => {
                active = false;
            };
        }
        storage.getItem('gleenc:marketplace:v7:' + buyerId).then(raw => {
            if (active && raw) {
                ref.current = restore(raw, buyerId);
                setState(ref.current);
            }
        }).catch(() => {
            if (active)
                setStorageIssue('Saved marketplace data could not be loaded. This session starts with the sample catalogue.');
        }).finally(() => {
            if (active)
                setReady(true);
        });
        return () => {
            active = false;
        };
    }, [buyerId]);
    function commit(next: Snapshot) {
        if (next.privateFiles.length > 1000 || JSON.stringify(next).length > 2000000)
            throw new Error('The local catalogue storage limit was reached.');
        if (next.definitions.length > 200 || next.posts.length > 200 || next.quotes.length > 500 || next.reshares.length > 200 || next.scheduled.length > 100)
            throw new Error('The local demo has reached its record limit.');
        if (session.current !== buyerId)
            throw new Error('Your account changed. Reopen this action.');
        if (!ready)
            throw new Error('Your catalogue is still loading.');
        ref.current = next;
        setState(next);
        const active = buyerId;
        const raw = JSON.stringify(next);
        writes.current = writes.current.catch(() => {
        }).then(async () => {
            if (storage)
                await storage.setItem('gleenc:marketplace:v7:' + active, raw);
        }).catch(() => {
            if (session.current === active)
                setStorageIssue('Changes work in this session, but could not be saved on this device.');
        });
    }
    const resolve = (item: FeedItem) => {
        const original = ref.current.posts.find(p => p.id === (item.offer?.originalProductId ?? item.config?.postId ?? item.id));
        const source = original ? { ...item, ...original, id: item.id, offer: item.offer, config: item.config, quoteId: item.quoteId } : item;
        const adjusted = hydrate(stockAdjusted(source, source.catalogueId ? undefined : ref.current.inventory[stockKey(source)]), ref.current.definitions);
        return adjusted.listingStatus && adjusted.listingStatus !== 'active' ? { ...adjusted, stock: 0, plan: adjusted.plan ? { ...adjusted.plan, takingOrders: false } : undefined } : adjusted;
    };
    function saveReshare(item: FeedItem) {
        safeFeed(item);
        if (!ownerId || !item.offer)
            throw new Error('Sign in to reshare.');
        const id = FRONTEND_PREVIEW ? 'demo-promoter' : buyerId;
        if (item.offer.promoterId !== id)
            throw new Error('Reshare ownership mismatch.');
        commit({ ...ref.current, reshares: [item, ...ref.current.reshares.filter(p => p.offer?.originalProductId !== item.offer?.originalProductId)] });
    }
    function saveCatalogue(entry: Catalogue) {
        if (!ownerId || entry.ownerId !== ownerId)
            throw new Error('You do not own this catalogue.');
        const old = ref.current.definitions.find(d => d.id === entry.id);
        if (old && old.ownerId !== ownerId)
            throw new Error('Catalogue ownership mismatch.');
        entry = { ...entry, plan: { ...entry.plan, minimumPercent: offerMinimumPercent(entry.plan) } };
        validatePlan(entry.plan);
        integer(entry.plan.minimumPercent, 80, 100, 'minimum offer (80–100)');
        if (!text(entry.title) || !text(entry.store))
            throw new Error('Complete catalogue details.');
        const next = { ...entry, version: (old?.version ?? 0) + 1, updatedAt: Date.now() };
        commit({ ...ref.current, definitions: [next, ...ref.current.definitions.filter(d => d.id !== entry.id)] });
    }
    function buildPost(draft: ProductDraft) {
        if (!ownerId || draft.ownerId !== ownerId)
            throw new Error('Only the draft owner can publish.');
        const errors = draftErrors(draft);
        if (errors.length)
            throw new Error(errors[0]);
        const existing = draft.publishedId ? ref.current.posts.find(p => p.id === draft.publishedId) : undefined;
        if (draft.publishedId && (!existing || existing.sellerId !== ownerId || existing.listingStatus === 'deleted'))
            throw new Error('You cannot edit this listing.');
        const linked = ref.current.definitions.find(d => d.id === draft.catalogueId);
        if (draft.catalogueId && (!linked || linked.ownerId !== ownerId))
            throw new Error('Choose your own catalogue.');
        let plan: Plan = linked?.plan ?? draft.orderingPlan ?? { ...defaultPlan(), baseKobo: naira(draft.basePrice), stock: Number(draft.baseStock) };
        if (!linked && !draft.orderingPlan && draft.variants.length) {
            plan = { ...plan, baseKobo: 0, groups: [{ name: 'Variant', min: 1, max: 1 }], components: draft.variants.map((v, i) => ({ id: 'v' + i, name: Object.values(v.labels).join(' / '), group: 'Variant', unit: 'piece', description: v.sku, priceKobo: naira(v.price || draft.basePrice), stock: Number(v.stock), min: 0, max: 1, available: Number(v.stock) > 0 })) };
        }
        if (!linked && draft.variants.length) {
            plan = { ...plan, stock: draft.variants.reduce((n, v) => n + Number(v.stock), 0) };
        }
        const used = existing ? ref.current.inventory[existing.id] : undefined;
        if (used && !linked) {
            plan = { ...plan, stock: plan.stock + used.packs, components: plan.components.map(c => ({ ...c, stock: c.stock + (used.components[c.id] ?? 0) })) };
        }
        plan = { ...plan, minimumPercent: offerMinimumPercent(plan) };
        validatePlan(plan);
        const item: FeedItem = { id: existing?.id ?? 'POST-' + draft.id, sellerId: ownerId, store: linked?.store ?? storeName, handle: '@' + storeName.toLowerCase().replace(/[^a-z0-9]/g, ''), name: text(draft.name), description: text(draft.shortDescription, 1000), kind: draft.presentation === 'video' ? 'video' : 'product', image: uri(draft.images[0]?.uri ?? ''), images: draft.images.map(i => uri(i.uri)), videoUrl: draft.videoUri || undefined, videoAsset: draft.videoAsset, category: draft.categoryId, priceKobo: plan.stock ? configure({ id: 'price-preview', priceKobo: plan.baseKobo, plan, stock: plan.stock } as FeedItem, minimumSelections(plan), 1).priceKobo : existing?.priceKobo ?? Math.max(plan.baseKobo, 1), stock: plan.stock, likes: 0, comments: 0, views: 0, createdAt: existing?.createdAt ?? Date.now(), plan, catalogueId: linked?.id, priceVersion: existing ? (existing.priceVersion ?? 1) + 1 : linked?.version ?? 1,
            productType: draft.productType ?? 'physical', listingStatus: existing?.listingStatus ?? 'active', fullDescription: text(draft.description, 5000), subcategory: text(draft.subcategory, 100), attributes: clone(draft.attributes), colors: clone(draft.colorHex), colorImages: draft.images.map(i => ({ uri: uri(i.uri), color: text(i.color ?? '', 60) })),
            variants: draft.variants.length ? draft.variants.map((v, i) => ({ id: 'v' + i, labels: clone(v.labels), sku: text(v.sku, 100), priceKobo: Math.round(Number(v.price || draft.basePrice) * 100), stock: Number(v.stock) })) : existing?.variants ?? [],
            shipping: draft.productType === 'digital' ? undefined : { pickup: draft.pickup, delivery: draft.localDelivery, interstate: draft.interstate, pickupArea: text(draft.pickupArea), dispatchArea: text(draft.dispatchArea), localFeeKobo: draft.localFee ? naira(draft.localFee) : undefined, preparation: text(draft.deliveryTime), handling: text(draft.handling, 1000) }, digital: draft.productType === 'digital' ? validateDigital(clone(draft.digital!)) : undefined };
        if (!item.image || item.kind === 'video' && !item.videoUrl)
            throw new Error('Add a cover and the selected video.');
        safeFeed(item);
        return item;
    }
    function registerFiles(draft: ProductDraft) {
        if (draft.productType !== 'digital')
            return ref.current.privateFiles;
        validateDigital(draft.digital!);
        const files = draft.digitalFiles ?? [];
        for (const file of files) {
            validateFile(file);
            uri(file.uri);
            if (file.ownerId !== ownerId || ref.current.privateFiles.some(old => old.id === file.id && old.ownerId !== ownerId))
                throw new Error('Digital file belongs to another seller.');
            const existing = ref.current.privateFiles.find(old => old.id === file.id);
            if (existing && (existing.uri !== file.uri || existing.name !== file.name || existing.bytes !== file.bytes || existing.mime !== file.mime))
                throw new Error('Attach a new file instead of replacing a purchased asset.');
        }
        if (draft.digital!.files.some(f => !files.some(p => p.id === f.id && p.name === f.name && p.mime === f.mime && p.bytes === f.bytes)))
            throw new Error('Attach all digital files.');
        return [...files, ...ref.current.privateFiles.filter(f => !files.some(n => n.id === f.id))];
    }
    function publish(draft: ProductDraft) {
        const item = buildPost(draft);
        commit({ ...ref.current, privateFiles: registerFiles(draft), scheduled: ref.current.scheduled.filter(p => p.id !== item.id), posts: [item, ...ref.current.posts.filter(p => p.id !== item.id)] });
        return resolve(item);
    }
    function schedule(draft: ProductDraft, at: number) {
        validateSchedule(at);
        const item = buildPost(draft);
        if (ref.current.posts.some(p => p.id === item.id))
            throw new Error('This post is already published. Duplicate its draft to schedule a new post.');
        const queued: ScheduledPost = { id: item.id, ownerId, item, publishAt: at, queuedAt: Date.now() };
        commit({ ...ref.current, privateFiles: registerFiles(draft), scheduled: [queued, ...ref.current.scheduled.filter(p => p.id !== queued.id)] });
        return queued;
    }
    function cancelSchedule(id: string) {
        const queued = ref.current.scheduled.find(p => p.id === id);
        if (!queued || queued.ownerId !== ownerId)
            throw new Error('You cannot cancel this scheduled post.');
        commit({ ...ref.current, scheduled: ref.current.scheduled.filter(p => p.id !== id) });
    }
    function publishDue(now = Date.now()) {
        if (!ready || !ownerId || session.current !== buyerId)
            return;
        const { due, remaining } = takeDuePosts(ref.current.scheduled, ownerId, now);
        if (!due.length)
            return;
        const posts = due.map(p => ({ ...p.item, createdAt: p.publishAt }));
        commit({ ...ref.current, scheduled: remaining, posts: [...posts, ...ref.current.posts.filter(p => !posts.some(n => n.id === p.id))] });
    }
    useEffect(() => {
        if (!ready)
            return;
        const tick = () => {
            if (AppState.currentState && AppState.currentState !== 'active')
                return;
            try {
                publishDue();
            }
            catch (e) {
                setStorageIssue(e instanceof Error ? e.message : 'Scheduled publication needs review.');
            }
        };
        tick();
        const timer = setInterval(tick, 1000);
        const subscription = AppState.addEventListener('change', state => {
            if (state === 'active')
                tick();
        });
        return () => {
            clearInterval(timer);
            subscription.remove();
        };
    }, [ready, ownerId, buyerId]);
    function updateStock(id: string, stock: number) {
        integer(stock, 0, 1000, 'stock');
        const p = ref.current.posts.find(p => p.id === id);
        if (!p || p.sellerId !== ownerId || p.listingStatus === 'deleted')
            throw new Error('Listing ownership mismatch.');
        if (p.catalogueId) {
            const d = ref.current.definitions.find(d => d.id === p.catalogueId);
            if (!d || d.ownerId !== ownerId)
                throw new Error('Catalogue ownership mismatch.');
            saveCatalogue({ ...d, plan: { ...d.plan, stock } });
            return;
        }
        const used = ref.current.inventory[id]?.packs ?? 0;
        commit({ ...ref.current, posts: ref.current.posts.map(row => row.id === id ? { ...row, stock: stock + used, plan: row.plan ? { ...row.plan, stock: stock + used } : undefined, priceVersion: (row.priceVersion ?? 1) + 1 } : row) });
    }
    function setListingStatus(id: string, status: 'active' | 'paused' | 'archived' | 'deleted') {
        const p = ref.current.posts.find(p => p.id === id);
        if (!p || p.sellerId !== ownerId || p.listingStatus === 'deleted')
            throw new Error('Listing ownership mismatch.');
        if (!['active', 'paused', 'archived', 'deleted'].includes(status))
            throw new Error('Invalid listing action.');
        commit({ ...ref.current, posts: ref.current.posts.map(p => p.id === id ? { ...p, listingStatus: status, priceVersion: (p.priceVersion ?? 1) + 1 } : p) });
    }
    function editDraft(id: string): ProductDraft {
        const p = ref.current.posts.find(p => p.id === id);
        if (!p || p.sellerId !== ownerId || p.listingStatus === 'deleted')
            throw new Error('Listing unavailable.');
        const live = resolve(p);
        return { id: p.id.replace(/^POST-/, ''), publishedId: p.id, ownerId, updatedAt: Date.now(), state: 'draft', productType: p.productType ?? 'physical', categoryId: p.category, subcategory: p.subcategory ?? '', name: p.name, shortDescription: p.description, description: p.fullDescription ?? p.description, attributes: p.attributes ?? {}, options: [], variants: [], colorHex: p.colors ?? {}, images: (p.colorImages ?? (p.images ?? [p.image]).map(uri => ({ uri, color: '' }))).map((i, n) => ({ id: 'image-' + n, ...i })), presentation: p.kind === 'video' ? 'video' : 'image', videoUri: p.videoUrl ?? '', videoAsset: p.videoAsset, basePrice: String(live.priceKobo / 100), baseStock: String(live.stock), sellerSku: '', pickup: p.shipping?.pickup ?? true, localDelivery: p.shipping?.delivery ?? false, interstate: p.shipping?.interstate ?? false, pickupArea: p.shipping?.pickupArea ?? '', dispatchArea: p.shipping?.dispatchArea ?? '', localFee: p.shipping?.localFeeKobo === undefined ? '' : String(p.shipping.localFeeKobo / 100), deliveryTime: p.shipping?.preparation ?? '', handling: p.shipping?.handling ?? '', catalogueId: p.catalogueId, orderingPlan: p.productType === 'digital' || p.catalogueId ? undefined : live.plan ? { ...live.plan, takingOrders: p.plan?.takingOrders ?? true } : undefined, digital: p.digital, digitalFiles: ref.current.privateFiles.filter(f => p.digital?.files.some(m => m.id === f.id)) };
    }
    function accessFiles(ids: string[], sellerId: string) {
        return ids.map(id => {
            const f = ref.current.privateFiles.find(f => f.id === id && f.ownerId === sellerId);
            if (!f)
                throw new Error('Purchased file is unavailable.');
            return clone(f);
        });
    }
    function requestOffer(item: FeedItem, quantity: number, percent: number, note: string) {
        if (!user && !FRONTEND_PREVIEW)
            throw new Error('Sign in to make an offer.');
        safeFeed(item);
        integer(quantity, 1, Math.min(item.stock, 1000), 'quantity');
        integer(percent, offerMinimumPercent(item.plan), 100, 'offer percentage (maximum 20% discount)');
        if (item.plan && !item.plan.allowOffers)
            throw new Error('This seller is not accepting offers.');
        const sellerId = item.sellerId ?? 'seller:' + item.store;
        if (sellerId === buyerId)
            throw new Error('You cannot negotiate your own listing.');
        if (ref.current.quotes.some(q => q.buyerId === buyerId && q.item.id === item.id && q.quantity === quantity && q.expiresAt > Date.now() && ['pending', 'counter', 'accepted'].includes(q.state)))
            throw new Error('You already have an active offer for these items.');
        const requestedKobo = offerPrice(item, percent);
        quoteSplit(item, requestedKobo);
        const q: Quote = { id: 'OFFER-' + localId(), buyerId, buyerName: user?.name ?? 'Solomon', sellerId, item: JSON.parse(JSON.stringify(item)), quantity, requestedKobo, note: text(note, 500), createdAt: Date.now(), updatedAt: Date.now(), expiresAt: Date.now() + (item.category.toLowerCase().includes('food') || item.category === 'food' ? 30 * 60000 : 24 * 3600000), state: 'pending', updatedBy: buyerId };
        commit({ ...ref.current, quotes: [q, ...ref.current.quotes] });
        return q;
    }
    function respondOffer(id: string, action: 'accept' | 'decline' | 'counter' | 'cancel', price?: number, sellerPreview = false) {
        const q = ref.current.quotes.find(q => q.id === id);
        if (!q)
            throw new Error('Offer unavailable.');
        if (sellerPreview && !FRONTEND_PREVIEW)
            throw new Error('Seller testing is disabled.');
        const actor = sellerPreview ? q.sellerId : buyerId;
        const next = respond(q, actor, action, price);
        commit({ ...ref.current, quotes: ref.current.quotes.map(q => q.id === id ? next : q) });
    }
    function checkoutQuote(id: string) {
        if (!user && !FRONTEND_PREVIEW)
            throw new Error('Sign in to use a private offer.');
        const q = ref.current.quotes.find(q => q.id === id);
        if (!q)
            throw new Error('Offer unavailable.');
        redeemQuote(q, buyerId);
        return { ...q.item, id: q.item.id + '~quote:' + q.id, quoteId: q.id, priceKobo: q.approvedKobo!, offer: q.item.offer ? { ...q.item.offer, basePriceKobo: q.sellerKobo!, commissionKobo: q.commissionKobo! } : undefined };
    }
    function restoreInventory(row: {
        item: FeedItem;
        quantity: number;
    }) {
        const key = stockKey(row.item), usage = ref.current.inventory[key], definition = ref.current.definitions.find(d => d.id === key);
        const amounts = Object.fromEntries((row.item.config?.selections ?? []).map(c => [c.id, c.quantity * row.quantity]));
        if (definition) {
            commit({ ...ref.current, definitions: ref.current.definitions.map(d => d.id === key ? { ...d, plan: { ...d.plan, stock: d.plan.stock + row.quantity, components: d.plan.components.map(c => ({ ...c, stock: c.stock + (amounts[c.id] ?? 0) })) } } : d) });
        }
        else if (usage) {
            if (usage.packs < row.quantity)
                throw new Error('Invalid stock restoration.');
            commit({ ...ref.current, inventory: { ...ref.current.inventory, [key]: { packs: usage.packs - row.quantity, components: Object.fromEntries(Object.entries(usage.components).map(([id, n]) => [id, Math.max(0, n - (amounts[id] ?? 0))])) } } });
        }
    }
    function consumePurchase(lines: {
        item: FeedItem;
        quantity: number;
    }[], quoteId?: string) {
        const original = [...FEED, ...ref.current.posts, ...ref.current.definitions.map(cataloguePost)];
        const resolveOriginal = (item: FeedItem) => {
            const key = item.offer?.originalProductId ?? item.config?.postId ?? item.id;
            const definition = item.catalogueId ? ref.current.definitions.find(d => d.id === item.catalogueId) : undefined;
            const source = definition ? cataloguePost(definition) : original.find(p => p.id === key);
            if (!source)
                throw new Error('Original listing unavailable.');
            return resolve(source);
        };
        const changes = purchaseInventory(ref.current.definitions, ref.current.inventory, lines, resolveOriginal);
        let quotes = ref.current.quotes;
        if (quoteId) {
            const q = quotes.find(q => q.id === quoteId);
            if (!q)
                throw new Error('Offer unavailable.');
            const next = redeemQuote(q, buyerId);
            if (lines.length !== 1 || lines[0].item.quoteId !== q.id || lines[0].quantity !== q.quantity || lines[0].item.priceKobo !== q.approvedKobo)
                throw new Error('Checkout does not match the approved offer.');
            quotes = quotes.map(q => q.id === quoteId ? next : q);
        }
        commit({ ...ref.current, ...changes, quotes });
    }
    return <Context.Provider value={{ ...state, buyerId, ownerId, storeName, ready, storageIssue, saveReshare, saveCatalogue, publish, editDraft, setListingStatus, updateStock, accessFiles, restoreInventory, schedule, cancelSchedule, publishDue, requestOffer, respondOffer, checkoutQuote, consumePurchase, resolve }}>{children}</Context.Provider>;
}
export function useMarketplace() {
    const value = useContext(Context);
    if (!value)
        throw new Error('MarketplaceProvider is missing');
    return value;
}
export function cataloguePost(entry: Catalogue): FeedItem {
    return { id: 'CAT-' + entry.id, catalogueId: entry.id, sellerId: entry.ownerId, store: entry.store, handle: '@' + entry.store, name: entry.title, description: entry.plan.ingredients || 'Order from this seller catalogue', kind: 'product', image: entry.plan.components.find(c => c.image)?.image ?? FEED.find(p => p.store === entry.store)?.image ?? FEED[0].image, category: 'Food', priceKobo: Math.max(entry.plan.baseKobo, 1), stock: entry.plan.stock, likes: 0, comments: 0, views: 0, createdAt: entry.updatedAt, plan: entry.plan, priceVersion: entry.version };
}
