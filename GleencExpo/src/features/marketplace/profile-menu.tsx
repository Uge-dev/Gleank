import { View } from 'react-native';
import { GText } from '@/components/gleenc/text';
import { useMarketplace, cataloguePost } from './marketplace-state';
import { useFeedState } from '@/features/feed/feed-state';
import { useRouter } from 'expo-router';
import { formatPrice } from '@/features/feed/data';
import { Box, Button } from './ui';
export function ProfileMenu({ store, manage = false }: {
    store: string;
    manage?: boolean;
}) { const market = useMarketplace(); const feed = useFeedState(); const router = useRouter(); const entries = market.definitions.filter(d => d.store === store && !d.hidden); return <View style={{ padding: 16, gap: 15 }}><GText weight="bold" style={{ fontSize: 22 }}>Menu & prices</GText>{manage ? <Button secondary title="Manage my reusable prices" onPress={() => router.push({ pathname: '/catalogue', params: { manage: '1' } })}/> : null}{entries.map(d => { const item = market.resolve(cataloguePost(d)); return <Box key={d.id}><GText weight="bold" style={{ fontSize: 19 }}>{d.title}</GText><GText tone="muted">{d.plan.takingOrders ? 'Taking orders' : 'Orders paused'} · {d.plan.preparation}</GText><GText weight="bold">{d.plan.components.length ? 'From ' : ''}{formatPrice(item.priceKobo)} / {d.plan.unit}</GText>{d.plan.components.map(c => <View key={c.id} style={{ flexDirection: 'row', gap: 9 }}><View style={{ flex: 1 }}><GText>{c.name}</GText><GText tone="muted" style={{ fontSize: 11 }}>{c.description || c.unit}</GText></View><GText>{c.available ? formatPrice(c.priceKobo) + ' / ' + c.unit : 'Sold out'}</GText></View>)}<Button title={d.plan.components.length ? 'Build your order' : 'Add to cart'} disabled={!item.stock || !d.plan.takingOrders} onPress={() => feed.addToCart(item)}/></Box>; })}{!entries.length ? <GText tone="muted">{manage ? 'Add reusable prices and link your next image or video upload.' : 'This seller has not published a price catalogue.'}</GText> : null}</View>; }
