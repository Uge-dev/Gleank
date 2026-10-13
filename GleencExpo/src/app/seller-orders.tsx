import { OrdersPage as ServerScreen } from '@/features/live/orders-wallet';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Image, View } from 'react-native';
import { GText } from '@/components/gleenc/text';
import { useCommerce } from '@/features/commerce/commerce-state';
import { originalSeller } from '@/features/commerce/settlement';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { formatPrice } from '@/features/feed/data';
import { Button, Card, Chips, Picker, Empty, Notice, Page } from '@/features/studio/ui';
function PreviewSellerOrders() {
    const c = useCommerce(), market = useMarketplace(), router = useRouter();
    const owners = [{ id: market.ownerId, name: market.storeName }, ...Array.from(new Map(c.orders.flatMap(o => o.items).map(r => [originalSeller(r), { id: originalSeller(r), name: r.item.store }])).values()).filter(s => s.id !== market.ownerId)];
    const [actor, setActor] = useState(market.ownerId), [filter, setFilter] = useState('Active');
    const orders = c.orders.filter(o => o.items.some(r => originalSeller(r) === actor && (filter === 'All' || filter === 'Completed' ? filter === 'All' || ['Delivered', 'Refunded'].includes(r.phase ?? 'Placed') : !['Delivered', 'Refunded'].includes(r.phase ?? 'Placed'))));
    return <Page title="Seller orders" subtitle="Prepare, dispatch and fulfil purchases from your original listings.">{FRONTEND_PREVIEW ? <Picker items={owners.map(o => ({ id: o.id, title: o.name }))} value={actor} onChange={setActor}/> : null}<Chips items={['Active', 'Completed', 'All']} value={filter} onChange={setFilter}/><Notice text={c.storageNotice}/>{!orders.length ? <Empty title="No orders here yet" detail="Purchase a product from the feed to test its seller fulfilment flow."/> : orders.map(o => <Card key={o.id}><GText weight="bold">{o.recipient}</GText><GText tone="muted" style={{ fontSize: 12 }}>{new Date(o.placedAt).toLocaleString()}</GText>{o.items.filter(r => originalSeller(r) === actor).map(r => <View key={r.lineId} style={{ flexDirection: 'row', gap: 12 }}><Image source={{ uri: r.item.image }} style={{ width: 65, height: 65, borderRadius: 12 }}/><View style={{ flex: 1, gap: 5 }}><GText weight="bold">{r.item.name}</GText><GText tone="muted">{r.quantity} · {r.phase ?? 'Placed'}</GText><GText weight="bold">{formatPrice(r.item.priceKobo * r.quantity)}</GText></View></View>)}<Button title="Manage order" onPress={() => router.push({ pathname: '/order-details', params: { id: o.id, role: 'seller', sellerId: actor } })}/></Card>)}</Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewSellerOrders/> : <ServerScreen sales/>;}
