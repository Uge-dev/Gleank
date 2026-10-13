import { FRONTEND_PREVIEW } from '@/config/preview';
import { CheckoutPage as ServerScreen } from '@/features/live/purchase';
import { usePayments } from '@/features/payments/payment-state';
import { useAccount } from '@/features/account/account-state';
import { Chips, Picker } from '@/features/studio/ui';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useFeedState } from '@/features/feed/feed-state';
import { useCommerce, deliveryFee, orderDeliveryFee, type CheckoutSource, type Fulfillment, type PaymentMethod } from '@/features/commerce/commerce-state';
import { formatPrice } from '@/features/feed/data';
function PreviewCheckout() {
    const router = useRouter();
    const params = useLocalSearchParams<{
        source?: string;
        productId?: string;
        quantity?: string;
        ids?: string;
        quoteId?: string;
        fulfillment?: string;
    }>();
    const { colors } = useAppTheme();
    const market = useMarketplace();
    const account = useAccount();
    const { cart, catalog } = useFeedState();
    const { balanceKobo } = useCommerce();
    const payments = usePayments();
    const submitting = useRef(false);
    const [recipient, setRecipient] = useState(account.profile.displayName);
    const [phone, setPhone] = useState(account.profile.phone);
    const [address, setAddress] = useState('');
    const [note, setNote] = useState('');
    const defaultApplied = useRef(false);
    useEffect(() => {
        if (!account.ready || defaultApplied.current)
            return;
        defaultApplied.current = true;
        const saved = account.addresses.find(a => a.isDefault);
        if (saved && !address) {
            setRecipient(saved.recipient);
            setPhone(saved.phone);
            setAddress(saved.street + ', ' + saved.city + ', ' + saved.state);
            setNote(saved.instructions);
        }
    }, [account.ready]);
    const [fulfillment, setFulfillment] = useState<Fulfillment>(params.fulfillment === 'pickup' ? 'pickup' : 'delivery');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('wallet');
    const requestedIds = params.ids?.split(',').filter(Boolean) ?? cart.map(row => row.item.id);
    const product = params.source === 'product' ? catalog.find(item => item.id === params.productId) : undefined;
    const directQuantity = Number(params.quantity);
    const checkoutSource: CheckoutSource | null = params.source === 'quote' ? { kind: 'quote', id: params.quoteId ?? '' } : params.source === 'product'
        ? product && Number.isSafeInteger(directQuantity) && directQuantity >= 1 && directQuantity <= product.stock
            ? { kind: 'product', item: product, quantity: directQuantity } : null
        : { kind: 'cart', ids: requestedIds };
    let quoteRows: {
        item: ReturnType<typeof market.checkoutQuote>;
        quantity: number;
    }[] = [];
    let quoteError = '';
    if (params.source === 'quote') {
        try {
            const q = market.quotes.find(q => q.id === params.quoteId);
            if (!q)
                throw new Error('Offer unavailable.');
            quoteRows = [{ item: market.checkoutQuote(q.id), quantity: q.quantity }];
        }
        catch (e) {
            quoteError = e instanceof Error ? e.message : 'Offer unavailable.';
        }
    }
    const rows = checkoutSource?.kind === 'quote' ? quoteRows : checkoutSource?.kind === 'product'
        ? [{ item: checkoutSource.item, quantity: checkoutSource.quantity }]
        : cart.filter(row => requestedIds.includes(row.item.id));
    const subtotal = rows.reduce((sum, row) => sum + row.item.priceKobo * row.quantity, 0);
    const physical = rows.some(row => row.item.productType !== 'digital');
    const supportsPickup = rows.every(row => row.item.productType === 'digital' || !row.item.shipping || row.item.shipping.pickup);
    const supportsDelivery = rows.every(row => row.item.productType === 'digital' || !row.item.shipping || row.item.shipping.delivery || row.item.shipping.interstate);
    const selectedFulfillment = fulfillment === 'pickup' && !supportsPickup ? 'delivery' : fulfillment === 'delivery' && !supportsDelivery ? 'pickup' : fulfillment;
    const noFulfilment = physical && !supportsPickup && !supportsDelivery;
    const fee = orderDeliveryFee(selectedFulfillment, rows);
    const total = subtotal + fee;
    const submit = () => {
        if (submitting.current)
            return;
        submitting.current = true;
        try {
            if (noFulfilment)
                throw new Error('These products need separate delivery and pickup orders.');
            if (!checkoutSource || !rows.length)
                throw new Error('Select a product to check out.');
            const attempt = payments.start({ recipient, phone, address, note, fulfillment: selectedFulfillment, paymentMethod }, checkoutSource);
            router.replace({ pathname: '/payment', params: { id: attempt.id } });
        }
        catch (error) {
            submitting.current = false;
            Alert.alert('Check your details', error instanceof Error ? error.message : 'Please try again.');
        }
    };
    const inputStyle = [styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }];
    return <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: colors.background }]}><KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><Ionicons name="arrow-back" size={23} color={colors.text}/></Pressable><GText weight="bold" style={styles.heading}>Checkout</GText><Ionicons name="lock-closed-outline" size={21} color={colors.textMuted}/></View>
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.progress}><View style={[styles.progressBar, { backgroundColor: colors.text }]}/><View style={[styles.progressBar, { backgroundColor: colors.text }]}/><View style={[styles.progressBar, { backgroundColor: colors.border }]}/></View>
      <GText tone="muted">Step 2 of 3 · Review your order</GText>
      {physical ? <GText weight="bold" style={styles.section}>How would you like it?</GText> : <GText weight="bold" style={styles.section}>Instant digital access</GText>}
      {physical ? <View style={styles.choices}><>{supportsDelivery ? <Choice icon="bicycle-outline" title="Delivery" detail="Delivered to your address" selected={selectedFulfillment === 'delivery'} onPress={() => setFulfillment('delivery')}/> : null}</><>{supportsPickup ? <Choice icon="storefront-outline" title="Pick up" detail="Collect from seller" selected={selectedFulfillment === 'pickup'} onPress={() => setFulfillment('pickup')}/> : null}</></View> : null}
      {noFulfilment ? <GText tone="red">Choose products with the same delivery or pickup method, or place separate orders.</GText> : null}
      <GText weight="bold" style={styles.section}>Contact details</GText>
      <GText tone="muted" style={styles.label}>Full name</GText><TextInput value={recipient} onChangeText={setRecipient} placeholder="Name for this order" placeholderTextColor={colors.textMuted} style={inputStyle} autoCapitalize="words"/>
      <GText tone="muted" style={styles.label}>Phone number</GText><TextInput value={phone} onChangeText={setPhone} placeholder="Your phone number" placeholderTextColor={colors.textMuted} style={inputStyle} keyboardType="phone-pad"/>
      {physical && selectedFulfillment === 'delivery' ? <>{account.addresses.length ? <><GText weight="bold">Saved addresses</GText><Picker items={account.addresses.map(a => ({ id: a.id, title: a.label, detail: a.street + ', ' + a.city }))} value={account.addresses.find(a => address === a.street + ', ' + a.city + ', ' + a.state)?.id ?? ''} onChange={id => {
                    const a = account.addresses.find(a => a.id === id);
                    if (a) {
                        setAddress(a.street + ', ' + a.city + ', ' + a.state);
                        setRecipient(a.recipient);
                        setPhone(a.phone);
                        setNote(a.instructions);
                    }
                }}/><Pressable onPress={() => router.push('/addresses')}><GText weight="bold">Manage addresses →</GText></Pressable></> : null}<Pressable onPress={() => router.push('/addresses')} style={{ minHeight: 38, justifyContent: 'center' }}><GText weight="bold">Add or edit saved addresses →</GText></Pressable><GText tone="muted" style={styles.label}>Delivery address</GText><TextInput value={address} onChangeText={setAddress} placeholder="Street, building and area" placeholderTextColor={colors.textMuted} style={[inputStyle, styles.multiline]} multiline textAlignVertical="top"/></> : null}
      <GText tone="muted" style={styles.label}>Note to seller · optional</GText><TextInput value={note} onChangeText={setNote} placeholder="Any useful instructions?" placeholderTextColor={colors.textMuted} style={inputStyle}/>
      <GText weight="bold" style={styles.section}>Payment</GText>
      <Choice icon="wallet-outline" title="Gleenc wallet" detail={`Demo balance · ${formatPrice(balanceKobo)}`} selected={paymentMethod === 'wallet'} onPress={() => setPaymentMethod('wallet')}/>
      <Choice icon="card-outline" title="Card" detail="Simulated card payment" selected={paymentMethod === 'card'} onPress={() => setPaymentMethod('card')}/>
      <Choice icon="swap-horizontal-outline" title="Bank transfer" detail="Simulated bank transfer" selected={paymentMethod === 'transfer'} onPress={() => setPaymentMethod('transfer')}/>
      {paymentMethod === 'wallet' && balanceKobo < total ? <Pressable onPress={() => router.push('/wallet')} style={[styles.funds, { backgroundColor: colors.surfaceSecondary }]}><GText weight="bold">Wallet balance is too low</GText><GText tone="muted">Add demo funds to continue →</GText></Pressable> : null}
      {quoteError ? <GText tone="red">{quoteError}</GText> : null}
      <GText weight="bold" style={styles.section}>Order summary</GText>
      <GText tone="muted" style={styles.detail}>Physical product earnings stay pending until receipt. Digital files unlock after payment and have no delivery fee.</GText>
      <View style={[styles.summary, { backgroundColor: colors.surfaceSecondary }]}>{rows.length ? rows.map(row => <View key={row.item.id} style={{ gap: 8 }}><View style={styles.line}><GText style={{ flex: 1 }} numberOfLines={2}>{row.quantity} × {row.item.name}</GText><GText weight="bold">{formatPrice(row.item.priceKobo * row.quantity)}</GText></View><GText tone="muted" style={styles.detail}>Sold & fulfilled by {row.item.store}</GText>{row.item.config?.selections.map(c => <GText key={c.id} tone="muted" style={styles.detail}>{c.name}: {c.quantity} {c.unit} × {row.quantity} packs</GText>)}{row.item.quoteId ? <GText style={styles.detail}>Your privately approved price</GText> : null}{row.item.offer ? <><GText tone="muted" style={styles.detail}>Reshared by {row.item.offer.promoterName}</GText><View style={styles.line}><GText tone="muted" style={styles.detail}>Seller proceeds</GText><GText style={styles.detail}>{formatPrice(row.item.offer.basePriceKobo * row.quantity)}</GText></View><View style={styles.line}><GText tone="muted" style={styles.detail}>Included reshare commission</GText><GText style={styles.detail}>{formatPrice(row.item.offer.commissionKobo * row.quantity)}</GText></View></> : null}</View>) : <GText tone="muted">No products selected. Return to the bag or product page.</GText>}<View style={styles.line}><GText tone="muted">Delivery</GText><GText>{fee ? formatPrice(fee) : 'Free'}</GText></View><View style={[styles.line, { borderTopWidth: 1, borderColor: colors.border, paddingTop: 14 }]}><GText weight="bold">Total</GText><GText weight="bold" style={styles.total}>{formatPrice(total)}</GText></View></View>
    </ScrollView>
    <View style={[styles.footer, { borderColor: colors.border, backgroundColor: colors.background }]}><Pressable disabled={!rows.length} accessibilityRole="button" onPress={submit} style={[styles.submit, { backgroundColor: colors.text, opacity: rows.length ? 1 : .5 }]}><GText style={{ color: colors.background }} weight="bold">Continue to payment · {formatPrice(total)}</GText><Ionicons name="arrow-forward" size={18} color={colors.background}/></Pressable><GText tone="muted" style={styles.disclosure}>No real payment is collected.</GText></View>
  </KeyboardAvoidingView></SafeAreaView>;
}
function Choice({ icon, title, detail, selected, onPress }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    detail: string;
    selected: boolean;
    onPress: () => void;
}) {
    const { colors } = useAppTheme();
    return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, { borderColor: selected ? colors.text : colors.border, backgroundColor: colors.surface }]}><View style={[styles.choiceIcon, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name={icon} size={21} color={colors.text}/></View><View style={{ flex: 1 }}><GText weight="bold">{title}</GText><GText tone="muted" style={styles.detail}>{detail}</GText></View><Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={21} color={selected ? colors.text : colors.textMuted}/></Pressable>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, header: { height: 58, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, back: { width: 35, height: 42, justifyContent: 'center' }, heading: { fontSize: 21 }, body: { paddingHorizontal: 20, paddingBottom: 35, gap: 11, maxWidth: 720, width: '100%', alignSelf: 'center' }, progress: { flexDirection: 'row', gap: 5, marginVertical: 6 }, progressBar: { height: 4, flex: 1, borderRadius: 4 }, section: { fontSize: 19, marginTop: 19, marginBottom: 3 }, choices: { gap: 10 }, choice: { borderWidth: 1.5, padding: 13, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 68, marginBottom: 2 }, choiceIcon: { width: 41, height: 41, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, detail: { fontSize: 12, marginTop: 4 }, label: { marginTop: 7, fontSize: 12 }, input: { borderWidth: 1, borderRadius: 13, minHeight: 50, paddingHorizontal: 15, fontSize: 15 }, multiline: { height: 78, paddingTop: 14 }, funds: { padding: 14, borderRadius: 12, gap: 4 }, summary: { borderRadius: 18, padding: 17, gap: 15 }, line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 15 }, total: { fontSize: 20 }, footer: { borderTopWidth: 1, paddingHorizontal: 20, paddingVertical: 11, gap: 7 }, submit: { borderRadius: 14, height: 53, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }, disclosure: { fontSize: 11, textAlign: 'center' } });

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewCheckout/> : <ServerScreen/>;}
