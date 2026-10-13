import { OrderDetailsPage as ServerScreen } from '@/features/live/orders-wallet';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GText } from '@/components/gleenc/text';
import { useCommerce } from '@/features/commerce/commerce-state';
import { originalSeller, type Phase } from '@/features/commerce/settlement';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { exportOrderLabels } from '@/features/commerce/labels';
import { pickLibrary } from '@/features/media/picker';
import { retainMedia } from '@/features/media/retain-media';
import { explain } from '@/features/account/guards';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { formatPrice } from '@/features/feed/data';
import { Button, Card, Empty, Heading, Notice, Page } from '@/features/studio/ui';
function PreviewOrderDetails() {
    const params = useLocalSearchParams<{
        id: string;
        role?: string;
        sellerId?: string;
    }>(), c = useCommerce(), market = useMarketplace(), router = useRouter();
    const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    const seller = params.role === 'seller', actor = FRONTEND_PREVIEW && seller ? params.sellerId ?? market.ownerId : market.ownerId;
    const order = c.orders.find(o => o.id === params.id && (seller ? o.items.some(r => originalSeller(r) === actor) : o.buyerId === c.buyerId));
    const run = async (fn: () => void | Promise<void>) => {
        if (busy)
            return;
        setBusy(true);
        setNotice('');
        try {
            await fn();
        }
        catch (e) {
            setNotice(explain(e));
        }
        finally {
            setBusy(false);
        }
    };
    if (!order)
        return <Page title="Order details"><Empty title="Order unavailable" detail="Return to your orders and open a record for this account."/></Page>;
    const rows = seller ? order.items.filter(r => originalSeller(r) === actor) : order.items;
    return <Page title={seller ? 'Fulfil order' : 'Order details'} subtitle={order.id}><Notice text={notice || c.storageNotice}/><Card><GText weight="bold">{order.recipient} · {order.phone}</GText>{rows.some(r => r.item.productType !== 'digital') ? <GText tone="muted">{order.fulfillment === 'pickup' ? 'Pickup' : order.address}</GText> : null}{order.note ? <GText tone="muted">{order.note}</GText> : null}{seller && rows.some(r => r.item.productType !== 'digital') ? <Button secondary title={busy ? 'Preparing PDF…' : 'Export delivery labels'} icon="print-outline" disabled={busy} onPress={() => void run(() => exportOrderLabels(order, actor))}/> : null}</Card>
 {rows.map(row => {
            const issue = c.issues.find(i => i.lineId === row.lineId && ['requested', 'return-approved', 'escalated'].includes(i.status));
            const phase = row.phase ?? (row.tickets.every(t => t.status === 'confirmed') ? 'Delivered' : 'Placed');
            const next: Phase | undefined = phase === 'Placed' ? 'Preparing' : phase === 'Preparing' ? (order.fulfillment === 'pickup' ? 'Awaiting confirmation' : 'Dispatched') : phase === 'Dispatched' ? 'Awaiting confirmation' : undefined;
            return <Card key={row.lineId}><View style={{ flexDirection: 'row', gap: 13 }}><Image source={{ uri: row.item.image }} style={{ width: 75, height: 75, borderRadius: 15 }}/><View style={{ flex: 1, gap: 6 }}><GText weight="bold" style={{ fontSize: 18 }}>{row.item.name}</GText><GText tone="muted">{row.quantity} · {phase}</GText><GText weight="bold">{formatPrice(row.item.priceKobo * row.quantity)}</GText></View></View>{row.item.config?.selections.map(s => <GText key={s.id} tone="muted">{s.name}: {s.quantity * row.quantity} {s.unit}</GText>)}<Heading>Progress</Heading>{(row.events ?? [{ at: order.placedAt, title: 'Order placed', actorId: order.buyerId }]).map((ev, i) => <View key={i} style={{ flexDirection: 'row', gap: 12 }}><View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 5, backgroundColor: '#268B65' }}/><View style={{ flex: 1, gap: 4 }}><GText weight="bold">{ev.title}</GText><GText tone="muted" style={{ fontSize: 11 }}>{new Date(ev.at).toLocaleString()}</GText></View></View>)}{row.receipt ? <><GText weight="bold">Transport receipt</GText><Image source={{ uri: row.receipt.uri }} style={{ width: '100%', height: 180, borderRadius: 12 }}/></> : null}
 {seller && row.item.productType !== 'digital' ? row.tickets.filter(t => t.status === 'awaiting').map(t => <Button secondary key={t.id} title={'View unit ' + t.unit + ' QR label'} onPress={() => router.push({ pathname: '/delivery', params: { orderId: order.id, ticketId: t.id, mode: 'seller' } })}/>) : null}
 {seller && row.item.productType !== 'digital' && next ? <><Button title={'Mark ' + next.toLowerCase()} disabled={busy || !!issue} onPress={() => void run(() => c.updateFulfilment(order.id, row.lineId, next, actor))}/>{phase === 'Preparing' && order.fulfillment === 'delivery' ? <Button secondary title="Attach transport receipt & dispatch" disabled={busy || !!issue} onPress={() => void run(async () => {
                            const media = await pickLibrary('images');
                            if (media[0])
                                c.updateFulfilment(order.id, row.lineId, 'Dispatched', actor, { uri: await retainMedia(media[0].uri), name: 'Transport receipt' });
                        })}/> : null}</> : null}
 {!seller && row.item.productType === 'digital' && row.tickets.every(t => t.status === 'confirmed') ? <Button title="Open purchased files" icon="document-outline" onPress={() => router.push('/digital-library')}/> : null}
 {!seller && row.item.productType !== 'digital' ? row.tickets.map(t => <Button key={t.id} secondary title={t.status === 'confirmed' ? 'Unit ' + t.unit + ' received' : t.status === 'refunded' ? 'Unit ' + t.unit + ' refunded' : 'Confirm unit ' + t.unit} disabled={t.status === 'refunded' || !!issue} onPress={() => router.push({ pathname: '/delivery', params: { orderId: order.id, ticketId: t.id, mode: 'buyer' } })}/>) : null}
 {!seller && row.tickets.every(t => t.status === 'confirmed') ? <Button secondary title="Write / read product reviews" icon="star-outline" onPress={() => router.push({ pathname: '/reviews', params: { id: row.item.offer?.originalProductId ?? row.item.config?.postId ?? row.item.id } })}/> : null}
 {issue ? <Button secondary title={'Open ' + issue.kind + ' request'} onPress={() => router.push({ pathname: '/issue', params: { id: issue.id, role: seller ? 'seller' : 'buyer', sellerId: actor } })}/> : !seller && phase !== 'Refunded' ? <Button secondary title="Get help / cancel / return" icon="help-circle-outline" onPress={() => router.push({ pathname: '/issue', params: { orderId: order.id, lineId: row.lineId } })}/> : null}
 </Card>;
        })}{!seller ? <Button secondary title="View / export receipt" icon="receipt-outline" onPress={() => router.push({ pathname: '/receipt', params: { id: order.id } })}/> : null}<Card><GText weight="bold">{seller ? 'Product subtotal' : 'Total paid'} · {formatPrice(seller ? rows.reduce((n, r) => n + r.quantity * r.item.priceKobo, 0) : order.totalKobo)}</GText><GText tone="muted" style={{ fontSize: 12 }}>Physical product earnings release only after the purchasing buyer confirms receipt. Digital purchases unlock access after payment.</GText></Card></Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewOrderDetails/> : <ServerScreen/>;}
