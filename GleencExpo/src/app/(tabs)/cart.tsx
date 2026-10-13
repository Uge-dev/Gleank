import { FRONTEND_PREVIEW } from '@/config/preview';
import { CartPage as ServerScreen } from '@/features/live/purchase';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useFeedState } from '@/features/feed/feed-state';
import { formatPrice } from '@/features/feed/data';
function PreviewCart() {
    const router = useRouter();
    const { colors } = useAppTheme();
    const { width } = useWindowDimensions();
    const compact = width < 380;
    const { cart, cartReady, cartNotice, retryCart, removeFromCart, setCartQuantity, resolveCartItem, refreshCart } = useFeedState();
    const [selectedIds, setSelectedIds] = useState<string[]>(() => cart.map(row => row.item.id));
    const cartIds = cart.map(row => row.item.id).join('|');
    useEffect(() => {
        setSelectedIds(previous => previous.filter(id => cart.some(row => row.item.id === id)));
    }, [cartIds]);
    const selected = cart.filter(row => selectedIds.includes(row.item.id));
    const subtotal = selected.reduce((sum, row) => sum + row.item.priceKobo * row.quantity, 0);
    const toggle = (id: string) => setSelectedIds(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
    return <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.icon} accessibilityLabel="Go back"><Ionicons name="arrow-back" size={24} color={colors.text}/></Pressable><GText weight="bold" style={styles.title}>Your bag</GText><Pressable onPress={() => router.push('/wallet')} style={styles.icon} accessibilityLabel="Wallet"><Ionicons name="wallet-outline" size={23} color={colors.text}/></Pressable></View>
    {!cartReady ? <GText style={{ padding: 18 }}>Loading your bag…</GText> : null}{cartNotice ? <Pressable onPress={() => void retryCart()} style={{ padding: 18 }}><GText tone="red">{cartNotice} Tap to retry.</GText></Pressable> : null}
    {!cart.length ? <View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name="bag-handle-outline" size={42} color={colors.text}/></View><GText weight="bold" style={styles.emptyTitle}>Your bag is waiting</GText><GText tone="muted" style={styles.emptyCopy}>Find something you love and it will appear here.</GText><Pressable onPress={() => router.push('/home')} style={[styles.button, { backgroundColor: colors.text }]}><GText style={{ color: colors.background }} weight="bold">Discover products</GText><Ionicons name="arrow-forward" size={18} color={colors.background}/></Pressable></View> : <>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={selectionStyles.selectHeader}><GText tone="muted" style={styles.caption}>{selected.length} of {cart.length} {cart.length === 1 ? 'product' : 'products'} selected</GText><Pressable accessibilityRole="button" onPress={() => setSelectedIds(selected.length === cart.length ? [] : cart.map(row => row.item.id))}><GText weight="bold" style={{ color: colors.primary }}>{selected.length === cart.length ? 'Clear selection' : 'Select all'}</GText></Pressable></View>
        {cart.map(row => <View key={row.item.id} style={[styles.card, compact && { gap: 8 }, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: selectedIds.includes(row.item.id) }} accessibilityLabel={`Select ${row.item.name} for checkout`} onPress={() => toggle(row.item.id)} style={[selectionStyles.checkbox, { borderColor: selectedIds.includes(row.item.id) ? colors.primary : colors.border, backgroundColor: selectedIds.includes(row.item.id) ? colors.primary : colors.surface }]}>{selectedIds.includes(row.item.id) ? <Ionicons name="checkmark" size={16} color="#fff"/> : null}</Pressable>
          <Pressable onPress={() => router.push({ pathname: '/product', params: { id: row.item.config?.postId ?? row.item.id } })}><Image source={{ uri: row.item.image }} style={[styles.photo, compact && { width: 76, height: 115 }]}/></Pressable>
          <View style={styles.cardContent}><GText tone="muted" style={styles.store}>{row.item.store}</GText>{row.item.offer ? <GText tone="muted" style={styles.store}>Reshared by {row.item.offer.promoterName}</GText> : null}<Pressable onPress={() => router.push({ pathname: '/product', params: { id: row.item.config?.postId ?? row.item.id } })}><GText weight="bold" numberOfLines={2} style={styles.productName}>{row.item.name}</GText></Pressable><GText weight="bold" style={styles.price}>{formatPrice(row.item.priceKobo * row.quantity)}</GText>
            {row.item.config?.selections.map(c => <GText key={c.id} tone="muted" style={styles.store}>{c.quantity} {c.unit} {c.name} per pack</GText>)}
            {(() => {
                    try {
                        const live = resolveCartItem(row.item, row.quantity);
                        return live.priceKobo !== row.item.priceKobo || live.priceVersion !== row.item.priceVersion ? <Pressable onPress={() => refreshCart(row.item.id)} style={{ minHeight: 42 }}><GText tone="red">Price updated · review {formatPrice(live.priceKobo)} / pack</GText></Pressable> : null;
                    }
                    catch (e) {
                        return <GText tone="red">{e instanceof Error ? e.message : 'Unavailable'}</GText>;
                    }
                })()}
            <View style={styles.rowBottom}><View style={[styles.stepper, { borderColor: colors.border }]}><Pressable accessibilityLabel={`Decrease ${row.item.name} quantity`} onPress={() => row.quantity === 1 ? removeFromCart(row.item.id) : setCartQuantity(row.item.id, row.quantity - 1)} style={styles.step}><Ionicons name="remove" size={19} color={colors.text}/></Pressable><GText weight="bold" style={styles.qty}>{row.quantity}</GText><Pressable accessibilityLabel={`Increase ${row.item.name} quantity`} disabled={row.quantity >= row.item.stock} onPress={() => setCartQuantity(row.item.id, row.quantity + 1)} style={styles.step}><Ionicons name="add" size={19} color={row.quantity >= row.item.stock ? colors.textMuted : colors.text}/></Pressable></View><Pressable onPress={() => removeFromCart(row.item.id)} accessibilityLabel={`Remove ${row.item.name}`} style={styles.remove}><Ionicons name="trash-outline" size={20} color={colors.textMuted}/></Pressable></View>
          </View>
        </View>)}
        <View style={[styles.summary, { backgroundColor: colors.surfaceSecondary }]}><GText weight="bold" style={styles.sectionTitle}>Selected products</GText><View style={styles.summaryLine}><GText tone="muted">{selected.length} {selected.length === 1 ? 'product' : 'products'}</GText><GText weight="bold">{formatPrice(subtotal)}</GText></View><View style={styles.summaryLine}><GText tone="muted">Delivery</GText><GText tone="muted">Calculated at checkout</GText></View></View>
      </ScrollView>
      <View style={[styles.footer, { backgroundColor: colors.background, borderColor: colors.border }]}><View><GText tone="muted" style={styles.store}>SELECTED SUBTOTAL</GText><GText weight="bold" style={styles.total}>{formatPrice(subtotal)}</GText></View><Pressable accessibilityRole="button" disabled={!selected.length} onPress={() => router.push({ pathname: '/checkout', params: { source: 'cart', ids: selected.map(row => row.item.id).join(',') } })} style={[styles.button, { backgroundColor: colors.text, opacity: selected.length ? 1 : 0.45 }]}><GText tone="white" weight="bold">Checkout {selected.length || ''}</GText><Ionicons name="arrow-forward" size={18} color="#fff"/></Pressable></View>
    </>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, header: { paddingHorizontal: 16, height: 58, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, icon: { width: 42, height: 42, justifyContent: 'center', alignItems: 'center' }, title: { fontSize: 22 }, content: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 35, maxWidth: 720, width: '100%' }, caption: { marginBottom: 17, fontSize: 13 }, card: { flexDirection: 'row', padding: 11, paddingTop: 40, gap: 12, borderWidth: 1, borderRadius: 19, marginBottom: 12 }, photo: { width: 108, height: 132, borderRadius: 13 }, cardContent: { flex: 1, justifyContent: 'space-between', minWidth: 0 }, store: { fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase' }, productName: { fontSize: 16, lineHeight: 21 }, price: { fontSize: 17 }, rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 11 }, step: { width: 37, height: 37, justifyContent: 'center', alignItems: 'center' }, qty: { minWidth: 25, textAlign: 'center' }, remove: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }, summary: { padding: 19, borderRadius: 20, marginTop: 16, gap: 16 }, sectionTitle: { fontSize: 17 }, summaryLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 }, total: { fontSize: 20 }, footer: { paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, button: { borderRadius: 14, paddingHorizontal: 21, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30, gap: 14 }, emptyIcon: { width: 95, height: 95, borderRadius: 28, justifyContent: 'center', alignItems: 'center' }, emptyTitle: { fontSize: 23 }, emptyCopy: { textAlign: 'center', maxWidth: 250, lineHeight: 21, marginBottom: 12 } });
const selectionStyles = StyleSheet.create({ selectHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 13, gap: 8 }, checkbox: { position: 'absolute', top: 11, right: 11, zIndex: 2, width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' } });

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewCart/> : <ServerScreen/>;}
