import { ProductPage as ServerScreen } from '@/features/live/social-pages';
import { RemoteProductDetails } from '@/features/feed/remote-product-details';
import { ReviewSummary } from '@/features/reviews/summary';
import { useCommunity } from '@/features/community/community-state';
import { useEffect } from 'react';
import { Card, Heading, Chips } from '@/features/studio/ui';
import { fileSize } from '@/features/digital/files';
import { PurchaseActions } from '@/features/feed/purchase-actions';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Image, Pressable, ScrollView, StatusBar, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProductGallery } from '@/components/products/product-gallery';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/hooks/use-auth';
import { useFeedState } from '@/features/feed/feed-state';
import { useChat } from '@/features/chat/chat-state';
import { formatPrice, type FeedItem } from '@/features/feed/data';
import { FRONTEND_PREVIEW } from '@/config/preview';
function PreviewProductDetails() {
    const { id } = useLocalSearchParams<{
        id: string;
    }>();
    const router = useRouter();
    const { colors, isDark } = useAppTheme();
    const { width } = useWindowDimensions();
    const { user } = useAuth();
    const market = useMarketplace();
    const { saved, followed, toggleSave, toggleFollow, requireAccount, addToCart, catalog, openReshare, openShare, openBid } = useFeedState();
    const { startConversation } = useChat();
    const [quantity, setQuantity] = useState(1);
    const [selectedColor, setSelectedColor] = useState('All');
    const [fulfillment, setFulfillment] = useState<'Pickup' | 'Delivery'>('Pickup');
    const item = catalog.find(product => product.id === id);
    const social = useCommunity();
    useEffect(() => {
        if (FRONTEND_PREVIEW && item && social.ready)
            social.track(item.id, 'open');
    }, [item?.id, social.ready]);
    if (!item)
        return <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}><GText style={{ padding: 20 }}>Product unavailable.</GText></SafeAreaView>;
    if (item.remote) return <RemoteProductDetails item={item}/>;
    const accepted = market.quotes.find(q => q.buyerId === market.buyerId && q.state === 'accepted' && q.expiresAt > Date.now() && (q.item.config?.postId ?? q.item.id) === item.id);
    const palette = [...new Set(item.colorImages?.map(i => i.color).filter(Boolean) ?? [])];
    const chosenImages = selectedColor === 'All' ? [] : item.colorImages?.filter(i => i.color === selectedColor || !i.color).map(i => i.uri) ?? [];
    const images = chosenImages.length ? chosenImages : item.images?.length ? item.images : [item.image];
    const related = catalog.filter(product => product.id !== item.id && product.category === item.category).slice(0, 5);
    const supportedMethods = (['Pickup', 'Delivery'] as const).filter(method => !item.shipping || (method === 'Pickup' ? item.shipping.pickup : item.shipping.delivery || item.shipping.interstate));
    const selectedFulfillment = supportedMethods.includes(fulfillment) ? fulfillment : supportedMethods[0] ?? 'Pickup';
    const openStore = () => router.push({ pathname: '/store', params: { seller: item.store } });
    function orderNow() {
        if (!item)
            return;
        if (!user && !FRONTEND_PREVIEW) {
            router.push('/login');
            return;
        }
        if (item.stock < 1)
            return;
        if (item.plan) {
            addToCart(item, quantity);
            return;
        }
        router.push({ pathname: '/checkout', params: { source: 'product', productId: item.id, quantity: String(quantity), fulfillment: selectedFulfillment.toLowerCase() } });
    }
    return <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: colors.background }]}>
    <StatusBar translucent={false} backgroundColor={colors.background} barStyle={isDark ? 'light-content' : 'dark-content'}/>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onLongPress={() => router.push({ pathname: '/report', params: { kind: 'product', id: item.id, author: item.store } })} onPress={() => router.back()} style={styles.back} accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={21} color={colors.text}/><GText weight="bold">Back to Market</GText>
      </Pressable>
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border, overflow: 'hidden' }]}>
        <ProductGallery images={images} height={Math.round(Math.max(260, Math.min(width * 0.86, 410)))} showThumbnails/>
      </View>
      {accepted ? <Pressable onPress={() => router.push({ pathname: '/offer', params: { id: accepted.id } })} style={[styles.panel, { backgroundColor: colors.surfaceSecondary, padding: 16 }]}><GText weight="bold" style={{ color: colors.success }}>Your accepted offer</GText><GText>{formatPrice(accepted.approvedKobo! * accepted.quantity)} · {accepted.quantity} approved items/packs</GText><GText weight="bold">Review & checkout →</GText></Pressable> : null}
      {palette.length ? <Chips items={['All', ...palette]} value={selectedColor} onChange={setSelectedColor}/> : null}
      <View style={[styles.panel, styles.intro, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {item.catalogueId ? <Pressable onPress={() => router.push({ pathname: '/catalogue', params: { seller: item.store } })} style={{ minHeight: 39, justifyContent: 'center' }}><GText weight="bold">View seller menu & prices →</GText></Pressable> : null}
        <View style={styles.badges}><Pill label={item.category}/><Pill label={item.stock ? 'Available' : 'Sold out'}/></View>
        <GText weight="bold" style={styles.title}>{item.name}</GText>
        <GText tone="muted" style={styles.meta}>{item.category} · {item.stock} in stock</GText>
        <GText tone="red" style={styles.sellerLine}>Sold by {item.store}</GText>
        {item.offer ? <GText tone="muted" style={{ fontSize: 12 }}>Reshared by {item.offer.promoterName} · Original seller fulfills this order</GText> : null}
        <View style={styles.social}><Ionicons name="heart-outline" size={17} color={colors.textMuted}/><GText tone="muted">{item.likes}</GText><Ionicons name="chatbubble-outline" size={17} color={colors.textMuted}/><GText tone="muted">{item.comments}</GText><Ionicons name="eye-outline" size={17} color={colors.textMuted}/><GText tone="muted">{item.views}</GText></View>
        <View style={styles.priceRow}><GText weight="bold" style={styles.price}>{formatPrice(item.priceKobo)}</GText><View style={[styles.stepper, { borderColor: colors.border }]}><Pressable onPress={() => setQuantity(value => Math.max(1, value - 1))} style={styles.stepButton} accessibilityLabel="Decrease quantity"><Ionicons name="remove" size={20} color={colors.text}/></Pressable><GText>{quantity}</GText><Pressable onPress={() => setQuantity(value => Math.min(Math.max(item.stock, 1), value + 1))} style={styles.stepButton} disabled={item.productType === 'digital'} accessibilityLabel="Increase quantity"><Ionicons name="add" size={20} color={colors.text}/></Pressable></View></View>
        <GText tone="red" style={styles.availability}>● {item.stock ? 'Ready to order' : 'Currently unavailable'}</GText>
        <Pressable onPress={() => addToCart(item, quantity)} style={[styles.primary, { backgroundColor: colors.primary }]}><Ionicons name="cart-outline" size={21} color="#FFFFFF"/><GText tone="white" weight="bold">Add to Cart</GText></Pressable>
        <Pressable onPress={orderNow} disabled={!item.stock} style={[styles.primary, { backgroundColor: colors.text, opacity: item.stock ? 1 : 0.45 }]}><GText weight="bold" style={{ color: colors.background }}>Buy now · Checkout</GText></Pressable>
        <Pressable onPress={() => requireAccount(() => {
            startConversation(item.store);
            router.push({ pathname: '/chat', params: { seller: item.store } });
        })} style={[styles.primary, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name="chatbubble-outline" size={18} color={colors.text}/><GText>Message Seller</GText></Pressable>
        <Pressable onPress={() => openReshare(item)} style={[styles.secondary, { borderColor: colors.border }]}><Ionicons name="repeat" size={19} color={colors.text}/><GText>Reshare & earn · max 20%</GText></Pressable>
        <PurchaseActions item={item} quantity={quantity}/>
        <View style={styles.split}><Pressable onPress={() => toggleSave(item.id)} style={[styles.secondary, { borderColor: colors.border }]}><Ionicons name={saved.includes(item.id) ? 'bookmark' : 'bookmark-outline'} color={colors.text} size={19}/><GText>{saved.includes(item.id) ? 'Saved' : 'Save'}</GText></Pressable><Pressable onPress={() => openShare(item)} style={[styles.secondary, { borderColor: colors.border }]}><Ionicons name="paper-plane-outline" color={colors.text} size={19}/><GText>Share</GText></Pressable></View>
      </View>
      <View style={[styles.panel, styles.sellerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.sellerRow}><View style={[styles.avatar, { backgroundColor: colors.primary }]}><GText tone="white" weight="bold" style={{ fontSize: 22 }}>{item.store[0]}</GText></View><View><GText weight="bold" style={{ fontSize: 18 }}>{item.store}</GText><GText tone="muted" style={{ fontSize: 12 }}>{item.handle}</GText><GText tone="red" style={{ fontSize: 11 }}>Seller store</GText></View></View>
        <View style={styles.stats}><Stat icon="people-outline" label="Followers" value={followed.includes(item.store) ? '1' : '0'}/><Stat icon="heart-outline" label="Likes" value={String(item.likes)}/><Stat icon="cube-outline" label="Available" value={String(item.stock)}/></View>
        <Pressable onPress={() => toggleFollow(item.store)} style={[styles.primary, { backgroundColor: colors.primary }]}><GText tone="white" weight="bold">{followed.includes(item.store) ? 'Following' : 'Follow Store'}</GText></Pressable>
        <Pressable onPress={openStore} style={[styles.primary, { backgroundColor: colors.text }]}><GText weight="bold" style={{ color: colors.background }}>Visit Store</GText></Pressable>
      </View>
      <Section title="Description"><GText tone="muted" style={styles.paragraph}>{item.fullDescription ?? item.description}</GText></Section>
      <Section title="Product Information"><InfoRow label="Category" value={item.category}/><InfoRow label="Store" value={item.store}/><InfoRow label="Stock" value={`${item.stock} available`}/><InfoRow label="Type" value={item.productType === 'digital' ? 'Digital download' : 'Physical product'}/>{item.subcategory ? <InfoRow label="Subcategory" value={item.subcategory}/> : null}<InfoRow label="Status" value={item.listingStatus ?? 'active'}/></Section>
      {item.productType !== 'digital' ? <Section title="Delivery & Pickup"><View style={styles.split}>{supportedMethods.map(option => <Pressable key={option} onPress={() => setFulfillment(option)} style={[styles.option, { backgroundColor: option === selectedFulfillment ? colors.text : colors.surfaceSecondary }]}><GText weight="bold" style={{ color: option === selectedFulfillment ? colors.background : colors.text }}>{option}</GText></Pressable>)}</View><GText tone="muted" style={styles.paragraph}>{selectedFulfillment === 'Pickup' ? (item.shipping?.pickupArea || 'Arrange pickup with the seller.') : (item.shipping?.dispatchArea || 'Confirm your delivery location with the seller.')}</GText>{selectedFulfillment === 'Delivery' ? <GText weight="bold">Delivery fee · {formatPrice(item.shipping?.localFeeKobo ?? 120000)}</GText> : null}{item.shipping?.preparation ? <GText tone="muted">Preparation · {item.shipping.preparation}</GText> : null}{item.shipping?.handling ? <GText>{item.shipping.handling}</GText> : null}</Section> : null}
      {item.digital ? <Card><Heading>Included downloads</Heading>{item.digital.files.map(file => <GText key={file.id}>{file.name} · {fileSize(file.bytes)}</GText>)}<GText weight="bold">{item.digital.licence} licence · Version {item.digital.version}</GText><GText tone="muted">{item.digital.licenceText || 'Licence terms are supplied by the seller.'}</GText><GText>{item.digital.requirements}</GText><GText tone="muted">Files unlock in your purchase library after checkout. No delivery charge or QR confirmation.</GText></Card> : null}
      {Object.keys(item.attributes ?? {}).length ? <Card><Heading>Specifications</Heading>{Object.entries(item.attributes ?? {}).map(([key, value]) => <View key={key} style={{ gap: 4 }}><GText weight="bold">{key.replace(/([A-Z])/g, ' $1')}</GText><GText tone="muted">{value}</GText></View>)}</Card> : null}

      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/report', params: { kind: 'product', id: item.id, author: item.store } })} style={{ minHeight: 44, justifyContent: 'center' }}><GText tone="muted">Report this product</GText></Pressable>
      <Section title="Reviews"><ReviewSummary item={item}/></Section>
      <View style={styles.relatedHeader}><GText tone="red" weight="bold" style={{ fontSize: 11 }}>MORE TO DISCOVER</GText><GText weight="bold" style={{ fontSize: 20 }}>Related products</GText></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedList}>{related.map(product => <Related key={product.id} item={product} onPress={() => router.push({ pathname: '/product', params: { id: product.id } })}/>)}</ScrollView>
    </ScrollView>
  </SafeAreaView>;
}
function Pill({ label }: {
    label: string;
}) {
    const { colors } = useAppTheme();
    return <View style={[styles.pill, { backgroundColor: colors.primaryLight }]}><GText tone="red" weight="bold" style={{ fontSize: 11 }}>{label}</GText></View>;
}
function Stat({ icon, label, value }: {
    icon: ComponentProps<typeof Ionicons>['name'];
    label: string;
    value: string;
}) {
    const { colors } = useAppTheme();
    return <View style={[styles.stat, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name={icon} size={18} color={colors.primary}/><GText weight="bold">{value}</GText><GText tone="muted" style={{ fontSize: 11 }}>{label}</GText></View>;
}
function Section({ title, children }: {
    title: string;
    children: ReactNode;
}) {
    const { colors } = useAppTheme();
    return <View style={[styles.panel, styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}><GText weight="bold" style={{ fontSize: 18, marginBottom: 12 }}>{title}</GText>{children}</View>;
}
function InfoRow({ label, value }: {
    label: string;
    value: string;
}) {
    const { colors } = useAppTheme();
    return <View style={[styles.infoRow, { backgroundColor: colors.surfaceSecondary }]}><GText tone="muted" style={{ fontSize: 11 }}>{label}</GText><GText weight="bold" style={{ marginTop: 4 }}>{value}</GText></View>;
}
function Related({ item, onPress }: {
    item: FeedItem;
    onPress: () => void;
}) {
    const { colors } = useAppTheme();
    return <Pressable onPress={onPress} style={[styles.related, { backgroundColor: colors.surface, borderColor: colors.border }]}><Image source={{ uri: item.image }} style={styles.relatedImage}/><View style={{ padding: 10, gap: 4 }}><GText weight="bold" numberOfLines={1}>{item.name}</GText><GText tone="muted" style={{ fontSize: 11 }}>{item.category} · {item.stock} in stock</GText><GText weight="bold">{formatPrice(item.priceKobo)}</GText></View></Pressable>;
}
const styles = StyleSheet.create({
    root: { flex: 1 }, content: { paddingBottom: 28 }, back: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, height: 48 },
    panel: { marginHorizontal: 12, marginBottom: 12, borderWidth: 1, borderRadius: 19, overflow: 'hidden' },
    intro: { padding: 18, gap: 9 }, badges: { flexDirection: 'row', gap: 7 }, pill: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
    title: { fontSize: 25, lineHeight: 29 }, meta: { fontSize: 13 }, sellerLine: { fontSize: 12 },
    social: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 6 },
    priceRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, price: { fontSize: 23 },
    stepper: { height: 38, borderWidth: 1, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 10 }, stepButton: { width: 35, height: 36, alignItems: 'center', justifyContent: 'center' },
    availability: { fontSize: 12, marginBottom: 3 }, primary: { height: 46, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    split: { flexDirection: 'row', gap: 9 }, secondary: { flex: 1, height: 42, borderWidth: 1, borderRadius: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    sellerCard: { padding: 18, gap: 11 }, sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { height: 55, width: 55, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
    stats: { flexDirection: 'row', gap: 8 }, stat: { flex: 1, minHeight: 67, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
    section: { padding: 17 }, paragraph: { fontSize: 13, lineHeight: 21, marginBottom: 8 },
    infoRow: { borderRadius: 11, marginBottom: 8, padding: 13 }, option: { flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center' },
    review: { padding: 13, borderRadius: 12, marginBottom: 8 }, input: { borderWidth: 1, minHeight: 82, borderRadius: 12, padding: 12, fontFamily: 'ReoSans-Medium', textAlignVertical: 'top' },
    relatedHeader: { paddingHorizontal: 17, paddingVertical: 11, gap: 5 }, relatedList: { paddingHorizontal: 12, gap: 11 }, related: { width: 164, borderWidth: 1, borderRadius: 15, overflow: 'hidden' }, relatedImage: { height: 125, width: '100%' },
});

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewProductDetails/> : <ServerScreen/>;}
