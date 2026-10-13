import { FRONTEND_PREVIEW } from '@/config/preview';
import { ReceiptPage as ServerScreen } from '@/features/live/orders-wallet';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCommerce } from '@/features/commerce/commerce-state';
import { Page, Card, Heading, Button, Empty } from '@/features/studio/ui';
import { GText } from '@/components/gleenc/text';
import { formatPrice } from '@/features/feed/data';
import { exportReceipt } from '@/features/payments/receipt';
import { explain } from '@/features/account/guards';
function PreviewReceipt() {
    const { id } = useLocalSearchParams<{
        id?: string;
    }>();
    const c = useCommerce();
    const router = useRouter();
    const order = c.orders.find(o => o.id === id && o.buyerId === c.buyerId);
    if (!order)
        return <Page title="Receipt"><Empty title={c.ready ? 'Receipt unavailable' : 'Loading receipt…'} detail="Only the purchasing account can view this receipt."/></Page>;
    return <Page title="Purchase receipt"><Card><Heading>GLEENC</Heading><GText weight="bold" selectable>{order.id}</GText><GText tone="muted">{new Date(order.placedAt).toLocaleString()}</GText><GText>{order.recipient}</GText>{order.items.map(row => <View key={row.lineId} style={{ gap: 6, paddingVertical: 12 }}><GText weight="bold">{row.quantity} × {row.item.name}</GText><GText tone="muted">Original seller · {row.item.store}</GText><GText>{formatPrice(row.item.priceKobo * row.quantity)}</GText>{row.item.offer ? <GText tone="muted">Included commission · {formatPrice(row.item.offer.commissionKobo * row.quantity)}</GText> : null}</View>)}<GText>Delivery · {formatPrice(order.deliveryKobo)}</GText><Heading>Total · {formatPrice(order.totalKobo)}</Heading><GText tone="muted">{order.paymentMethod} · {order.status}</GText>{order.paymentAttemptId ? <GText selectable tone="muted">Reference · {order.paymentAttemptId}</GText> : null}<GText tone="muted">Test receipt. No real payment was collected.</GText></Card><Button title="Export PDF receipt" icon="share-outline" onPress={() => void exportReceipt(order).catch(e => Alert.alert('Receipt unavailable', explain(e)))}/><Button title="Open order" secondary onPress={() => router.push({ pathname: '/order-details', params: { id: order.id } })}/></Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewReceipt/> : <ServerScreen/>;}
