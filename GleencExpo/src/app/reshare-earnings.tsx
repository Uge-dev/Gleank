import { ReshareEarningsPage as ServerScreen } from '@/features/live/seller-tools';
import { LoadingState } from '@/features/experience/recovery';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useCommerce } from '@/features/commerce/commerce-state';
import { useFeedState } from '@/features/feed/feed-state';
import { useCommunity } from '@/features/community/community-state';
import { useAuth } from '@/hooks/use-auth';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { reshareAnalytics } from '@/features/commerce/reshare-analytics';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatPrice } from '@/features/feed/data';
import { Page, Card, Heading, Chips, Button, Row, Empty } from '@/features/studio/ui';
import { GText } from '@/components/gleenc/text';
function PreviewReshareEarnings() {
    const c = useCommerce(), feed = useFeedState(), social = useCommunity(), { user } = useAuth(), { colors } = useAppTheme(), router = useRouter();
    const [period, setPeriod] = useState('All time');
    const ownerId = FRONTEND_PREVIEW ? 'demo-promoter' : user?.id ?? '';
    const since = period === 'All time' ? 0 : Date.now() - (period === '7 days' ? 7 : 30) * 86400000;
    const data = reshareAnalytics(ownerId, feed.offers, c.orders, c.earnings, c.issues, social.activity, since);
    const max = Math.max(1, ...data.days.map(d => d.amount));
    if (!c.ready || !social.ready)
        return <Page title="Reshare earnings"><LoadingState label="Loading earnings…"/></Page>;
    return <Page title="Reshare earnings" subtitle="Your product recommendations, sales and commission."><Chips items={['7 days', '30 days', 'All time']} value={period} onChange={setPeriod}/><Card><GText tone="muted">NET COMMISSION</GText><GText weight="bold" style={{ fontSize: 37 }}>{formatPrice(data.total.net)}</GText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>{[['Pending', data.total.pending], ['Available', data.total.available], ['Held for review', data.total.held], ['Withdrawn', data.total.withdrawn], ['Refunded', data.total.refunded]].map(([label, value]) => <View key={String(label)} style={{ minWidth: '40%', gap: 5 }}><GText tone="muted" style={{ fontSize: 12 }}>{label}</GText><GText weight="bold">{formatPrice(Number(value))}</GText></View>)}</View><Button title="Open wallet" onPress={() => router.push('/wallet')}/><Button title="Withdraw released earnings" secondary disabled={c.walletSummary(ownerId).availableKobo < 1} onPress={() => router.push({ pathname: '/withdraw', params: { ownerId } })}/></Card>
    <Card><Heading>Last 7 days</Heading><View accessibilityLabel="Commission earned by order date" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9, height: 170 }}>{data.days.map(d => <View key={d.label} style={{ flex: 1, alignItems: 'center', gap: 7 }}><GText style={{ fontSize: 9 }} numberOfLines={1}>{d.amount ? Math.round(d.amount / 100).toLocaleString() : '0'}</GText><View style={{ height: Math.max(3, 110 * d.amount / max), width: '70%', borderRadius: 7, backgroundColor: d.amount ? '#258A65' : colors.border }}/><GText tone="muted" style={{ fontSize: 10 }}>{d.label}</GText></View>)}</View><GText tone="muted" style={{ fontSize: 12 }}>Shows commission by purchase date, excluding refunds.</GText></Card>
    <Card><Heading>Performance</Heading><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>{[['Views', data.total.views], ['Product opens', data.total.opens], ['Orders', data.total.orders], ['Units', data.total.units]].map(([label, value]) => <View key={String(label)} style={{ width: '42%', gap: 6 }}><GText weight="bold" style={{ fontSize: 25 }}>{value}</GText><GText tone="muted">{label}</GText></View>)}</View><GText tone="muted" style={{ fontSize: 12 }}>Views and opens are measured on this device, once per post per session. Account-wide attribution needs server analytics.</GText></Card>
    <Heading>Product breakdown</Heading>{data.groups.length ? data.groups.map(g => <Card key={g.id}><View style={{ flexDirection: 'row', gap: 12 }}><Image source={{ uri: g.item.image }} style={{ width: 62, height: 62, borderRadius: 14 }}/><View style={{ flex: 1, gap: 5 }}><GText weight="bold">{g.item.name}</GText><GText tone="muted">{g.item.store} · {g.item.offer?.markupPercent ?? 0}% increase</GText><GText weight="bold">{formatPrice(g.net)} commission</GText></View></View><GText>{g.views} views · {g.opens} opens · {g.orders} orders · {g.units} units</GText><GText tone="muted">Pending {formatPrice(g.pending)} · Released {formatPrice(g.available)}</GText><Row title="Open reshared product" icon="open-outline" onPress={() => router.push({ pathname: '/product', params: { id: g.id } })}/></Card>) : <Empty title="Start earning from reshares" detail="Reshare a product with an increase of up to 20%. Commission stays pending until delivery is confirmed." icon="repeat"/>}
  </Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewReshareEarnings/> : <ServerScreen/>;}
