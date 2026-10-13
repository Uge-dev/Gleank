import { requireOptionalNativeModule } from 'expo-modules-core';
import { useAccount } from '@/features/account/account-state';
import { CommunityConsent } from '@/features/community/terms';
import { useCommunity } from '@/features/community/community-state';
import { useState, type ReactNode } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useRouter } from 'expo-router';
import { useFeedState } from '@/features/feed/feed-state';
import { useChat, sellerAvatar } from '@/features/chat/chat-state';
import { FEED, formatPrice, type FeedItem } from '@/features/feed/data';
import { Field } from '@/features/create/controls';
import { configure, minimumSelections, quoteSplit, offerMinimumPercent, offerPrice, defaultPlan, integer } from './domain';
import { useMarketplace } from './marketplace-state';
import { Box, Button, PercentSlider, Stepper } from './ui';
function failure(error: unknown) {
    Alert.alert('Review your selection', error instanceof Error ? error.message : 'Try again.');
}
export function Sheet({ visible, title, onClose, children }: {
    visible: boolean;
    title: string;
    onClose: () => void;
    children: ReactNode;
}) {
    const { colors } = useAppTheme();
    const safe = useSafeAreaInsets();
    return <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.55)', justifyContent: 'flex-end' }}><Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose}/><View style={{ maxHeight: '92%', backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: Math.max(safe.bottom, 14) + 10, gap: 14 }}><View style={{ width: 38, height: 4, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center' }}/><View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><GText weight="bold" style={{ fontSize: 22 }}>{title}</GText><Pressable accessibilityLabel="Close" onPress={onClose} style={{ minWidth: 42, minHeight: 42, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={23} color={colors.text}/></Pressable></View>{children}</View></KeyboardAvoidingView></Modal>;
}
export function MarketplaceSheets() {
    const feed = useFeedState();
    const target = feed.purchaseTarget;
    const sharing = !target && !!feed.shareTarget;
    const title = target?.kind === 'offer' ? 'Make a private offer' : target?.kind === 'quantity' ? 'Choose quantity' : 'Send this post';
    // One native modal swaps its content when a buyer switches between these
    // actions, so iOS does not need to present a second modal over the first.
    return <Sheet visible={!!target || sharing} title={title} onClose={sharing ? feed.closeShare : feed.closePurchase}>
      {target?.kind === 'offer' ? <OfferBuilder key={'offer:' + target.item.id + ':' + target.quantity} item={target.item} quantity={target.quantity}/>
            : target?.kind === 'quantity' ? <OrderBuilder key={'quantity:' + target.item.id + ':' + target.quantity} item={target.item} initialQuantity={target.quantity} onComplete={feed.finishConfiguration}/>
                : feed.shareTarget ? <ShareBuilder item={feed.shareTarget}/> : null}
    </Sheet>;
}
export function OrderBuilder({ item, initialQuantity = 1, onComplete }: {
    item: FeedItem;
    initialQuantity?: number;
    onComplete: (item: FeedItem, quantity: number) => void;
}) {
    const { colors } = useAppTheme();
    const { openBid } = useFeedState();
    const plan = item.plan ?? { ...defaultPlan(), baseKobo: item.priceKobo, stock: item.stock };
    const [packs, setPacks] = useState(initialQuantity);
    const [chosen, setChosen] = useState<Record<string, number>>(() => {
        try {
            return item.config ? Object.fromEntries(item.config.selections.map(c => [c.id, c.quantity])) : plan ? minimumSelections(plan) : {};
        }
        catch {
            return {};
        }
    });
    const [expanded, setExpanded] = useState<string[]>(plan?.groups.map(g => g.name) ?? []);
    let configured: FeedItem | undefined;
    let error = '';
    try {
        integer(packs, 1, item.stock, 'quantity');
        configured = configure(item, chosen, packs);
    }
    catch (e) {
        error = e instanceof Error ? e.message : 'Review your order.';
    }
    if (!plan)
        return null;
    return <><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 15, paddingBottom: 8 }}><GText weight="bold">{item.name}</GText><GText tone="muted">Sold by {item.store} · Building one {plan.unit}</GText>{plan.baseKobo > 0 ? <Box><GText weight="bold">Base {plan.unit} · {formatPrice(plan.baseKobo)}</GText><GText tone="muted">{plan.ingredients}</GText></Box> : null}{plan.preparation || plan.hours ? <GText tone="muted">{plan.preparation} · {plan.hours}</GText> : null}
 {plan.groups.map(group => <Box key={group.name}><Pressable onPress={() => setExpanded(v => v.includes(group.name) ? v.filter(n => n !== group.name) : [...v, group.name])} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><GText weight="bold">{group.name}</GText><Ionicons name={expanded.includes(group.name) ? 'chevron-up' : 'chevron-down'} size={19} color={colors.text}/></Pressable><GText tone="muted">Choose {group.min}–{group.max} units</GText>{expanded.includes(group.name) ? plan.components.filter(c => c.group === group.name).map(c => <View key={c.id} style={{ gap: 7, paddingVertical: 7, borderTopWidth: 1, borderColor: colors.border }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>{c.image ? <Image source={{ uri: c.image }} style={{ width: 43, height: 43, borderRadius: 10 }}/> : null}<View style={{ flex: 1 }}><GText weight="bold">{c.name}</GText><GText tone="muted" style={{ fontSize: 12 }}>{formatPrice(c.priceKobo + Math.floor(c.priceKobo * (item.offer?.markupPercent ?? 0) / 100))} / {c.unit}</GText></View>{c.available ? <Stepper value={chosen[c.id] ?? 0} min={c.min} max={Math.min(c.max, Math.floor(c.stock / packs))} onChange={n => setChosen(v => ({ ...v, [c.id]: n }))}/> : <GText tone="muted">Sold out</GText>}</View><GText tone="muted" style={{ fontSize: 11 }}>{c.description}</GText></View>) : null}</Box>)}
 {plan.allergens ? <GText tone="muted">Allergens: {plan.allergens}</GText> : null}<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><GText weight="bold">Identical {plan.unit}s</GText><Stepper value={packs} min={1} max={plan.stock} onChange={setPacks}/></View>{plan.packagingKobo ? <GText tone="muted">Packaging {formatPrice(plan.packagingKobo)} per {plan.unit}. Delivery is calculated at checkout.</GText> : null}{error ? <GText tone="red">{error}</GText> : null}</ScrollView><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><GText tone="muted">Product total</GText><GText weight="bold" style={{ fontSize: 24 }}>{configured ? formatPrice(configured.priceKobo * packs) : '—'}</GText></View><Button title="Continue with these items" disabled={!configured} onPress={() => {
            if (configured)
                onComplete(configured, packs);
        }}/>{item.plan?.allowOffers !== false ? <Button secondary title="Make offer for these quantities" disabled={!configured} onPress={() => {
                if (configured)
                    openBid(configured, packs);
            }}/> : null}</>;
}
export function OfferBuilder({ item, quantity }: {
    item: FeedItem;
    quantity: number;
}) {
    const { requestOffer, quotes, buyerId } = useMarketplace();
    const { closeBid, openOrder } = useFeedState();
    const router = useRouter();
    const existing = quotes.find(q => q.buyerId === buyerId && q.item.id === item.id && q.quantity === quantity && q.expiresAt > Date.now() && ['pending', 'counter', 'accepted'].includes(q.state));
    const min = offerMinimumPercent(item.plan);
    const [percent, setPercent] = useState(Math.max(min, 90));
    const [note, setNote] = useState('');
    const price = offerPrice(item, percent);
    let split: ReturnType<typeof quoteSplit> | undefined;
    try {
        split = quoteSplit(item, price);
    }
    catch {
    }
    return <><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 17 }}><GText weight="bold">{quantity} × {item.name}</GText>{item.config?.selections.map(c => <GText key={c.id} tone="muted">{c.name}: {c.quantity} {c.unit} per pack</GText>)}<GText tone="muted">Listed total {formatPrice(item.priceKobo * quantity)} · Original seller {item.store}</GText><GText weight="bold" style={{ fontSize: 32 }}>{formatPrice(price * quantity)}</GText><GText tone="muted">Your offer · {100 - percent}% below asking price · maximum 20% off</GText>{item.plan?.components.length ? <Box><GText weight="bold">Offer for the listed configuration</GText><GText tone="muted">The items above are included in this price. Want different portions, extras or variants?</GText><Button secondary title="Choose quantities first" onPress={() => openOrder(item, quantity)}/></Box> : null}<PercentSlider value={percent} onChange={setPercent} min={min}/><View style={{ flexDirection: 'row', gap: 8 }}>{[95, 90, 80].filter(n => n >= min).map(n => <Button key={n} secondary title={(100 - n) + '% off'} onPress={() => setPercent(n)}/>)}</View><Stepper min={min} max={100} value={percent} onChange={setPercent}/>{split && item.offer ? <Box><GText>Seller receives {formatPrice(split.sellerKobo * quantity)}</GText><GText>Resharer receives {formatPrice(split.commissionKobo * quantity)}</GText></Box> : null}<Field label="Optional note" value={note} onChange={setNote} multiline/><GText tone="muted">Only the original seller can approve this price. Delivery is separate. An accepted offer applies to you and these exact items.</GText></ScrollView><Button title={existing ? "View your active offer" : "Send offer to seller"} disabled={!split || item.plan?.allowOffers === false} onPress={() => {
            try {
                const q = existing ?? requestOffer(item, quantity, percent, note);
                closeBid();
                router.push({ pathname: '/offer', params: { id: q.id } });
            }
            catch (e) {
                failure(e);
            }
        }}/></>;
}
function ShareBuilder({ item }: {
    item: FeedItem;
}) {
    const { colors } = useAppTheme();
    const { conversations, shareProducts } = useChat();
    const account = useAccount();
    const community = useCommunity();
    const { recordShare, closeShare } = useFeedState();
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const contacts = [...new Set([...conversations.map(c => c.seller), ...FEED.map(p => p.store)])].filter(name => !account.isBlocked(name) && name.toLowerCase().includes(query.toLowerCase()));
    const link = Linking.createURL('/product', { queryParams: { id: item.config?.postId ?? item.id } });
    const external = async () => {
        if (busy)
            return;
        setBusy(true);
        try {
            const r = await Share.share({ message: item.name + ' · ' + formatPrice(item.priceKobo) + '\n' + link });
            if (r.action === Share.sharedAction)
                recordShare(item.id);
        }
        catch (e) {
            failure(e);
        }
        finally {
            setBusy(false);
        }
    };
    return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 15 }}><View style={{ flexDirection: 'row', gap: 11, alignItems: 'center' }}><Image source={{ uri: item.image }} style={{ width: 59, height: 59, borderRadius: 12 }}/><View style={{ flex: 1 }}><GText weight="bold">{item.name}</GText><GText tone="muted">{item.store} · {formatPrice(item.priceKobo)}</GText></View></View><Field label="Find a conversation" value={query} onChange={setQuery}/><View style={{ gap: 7 }}>{contacts.map(name => <Pressable key={name} onPress={() => setSelected(v => v.includes(name) ? v.filter(x => x !== name) : [...v, name])} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 55 }}><Image source={{ uri: sellerAvatar(name) }} style={{ width: 41, height: 41, borderRadius: 21 }}/><GText weight="bold" style={{ flex: 1 }}>{name}</GText><Ionicons name={selected.includes(name) ? 'checkbox' : 'square-outline'} size={24} color={selected.includes(name) ? colors.success : colors.textMuted}/></Pressable>)}</View><Field label="Add a message" value={note} onChange={setNote}/><CommunityConsent /><Button title={'Send to ' + selected.length + ' conversation' + (selected.length === 1 ? '' : 's')} disabled={!selected.length || busy || !community.accepted || selected.length > 20} onPress={() => {
            try {
                shareProducts(selected, item, note);
                recordShare(item.id);
                closeShare();
            }
            catch (e) {
                failure(e);
            }
        }}/><Button secondary title="Share to other apps" disabled={busy} onPress={() => void external()}/><Button secondary title="Copy product link" onPress={async () => {
            try {
                if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoClipboard'))
                    throw new Error('Clipboard is missing from this installed build.');
                const clipboard = require('expo-clipboard');
                await clipboard.setStringAsync(link);
                Alert.alert('Link copied');
            }
            catch {
                Alert.alert('Copy link', link);
            }
        }}/><GText selectable tone="muted" style={{ fontSize: 11 }}>{link}</GText></ScrollView>;
}
