import { useState } from 'react';
import { Modal, Share, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/hooks/use-auth';
import { useFeedState } from '@/features/feed/feed-state';
import type { FeedItem } from '@/features/feed/data';
import { api } from '@/services/api';
import { useLive, useServerQuery, rows } from './state';
import { Card, Heading, Button, Input, GText, Action, QueryState, Money, Notice } from './ui';
import { OrderBuilder } from './purchase';
import { pendingKey } from './pending';
function Percent({ value, onChange, max = 20 }: {
    value: number;
    onChange: (v: number) => void;
    max?: number;
}) { const { colors } = useAppTheme(), [width, setWidth] = useState(1); const update = (x: number) => onChange(Math.max(0, Math.min(max, Math.round(x / width * max)))); return <View style={{ gap: 10 }}><GText weight="bold">{value}%</GText><View accessibilityRole="adjustable" accessibilityLabel="Percentage" accessibilityValue={{ min: 0, max, now: value }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => onChange(Math.max(0, Math.min(max, value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))} onLayout={e => setWidth(e.nativeEvent.layout.width)} onStartShouldSetResponder={() => true} onResponderGrant={e => update(e.nativeEvent.locationX)} onResponderMove={e => update(e.nativeEvent.locationX)} style={{ height: 44, justifyContent: 'center' }}><View style={{ height: 8, borderRadius: 5, backgroundColor: colors.border }}><View style={{ height: 8, width: `${value / max * 100}%`, borderRadius: 5, backgroundColor: colors.text }}/></View><View style={{ position: 'absolute', left: `${value / max * 95}%`, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.text }}/></View></View>; }
function OfferComposer({ item, quantity, close }: {
    item: FeedItem;
    quantity: number;
    close: () => void;
}) { const live = useLive(), query = useServerQuery(() => api.products.get(item.remote!.productId), 'offer-product:' + item.id), [discount, setDiscount] = useState(5), [variant, setVariant] = useState(''), [selected, setSelected] = useState<Record<string, number>>({}), [preview, setPreview] = useState<any>(null), [sent, setSent] = useState(false), router = useRouter(); const product = query.data; const components = (product?.ordering?.components || []).map(c => ({ id: c.id, quantity: selected[c.id] ?? c.min ?? 0 })).filter(c => c.quantity > 0); const selection = { productId: item.remote!.productId, postId: item.remote!.postId, quantity, ...(variant ? { variantId: variant } : {}), components }; return <Card><Heading>Make a private offer</Heading><GText>{item.name}</GText><GText>Reduce the price by up to 20%. Only the seller receives your offer. It does not change the public listing.</GText><Percent value={discount} onChange={value => { setPreview(null); setDiscount(value); }}/><GText>Listed price</GText><Money amount={item.priceKobo * quantity}/><GText>Your proposed price is calculated from the selected items by the server.</GText>{preview ? <><Money amount={preview.totalKobo}/><GText tone="muted">Includes the quoted platform fee; delivery is confirmed at checkout.</GText></> : null}<QueryState query={query}>{product?.variants?.map(v => <Button key={v.id} secondary title={(variant === v.id ? '✓ ' : '') + [v.size, v.color].filter(Boolean).join(' · ')} onPress={() => setVariant(v.id)}/>)}</QueryState>{product?.ordering?.components?.map(c => <Input key={c.id} label={`${c.name} (${c.unit})`} value={String(selected[c.id] ?? c.min ?? 0)} onChange={v => { setPreview(null); setSelected(values => ({ ...values, [c.id]: /^\d+$/.test(v) ? Math.min(c.max ?? 99, Number(v)) : 0 })); }} numeric/>)}<Action title="Calculate offer total" secondary run={async () => { const result = await live.perform(() => api.request('/offers/preview', { method: 'POST', body: { ...selection, discountPercent: discount } })); if (result)
    setPreview(result); }}/><Action title={sent ? 'Offer sent' : 'Send offer'} disabled={sent || !product} run={async () => { if (!product)
    return; const result = await live.perform(() => api.offers.create({ productId: item.remote!.productId, postId: item.remote!.postId, quantity, discountPercent: discount, ...(variant ? { variantId: variant } : {}), components })); if (result) {
    setSent(true);
    close();
    router.push({ pathname: '/offer', params: { id: String(result.id) } });
} }}/></Card>; }
function ReshareComposer({ item, close }: {
    item: FeedItem;
    close: () => void;
}) { const live = useLive(), { refreshFeed } = useFeedState(), [percent, setPercent] = useState(10), reference = useServerQuery(() => api.products.get(item.remote!.productId), 'reshare-reference:' + item.id); return <Card><Heading>Reshare and earn</Heading><GText>{item.name}</GText><GText>The original seller fulfils the order. Your commission applies to eligible purchases through your tracked reshare and remains held until release checks complete.</GText><Percent value={percent} onChange={setPercent}/><GText>Maximum markup: 20%</GText><Money amount={(reference.data?.priceKobo || 0) * (1 + percent / 100)}/><Action title="Publish reshare" run={async () => { await live.perform(() => api.posts.reshare(item.remote!.postId, { markupPercent: percent })); await refreshFeed(); close(); }}/></Card>; }
function ShareComposer({ item, close }: {
    item: FeedItem;
    close: () => void;
}) { const {refreshFeed}=useFeedState();const { user } = useAuth(), live = useLive(), threads = useServerQuery(() => api.chat.list({ limit: 100 }), 'share-threads', !!user); return <Card><Heading>Share this product</Heading><GText>Sharing forwards the existing post. It does not change its price or create a commission.</GText><Action title="Share to another app" run={async () => { const base = String(live.capabilities.frontendUrl || ''); const url = new URL(base); if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
    throw new Error('The public sharing address is unavailable.'); url.pathname = '/products/' + encodeURIComponent(item.remote!.productId); url.search = new URLSearchParams({ post: item.remote!.postId }).toString(); const result = await Share.share({ message: item.name + '\n' + url.toString() }); if (result.action === Share.sharedAction && user){await live.perform(() => api.posts.event(item.remote!.postId, 'share'));await refreshFeed();} }}/><QueryState query={threads}>{rows(threads.data).map(t => <Action key={t.id} secondary title={'Send to ' + t.participant.name} run={async () => { if (!user)
    return; const body = { productId: item.remote!.productId, postId: item.remote!.postId }; const pending = await pendingKey(user.id, 'forward:' + t.id, body); const result = await live.perform(() => api.chat.send(t.id, body, pending.key)); if (result) {
    await pending.finish();
    await live.perform(() => api.posts.event(item.remote!.postId, 'share'));await refreshFeed();
    close();
} }}/>)}</QueryState></Card>; }
export function LiveFeedSheets() { const feed = useFeedState(), { colors } = useAppTheme(); const item = feed.purchaseTarget?.item || feed.reshareTarget || feed.shareTarget; const close = () => { feed.closePurchase(); feed.closeReshare(); feed.closeShare(); }; if (!item?.remote)
    return null; return <Modal transparent visible animationType="slide" onRequestClose={close}><View style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }}><View style={{ maxHeight: '92%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 30 }}><Pressable onPress={close} accessibilityLabel="Close product action" style={{ alignSelf: 'flex-end', padding: 10 }}><Ionicons name="close" size={24} color={colors.text}/></Pressable><ScrollView keyboardShouldPersistTaps="handled">{feed.purchaseTarget?.kind === 'quantity' ? <OrderBuilder productId={item.remote.productId} postId={item.remote.postId} initialQuantity={feed.purchaseTarget.quantity} onClose={close}/> : feed.purchaseTarget?.kind === 'offer' ? <OfferComposer item={item} quantity={feed.purchaseTarget.quantity} close={close}/> : feed.reshareTarget ? <ReshareComposer item={item} close={close}/> : <ShareComposer item={item} close={close}/>}</ScrollView></View></View></Modal>; }
