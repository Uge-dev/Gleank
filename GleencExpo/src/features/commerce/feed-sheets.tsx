import { CommunityConsent } from '@/features/community/terms';
import { useCommunity } from '@/features/community/community-state';
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useFeedState } from '@/features/feed/feed-state';
import { formatPrice, type FeedItem } from '@/features/feed/data';
import { resharePrice } from './reshare';
export function FeedSheets() {
    const router = useRouter();
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const { instantItem, closeInstant, reshareTarget, closeReshare, setCartQuantity } = useFeedState();
    return <>
    <Modal transparent animationType="slide" visible={Boolean(instantItem)} onRequestClose={closeInstant}>
      <View style={styles.scrim}><Pressable style={StyleSheet.absoluteFill} onPress={closeInstant}/>
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 18) + 12 }]}>
          <View style={styles.handle}/><View style={styles.heading}><View style={styles.inline}><Ionicons name="checkmark-circle" size={24} color="#269B72"/><GText weight="bold" style={styles.title}>Added to your bag</GText></View><Pressable onPress={closeInstant} style={styles.close} accessibilityLabel="Close"><Ionicons name="close" size={24} color={colors.text}/></Pressable></View>
          {instantItem ? <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
            <View style={styles.product}><Image source={{ uri: instantItem.item.image }} style={styles.image}/><View style={{ flex: 1, gap: 6 }}><GText tone="muted" style={styles.small}>Sold by {instantItem.item.store}</GText><GText weight="bold" style={{ fontSize: 18 }}>{instantItem.item.name}</GText><GText weight="bold">{formatPrice(instantItem.item.priceKobo)}</GText></View></View>
            <View style={styles.line}><GText tone="muted">Quantity in bag</GText><View style={[styles.stepper, { borderColor: colors.border }]}><Pressable style={styles.step} accessibilityLabel="Decrease quantity" onPress={() => setCartQuantity(instantItem.item.id, instantItem.quantity - 1)}><Ionicons name="remove" size={20} color={colors.text}/></Pressable><GText weight="bold">{instantItem.quantity}</GText><Pressable style={styles.step} accessibilityLabel="Increase quantity" onPress={() => setCartQuantity(instantItem.item.id, instantItem.quantity + 1)}><Ionicons name="add" size={20} color={colors.text}/></Pressable></View></View>
            <View style={styles.line}><GText weight="bold">Product subtotal</GText><GText weight="bold" style={{ fontSize: 22 }}>{formatPrice(instantItem.item.priceKobo * instantItem.quantity)}</GText></View>
            <Pressable style={[styles.primary, { backgroundColor: colors.text }]} onPress={() => {
                const id = instantItem.item.id;
                closeInstant();
                router.push({ pathname: '/checkout', params: { source: 'cart', ids: id } });
            }}><GText weight="bold" style={{ color: colors.background }}>Checkout this product</GText><Ionicons name="arrow-forward" size={19} color={colors.background}/></Pressable>
            <View style={styles.inline}><Pressable style={[styles.secondary, { borderColor: colors.border }]} onPress={closeInstant}><GText weight="bold">Keep shopping</GText></Pressable><Pressable style={[styles.secondary, { borderColor: colors.border }]} onPress={() => {
                closeInstant();
                router.push('/cart');
            }}><GText weight="bold">View bag</GText></Pressable></View>
          </ScrollView> : null}
        </View>
      </View>
    </Modal>
    <Modal transparent animationType="slide" visible={Boolean(reshareTarget)} onRequestClose={closeReshare}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.scrim}><Pressable style={StyleSheet.absoluteFill} onPress={closeReshare}/>
        {reshareTarget ? <ReshareForm key={reshareTarget.id} item={reshareTarget}/> : null}
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
function ReshareForm({ item }: {
    item: FeedItem;
}) {
    const community = useCommunity();
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { closeReshare, publishReshare } = useFeedState();
    const base = item.offer?.basePriceKobo ?? item.priceKobo;
    const eligibleBase = base - (item.config?.packagingKobo ?? item.plan?.packagingKobo ?? 0);
    const [price, setPrice] = useState(((base + Math.floor(eligibleBase * .1)) / 100).toFixed(2));
    const [percent, setPercent] = useState('10');
    const saleKobo = Math.round(Number(price) * 100);
    const valid = Number.isSafeInteger(saleKobo) && saleKobo >= base && saleKobo <= base + Math.floor(eligibleBase * .2) && price.trim() !== '';
    const commission = valid ? resharePrice(item, saleKobo).commissionKobo : 0;
    const setPriceInput = (value: string) => {
        setPrice(value);
        const kobo = Math.round(Number(value) * 100);
        setPercent(Number.isFinite(kobo) && base ? ((kobo - base) / eligibleBase * 100).toFixed(2) : '');
    };
    const setPercentInput = (value: string) => {
        if (Number(value) > 20)
            value = '20';
        setPercent(value);
        setPrice(Number.isFinite(Number(value)) && value !== '' ? ((base + Math.floor(eligibleBase * Number(value) / 100)) / 100).toFixed(2) : '');
    };
    const publish = () => {
        try {
            const offer = publishReshare(item, saleKobo);
            if (offer)
                router.push({ pathname: '/product', params: { id: offer.id } });
        }
        catch (error) {
            Alert.alert('Review your price', error instanceof Error ? error.message : 'Try again.');
        }
    };
    return <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: Math.max(insets.bottom, 18) + 12, maxHeight: '90%' }]}><View style={styles.handle}/>
    <View style={styles.heading}><GText weight="bold" style={styles.title}>Reshare & earn</GText><Pressable onPress={closeReshare} style={styles.close}><Ionicons name="close" size={23} color={colors.text}/></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 17 }}>
      <View style={styles.product}><Image source={{ uri: item.image }} style={styles.image}/><View style={{ flex: 1, gap: 5 }}><GText weight="bold">{item.name}</GText><GText tone="muted" style={styles.small}>Original seller · {item.store}</GText><GText weight="bold">Seller price {formatPrice(base)}</GText></View></View>
      <GText tone="muted" style={{ lineHeight: 21 }}>Set the price shown on your reshare. Packaging is excluded from commission. The original seller fulfills the order. Your added amount becomes earnings after the buyer confirms delivery.</GText>
      <View style={styles.inline}><View style={{ flex: 1, gap: 7 }}><GText tone="muted" style={styles.small}>Your selling price · ₦</GText><TextInput value={price} onChangeText={setPriceInput} keyboardType="decimal-pad" style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}/></View><View style={{ width: 105, gap: 7 }}><GText tone="muted" style={styles.small}>Increase · % (max 20)</GText><TextInput value={percent} onChangeText={setPercentInput} keyboardType="decimal-pad" style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}/></View></View>
      {!valid ? <GText tone="red">Choose a price from the seller price up to 20% above it.</GText> : null}
      <View style={[styles.breakdown, { backgroundColor: colors.surfaceSecondary }]}><View style={styles.line}><GText tone="muted">Original seller</GText><GText weight="bold">{formatPrice(base)}</GText></View><View style={styles.line}><GText tone="muted">Your commission per unit</GText><GText weight="bold" style={{ color: '#269B72' }}>{formatPrice(commission)}</GText></View><View style={styles.line}><GText weight="bold">Buyer pays</GText><GText weight="bold">{formatPrice(valid ? saleKobo : base)}</GText></View></View>
      <CommunityConsent /><Pressable disabled={!valid || !community.accepted} onPress={publish} style={[styles.primary, { backgroundColor: colors.text, opacity: valid ? 1 : .45 }]}><Ionicons name="repeat" size={21} color={colors.background}/><GText weight="bold" style={{ color: colors.background }}>Publish reshare</GText></Pressable>
      <GText tone="muted" style={[styles.small, { textAlign: 'center' }]}>Your reshare appears in the feed with the seller attribution intact.</GText>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
    scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.5)' }, sheet: { maxHeight: '90%', padding: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 16 }, handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: '#99999960', alignSelf: 'center', marginBottom: 2 },
    heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, title: { fontSize: 22 }, close: { width: 35, height: 35, alignItems: 'center', justifyContent: 'center' }, inline: { flexDirection: 'row', alignItems: 'center', gap: 9 }, product: { flexDirection: 'row', alignItems: 'center', gap: 13 }, image: { height: 79, width: 79, borderRadius: 15 }, small: { fontSize: 12, lineHeight: 18 }, line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, stepper: { borderWidth: 1, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }, step: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }, primary: { minHeight: 53, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, secondary: { flex: 1, borderWidth: 1, borderRadius: 14, minHeight: 47, alignItems: 'center', justifyContent: 'center' }, input: { minHeight: 54, borderWidth: 1, paddingHorizontal: 15, borderRadius: 13, fontSize: 18 }, breakdown: { padding: 17, borderRadius: 17, gap: 15 },
});
