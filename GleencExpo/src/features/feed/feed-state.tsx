import { api } from '@/services/api';
import { useLive,useServerQuery } from '@/features/live/state';
import { useRemoteFeed, type RemoteFeedMode } from './use-remote-feed';
import { useCommunity } from '@/features/community/community-state';
import { useLocalRecord } from '@/features/experience/local-record';
import { restoreCart } from './cart-storage';
import { secureId } from '@/features/account/guards';
import { useAccount } from '@/features/account/account-state';
import { useMarketplace, cataloguePost } from '@/features/marketplace/marketplace-state';
import { configure, minimumSelections } from '@/features/marketplace/domain';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useAuth } from '@/hooks/use-auth';
import { mapRemotePost } from './remote-feed';
import { FEED, type FeedItem } from './data';
import { makeReshare } from '@/features/commerce/reshare';
import { FRONTEND_PREVIEW } from '@/config/preview';
export type Entry = {
    item: FeedItem;
    quantity: number;
};
export type PurchaseIntent = 'offer' | 'quantity';
export type PurchaseTarget = Entry & {
    kind: PurchaseIntent;
};
export const PURCHASE_API_VERSION = 9 as const;
type State = {
    feedLoading: boolean;
    feedLoadingMore: boolean;
    feedError: string;
    refreshFeed: () => Promise<void>;
    loadMoreFeed: () => Promise<void>;
    setFeedMode: (mode: RemoteFeedMode) => void;
    showIntegrationNotice: () => void;
    purchaseApiVersion: typeof PURCHASE_API_VERSION;
    purchaseTarget: PurchaseTarget | null;
    openPurchase: (kind: PurchaseIntent, item: FeedItem, quantity?: number) => void;
    closePurchase: () => void;
    liked: string[];
    saved: string[];
    followed: string[];
    reshared: string[];
    shared: Record<string, number>;
    cart: Entry[];
    cartReady: boolean;
    cartNotice: string;
    retryCart: () => Promise<void>;
    requireAccount: (action: () => void) => void;
    toggleLike: (id: string) => void;
    toggleSave: (id: string) => void;
    toggleReshare: (id: string) => void;
    recordShare: (id: string) => void;
    toggleFollow: (store: string) => void;
    addToCart: (item: FeedItem, quantity?: number) => void;
    removeFromCart: (id: string) => void;
    setCartQuantity: (id: string, quantity: number) => void;
    clearCart: () => void;
    removeCartItems: (ids: string[]) => void;
    orderTarget: {
        item: FeedItem;
        quantity: number;
        intent: 'cart';
    } | null;
    shareTarget: FeedItem | null;
    bidTarget: Entry | null;
    closeOrder: () => void;
    closeShare: () => void;
    closeBid: () => void;
    openOrder: (item: FeedItem, quantity?: number) => void;
    openShare: (item: FeedItem) => void;
    openBid: (item: FeedItem, quantity?: number) => void;
    finishConfiguration: (item: FeedItem, quantity: number) => void;
    refreshCart: (id: string) => void;
    resolveCartItem: (item: FeedItem, quantity: number) => FeedItem;
    catalog: FeedItem[];
    offers: FeedItem[];
    instantItem: Entry | null;
    closeInstant: () => void;
    reshareTarget: FeedItem | null;
    openReshare: (item: FeedItem) => void;
    closeReshare: () => void;
    publishReshare: (item: FeedItem, priceKobo: number) => FeedItem | null;
};
const Context = createContext<State | null>(null);
export function FeedProvider({ children }: {
    children: ReactNode;
}) {
    const router = useRouter();
    const liveState = useLive();
    const { user, isLoading } = useAuth();
    const live = useRemoteFeed(!FRONTEND_PREVIEW, user?.id, !isLoading);
    const market = useMarketplace();
    const account = useAccount();
    const social = useCommunity();
    const [purchaseTarget, setPurchaseTarget] = useState<PurchaseTarget | null>(null);
    const orderTarget: State['orderTarget'] = purchaseTarget?.kind === 'quantity' ? { item: purchaseTarget.item, quantity: purchaseTarget.quantity, intent: 'cart' } : null;
    const bidTarget: Entry | null = purchaseTarget?.kind === 'offer' ? { item: purchaseTarget.item, quantity: purchaseTarget.quantity } : null;
    const [shareTarget, setShareTarget] = useState<FeedItem | null>(null);
    const [liked, setLiked] = useState<string[]>([]);
    const [saved, setSaved] = useState<string[]>([]);
    const followed = FRONTEND_PREVIEW ? social.following : live.items.filter(p=>p.remote?.viewerFollowing).map(p=>p.remote!.authorId);
    const savedQuery=useServerQuery(()=>api.saved.list(),'feed-saved',!FRONTEND_PREVIEW&&!!user);
    const [reshared, setReshared] = useState<string[]>([]);
    const [shared, setShared] = useState<Record<string, number>>({});
    const cartRecord = useLocalRecord('gleenc:cart:v13:' + (user?.id ?? 'demo-buyer'), () => ({ ownerId: user?.id ?? 'demo-buyer', cart: [] as Entry[] }), v => restoreCart(v, user?.id ?? 'demo-buyer'));
    const serverCart=useServerQuery(()=>api.cart.list(),'feed-cart',!FRONTEND_PREVIEW&&!!user);
    const cart = FRONTEND_PREVIEW ? cartRecord.value.cart : (serverCart.data||[]).map(row=>{const item=mapRemotePost({id:row.lineId,product:row.product,author:{id:row.product.ownerId,name:row.product.storeName},originalOwner:{id:row.product.ownerId,name:row.product.storeName},createdAt:new Date().toISOString(),counts:{}});return item?{item,quantity:row.quantity}:null;}).filter((row):row is Entry=>row!==null);
    const setCart = (update: Entry[] | ((cart: Entry[]) => Entry[])) => cartRecord.commit(s => ({ ...s, cart: typeof update === 'function' ? update(s.cart) : update }));
    const offers = FRONTEND_PREVIEW ? market.reshares : [];
    const [instantId, setInstantId] = useState<string | null>(null);
    const [reshareTarget, setReshareTarget] = useState<FeedItem | null>(null);
    useEffect(() => {
        setLiked([]);
        setSaved([]);
        setReshared([]);
        setShared({});
        setInstantId(null);
        setReshareTarget(null);
        setPurchaseTarget(null);
        setShareTarget(null);
    }, [user?.id]);
    const showIntegrationNotice = () => Alert.alert('Product unavailable', 'Refresh the feed and try this product again.');
    const requireAccount = (action: () => void) => {
        if (!user && !FRONTEND_PREVIEW) {
            router.push('/login');
            return;
        }
        if (!FRONTEND_PREVIEW) { void liveState.ensure().then(ok => {if(ok)action();}); return; }
        action();
    };
    const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id];
    const toggleLike = (id: string) => {
        const item=live.items.find(p=>p.id===id);
        if (!FRONTEND_PREVIEW && item?.remote) {void liveState.perform(()=>api.products.like(item.remote!.productId,!item.remote!.viewerLiked)).then(()=>live.refresh()).catch(()=>undefined);return;}
        requireAccount(() => setLiked(prev => toggle(prev,id)));
    };
    const toggleSave = (id: string) => {const item=live.items.find(p=>p.id===id);if(!FRONTEND_PREVIEW&&item?.remote){void liveState.perform(()=>api.saved.set(item.remote!.productId,!saved.includes(id)),{verified:false,terms:false}).then(result=>{if(result)setSaved(prev=>toggle(prev,id));}).catch(()=>undefined);return;}requireAccount(()=>setSaved(prev=>toggle(prev,id)));};
    const toggleReshare = (id: string) => {if(!FRONTEND_PREVIEW){const item=live.items.find(p=>p.id===id);if(item)openReshare(item);return;}requireAccount(() => setReshared(prev => toggle(prev,id)));};
    const recordShare = (id: string) => {
        if (!FRONTEND_PREVIEW) return;
        setShared(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
        social.track(id, 'share');
    };
    const toggleFollow = (store: string) => {
      if(!FRONTEND_PREVIEW){const item=live.items.find(p=>p.store===store||p.remote?.authorId===store);if(item?.remote)void liveState.perform(()=>api.people.follow(item.remote!.authorId,!item.remote!.viewerFollowing)).then(()=>live.refresh()).catch(()=>undefined);return;}
      requireAccount(() => {
        try {
            social.toggleFollow(store);
        }
        catch (e) {
            Alert.alert('Following unavailable', e instanceof Error ? e.message : 'Try again.');
        }
      });
    };
    const addRaw = (item: FeedItem, quantity = 1) => requireAccount(() => {
        if (item.stock < 1) {
            Alert.alert('Sold out', 'This product is currently unavailable.');
            return;
        }
        if (!Number.isSafeInteger(quantity) || quantity < 1)
            return;
        setCart(prev => {
            const match = prev.find(x => x.item.id === item.id);
            if (!match)
                return [...prev, { item, quantity: Math.min(quantity, item.productType === 'digital' ? 1 : item.stock) }];
            return prev.map(x => x.item.id === item.id ? { ...x, quantity: Math.min(item.productType === 'digital' ? 1 : item.stock, x.quantity + quantity) } : x);
        });
        setInstantId(item.id);
    });
    const removeFromCart = (id: string) => setCart(prev => prev.filter(x => x.item.id !== id));
    const setCartQuantity = (id: string, quantity: number) => {
        if (!Number.isSafeInteger(quantity))
            return;
        setCart(prev => prev.map(row => row.item.id === id ? { ...row, quantity: Math.max(1, Math.min(row.item.productType === 'digital' ? 1 : row.item.stock, Math.floor(quantity))) } : row));
    };
    const clearCart = () => setCart([]);
    const removeCartItems = (ids: string[]) => setCart(previous => previous.filter(row => !ids.includes(row.item.id)));
    const openReshare = (item: FeedItem) => requireAccount(() => setReshareTarget(item));
    const closeReshare = () => setReshareTarget(null);
    const closeInstant = () => setInstantId(null);
    const publishReshare = (item: FeedItem, priceKobo: number) => {
        if (!user && !FRONTEND_PREVIEW) {
            router.push('/login');
            return null;
        }
        if (!FRONTEND_PREVIEW) { showIntegrationNotice(); return null; }
        const original = catalog.find(product => product.id === (item.offer?.originalProductId ?? item.id)) ?? item;
        social.assertPosting();
        const offer = makeReshare(original, priceKobo, FRONTEND_PREVIEW ? 'demo-promoter' : user?.id ?? 'demo-promoter', user?.profile?.displayName || user?.name || 'You', secureId('RS'));
        market.saveReshare(offer);
        setReshared(previous => previous.includes(original.id) ? previous : [...previous, original.id]);
        social.track(original.id, 'reshare');
        closeReshare();
        return offer;
    };
    useEffect(()=>{if(!FRONTEND_PREVIEW&&savedQuery.data){const ids=new Set(savedQuery.data.map(p=>p.id));setSaved(live.items.filter(p=>p.remote&&ids.has(p.remote.productId)).map(p=>p.id));}},[savedQuery.data,live.items]);
    const seeded = FEED.map((item, index) => item.store === 'Movers' && index < 4 ? { ...item, catalogueId: index % 2 ? 'movers-pack' : 'movers-menu' } : item);
    const catalog = !FRONTEND_PREVIEW ? live.items : [...offers, ...market.posts, ...seeded, ...market.definitions.filter(d => !d.hidden).map(cataloguePost)].map(market.resolve).filter(item => (!item.listingStatus || item.listingStatus === 'active') && !account.isBlocked(item.store));
    const closePurchase = () => setPurchaseTarget(null);
    const closeOrder = () => setPurchaseTarget(previous => previous?.kind === 'quantity' ? null : previous);
    const closeBid = () => setPurchaseTarget(previous => previous?.kind === 'offer' ? null : previous);
    const closeShare = () => setShareTarget(null);
    const openShare = (item: FeedItem) => {
        setPurchaseTarget(null);
        setInstantId(null);
        setShareTarget(item);
    };
    const openPurchase = (kind: PurchaseIntent, item: FeedItem, quantity = 1) => requireAccount(() => {
        if (item.remote) { setPurchaseTarget({kind,item,quantity});return; }
        try {
            if (kind !== 'offer' && kind !== 'quantity')
                throw new Error('Choose a valid purchase action.');
            if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > item.stock)
                throw new Error('Choose an available quantity.');
            if (kind === 'offer' && item.plan?.allowOffers === false)
                throw new Error('This seller is not accepting price offers.');
            // A single discriminated target keeps price negotiation and quantities
            // separate. Image/video presentation has no effect on this dispatch.
            const target = kind === 'offer' && item.plan && !item.config
                ? configure(item, minimumSelections(item.plan), quantity)
                : item;
            setShareTarget(null);
            setInstantId(null);
            setReshareTarget(null);
            setPurchaseTarget({ kind, item: target, quantity });
        }
        catch (e) {
            Alert.alert('Review your selection', e instanceof Error ? e.message : 'Try again.');
        }
    });
    // Existing details/menu pages can keep their public method names.
    const openBid = (item: FeedItem, quantity = 1) => openPurchase('offer', item, quantity);
    const openOrder = (item: FeedItem, quantity = 1) => openPurchase('quantity', item, quantity);
    const addToCart = (item: FeedItem, quantity = 1) => {
        if (item.remote) {openPurchase('quantity',item,quantity);return;}
        if (item.productType === 'digital')
            quantity = 1;
        if (item.plan?.components.length && !item.config)
            openPurchase('quantity', item, quantity);
        else {
            try {
                closePurchase();
                addRaw(item.plan && !item.config ? configure(item, {}, quantity) : item, quantity);
            }
            catch (e) {
                Alert.alert('Review your order', e instanceof Error ? e.message : 'Try again.');
            }
        }
    };
    const finishConfiguration = (item: FeedItem, quantity: number) => {
        // Completing a quantity selection always adds to cart; it never negotiates.
        if (purchaseTarget?.kind !== 'quantity')
            return;
        closePurchase();
        addRaw(item, quantity);
    };
    const resolveCartItem = (item: FeedItem, quantity: number) => {
        let source = catalog.find(p => p.id === (item.config?.postId ?? item.id));
        if (!source && item.offer) {
            const original = catalog.find(p => p.id === item.offer!.originalProductId);
            if (original)
                source = { ...original, id: item.config?.postId ?? item.id, offer: item.offer };
        }
        if (!source)
            throw new Error('This product is no longer available.');
        return item.config ? configure(source, Object.fromEntries(item.config.selections.map(c => [c.id, c.quantity])), quantity) : source;
    };
    const refreshCart = (id: string) => {
        const row = cart.find(c => c.item.id === id);
        if (!row)
            return;
        try {
            const updated = resolveCartItem(row.item, row.quantity);
            setCart(prev => prev.map(c => c.item.id === id ? { ...c, item: updated } : c));
        }
        catch (e) {
            Alert.alert('Unable to update', e instanceof Error ? e.message : 'Try again.');
        }
    };
    const instantItem = cart.find(row => row.item.id === instantId) ?? null;
    return <Context.Provider value={{ feedLoading: live.loading || isLoading, feedLoadingMore: live.loadingMore, feedError: live.error,
      refreshFeed: live.refresh, loadMoreFeed: live.loadMore, setFeedMode: live.setMode, showIntegrationNotice,
      purchaseApiVersion: PURCHASE_API_VERSION, purchaseTarget, openPurchase, closePurchase, liked, saved, followed, reshared, shared, cart, cartReady: cartRecord.ready, cartNotice: cartRecord.notice, retryCart: cartRecord.retrySave, requireAccount, toggleLike, toggleSave, toggleReshare, recordShare, toggleFollow, addToCart, removeFromCart, setCartQuantity, clearCart, removeCartItems, catalog, offers, orderTarget, shareTarget, bidTarget, closeOrder, closeShare, closeBid, openShare, openBid, openOrder, finishConfiguration, resolveCartItem, refreshCart, instantItem, closeInstant, reshareTarget, openReshare, closeReshare, publishReshare }}>{children}</Context.Provider>;
}
export function useFeedState() {
    const state = useContext(Context);
    if (!state)
        throw new Error('FeedProvider is missing');
    return state;
}
