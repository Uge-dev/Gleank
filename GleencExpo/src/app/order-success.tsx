import { FRONTEND_PREVIEW } from '@/config/preview';
import { OrderSuccessPage as ServerScreen } from '@/features/live/purchase';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useCommerce } from '@/features/commerce/commerce-state';
import { formatPrice } from '@/features/feed/data';
function PreviewOrderSuccess() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{
        id: string;
    }>();
    const { colors } = useAppTheme();
    const { orders } = useCommerce();
    const order = orders.find(value => value.id === id);
    return <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}><ScrollView contentContainerStyle={styles.body}>
    <View style={[styles.ring, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name="checkmark" size={47} color={colors.text}/></View>
    <GText weight="bold" style={styles.title}>{order ? 'Order placed' : 'Order details unavailable'}</GText>
    <GText tone="muted" style={styles.intro}>{order ? 'Your original seller receives the order. Physical funds stay held until receipt. Digital files are ready in your purchased downloads.' : 'Return to your orders to see orders placed in this session.'}</GText>
    {order ? <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}><Line title="Order ID" value={order.id}/><Line title="Items" value={String(order.items.reduce((sum, row) => sum + row.quantity, 0))}/><Line title="Receiving" value={order.fulfillment === 'delivery' ? 'Delivery' : 'Pick up'}/><Line title="Payment" value={order.paymentMethod === 'wallet' ? 'Demo wallet' : order.paymentMethod === 'card' ? 'Demo card' : 'Demo bank transfer'}/><View style={[styles.divider, { backgroundColor: colors.border }]}/><Line title="Total" value={formatPrice(order.totalKobo)} strong/></View> : null}
    {order?.items.some(r => r.item.productType === 'digital') ? <Pressable onPress={() => router.push('/digital-library')} style={[styles.primary, { backgroundColor: colors.text, marginBottom: 10 }]}><GText weight="bold" style={{ color: colors.background }}>Open purchased downloads</GText></Pressable> : null}
    {order ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/receipt', params: { id: order.id } })} style={styles.secondary}><GText weight="bold">View / export receipt</GText></Pressable> : null}
    <Pressable onPress={() => router.replace('/orders')} style={[styles.primary, { backgroundColor: colors.text }]}><GText weight="bold" style={{ color: colors.background }}>View your orders</GText><Ionicons name="arrow-forward" size={18} color={colors.background}/></Pressable>
    <Pressable onPress={() => router.replace('/home')} style={styles.secondary}><GText weight="bold">Continue browsing</GText></Pressable>
  </ScrollView></SafeAreaView>;
}
function Line({ title, value, strong }: {
    title: string;
    value: string;
    strong?: boolean;
}) {
    return <View style={styles.line}><GText tone={strong ? 'ink' : 'muted'} weight={strong ? 'bold' : 'medium'}>{title}</GText><GText weight="bold" style={strong ? styles.total : undefined}>{value}</GText></View>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, body: { flexGrow: 1, padding: 22, alignItems: 'center', justifyContent: 'center', maxWidth: 600, width: '100%', alignSelf: 'center' }, ring: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 24 }, title: { fontSize: 30 }, intro: { textAlign: 'center', lineHeight: 22, marginTop: 10, marginBottom: 25 }, card: { width: '100%', padding: 21, borderRadius: 20, borderWidth: 1, gap: 17, marginBottom: 24 }, line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 20 }, divider: { height: 1 }, total: { fontSize: 19 }, primary: { width: '100%', minHeight: 54, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, secondary: { padding: 18, marginTop: 7 } });

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewOrderSuccess/> : <ServerScreen/>;}
