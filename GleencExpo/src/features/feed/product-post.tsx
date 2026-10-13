import { useCommunity } from '@/features/community/community-state';
import { PurchaseActions } from './purchase-actions';
import { useState, type ComponentProps } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GText } from '@/components/gleenc/text';
import { ProductGallery } from '@/components/products/product-gallery';
import { useAppTheme } from '@/hooks/use-app-theme';
import { listingPrice, formatPrice, shortCount, type FeedItem } from './data';
import { useFeedState } from './feed-state';
import { Comments } from './comments';
export function ProductPost({ item, availableHeight, compact }: {
    item: FeedItem;
    availableHeight: number;
    compact: boolean;
}) {
    const router = useRouter();
    const social = useCommunity();
    const { colors } = useAppTheme();
    const { liked, saved, followed, reshared, shared, toggleLike, toggleSave, toggleFollow, addToCart, openReshare, openShare, openBid, showIntegrationNotice } = useFeedState();
    const [quantity, setQuantity] = useState(1);
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [sellerHeight, setSellerHeight] = useState(compact ? 43 : 56);
    const [bodyHeight, setBodyHeight] = useState(compact ? 220 : 250);
    // The photo gets the remaining room after the controls have measured themselves.
    const imageHeight = Math.max(76, Math.floor(availableHeight - sellerHeight - bodyHeight - 2));
    const images = item.images?.length ? item.images : [item.image];
    const uploaderName = item.remote?.authorName || item.store;
    const openSeller = () => router.push({ pathname: '/store', params: { seller: item.store, userId: item.remote?.authorId ?? '' } });
    const openProduct = () => router.push({ pathname: '/product', params: { id: item.id } });
    function shareProduct() {
        openShare(item);
    }
    return (<View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View onLayout={event => {
            const height = Math.ceil(event.nativeEvent.layout.height);
            setSellerHeight(previous => previous === height ? previous : height);
        }} style={[styles.sellerRow, compact && styles.sellerRowCompact]}>
        <Pressable onPress={openSeller} style={styles.sellerLink} accessibilityLabel={`Open ${item.store} profile`}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>{item.remote?.avatarUrl ? <Image source={{ uri: item.remote.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 20 }}/> : <GText tone="white" weight="bold">{uploaderName[0]}</GText>}</View>
          <View style={{ flexShrink: 1 }}><GText weight="bold" style={{ fontSize: 15 }}>{uploaderName}</GText><GText tone="muted" style={{ fontSize: 11 }}>{item.offer ? `Reshared by ${item.offer.promoterName}` : item.handle}</GText></View>
        </Pressable>
        <Pressable onPress={() => toggleFollow(item.remote?.authorId??item.store)} style={[styles.follow, { backgroundColor: colors.text }]} accessibilityLabel={`Follow ${item.store}`}>
          <GText weight="bold" style={{ color: colors.background, fontSize: 12 }}>{followed.includes(item.remote?.authorId??item.store) ? 'Following' : 'Follow'}</GText>
        </Pressable>
      </View>

      <View>
        <ProductGallery images={images} height={imageHeight} onImagePress={openProduct}/>
        <View pointerEvents="none" style={[styles.available, { backgroundColor: colors.surface }]}><GText weight="bold" style={{ fontSize: 11 }}>{item.stock ? 'Available' : 'Sold out'}</GText></View>
        <View pointerEvents="none" style={styles.views}><Ionicons name="eye-outline" size={13} color="#FFFFFF"/><GText tone="white" style={{ fontSize: 11 }}> {item.views} views</GText></View>
      </View>

      <View onLayout={event => {
            const height = Math.ceil(event.nativeEvent.layout.height);
            setBodyHeight(previous => previous === height ? previous : height);
        }} style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.actions}>
          <View style={styles.actionGroup}>
            <Action label="Like" icon={(item.remote?.viewerLiked || liked.includes(item.id)) ? 'heart' : 'heart-outline'} color={(item.remote?.viewerLiked || liked.includes(item.id)) ? colors.primary : colors.text} caption={String(item.remote ? item.likes : item.likes + Number(liked.includes(item.id)))} onPress={() => toggleLike(item.id)}/>
            <Action label="Comments" icon="chatbubble-outline" color={colors.text} caption={String(item.remote ? item.comments : item.comments + social.commentsFor(item.id).filter(c => !c.deleted).length)} onPress={() => item.remote ? router.push({pathname:'/comments' as any,params:{productId:item.remote.productId}}) : setCommentsOpen(true)}/>
            <Action label="Reshare" icon="repeat" color={(item.remote?.viewerReshared || (!item.remote&&reshared.includes(item.id))) ? colors.primary : colors.text} caption={shortCount(item.remote ? (item.reshares??0) : (item.reshares ?? 0) + Number(reshared.includes(item.id)))} onPress={() => openReshare(item)}/>
            <Action label="Share" icon="paper-plane-outline" color={colors.text} caption={shortCount(item.remote ? (item.shares??0) : (item.shares ?? 0) + (shared[item.id] ?? 0))} onPress={() => void shareProduct()}/>
          </View>
          <Action label="Save" icon={saved.includes(item.id) ? 'bookmark' : 'bookmark-outline'} color={saved.includes(item.id) ? colors.primary : colors.text} caption="Save" onPress={() => toggleSave(item.id)}/>
        </View>
        <Pressable onPress={openProduct} style={[styles.productText, compact && styles.productTextCompact]} accessibilityLabel={`Open ${item.name} details`}>
          {!compact && <View style={[styles.pill, { borderColor: colors.primaryLight }]}><GText tone="red" weight="bold" style={{ fontSize: 10 }}>MARKETPLACE</GText></View>}
          <GText weight="bold" numberOfLines={compact ? 1 : 2} style={[styles.name, compact && styles.nameCompact]}>{item.name}</GText>
          <GText tone="muted" numberOfLines={compact ? 1 : 2} style={[styles.description, compact && styles.descriptionCompact]}>{item.description}</GText>
          <GText tone="muted" style={styles.stock}>{item.category} · {item.stock} in stock</GText>
        </Pressable>
        <View style={[styles.priceRow, compact && styles.priceRowCompact]}>
          <View><GText weight="bold" style={{ fontSize: compact ? 17 : 21 }}>{listingPrice(item)}</GText></View>
          <View style={[styles.stepper, { borderColor: colors.border }]}>
            <Pressable onPress={() => setQuantity(value => Math.max(1, value - 1))} style={styles.stepButton} accessibilityLabel="Decrease quantity"><Ionicons name="remove" size={19} color={colors.text}/></Pressable>
            <GText style={{ minWidth: 22, textAlign: 'center' }}>{quantity}</GText>
            <Pressable onPress={() => setQuantity(value => Math.min(Math.max(item.stock, 1), value + 1))} style={styles.stepButton} accessibilityLabel="Increase quantity"><Ionicons name="add" size={19} color={colors.text}/></Pressable>
          </View>
        </View>
        <PurchaseActions item={item} quantity={quantity}/>
        <View style={[styles.bottom, compact && styles.bottomCompact]}>
          <Pressable onPress={() => addToCart(item, quantity)} style={[styles.cart, { backgroundColor: colors.primary }]} accessibilityLabel="Add to cart"><Ionicons name="cart-outline" size={27} color="#FFFFFF"/></Pressable>
          <Pressable onPress={openProduct} style={[styles.details, { backgroundColor: colors.text }]} accessibilityLabel="View product details"><GText weight="bold" style={{ color: colors.background, fontSize: compact ? 13 : 15 }}>View Details</GText></Pressable>
        </View>
      </View>
      <Comments postId={item.id} open={commentsOpen} close={() => setCommentsOpen(false)} title={item.name}/>
    </View>);
}
type ActionProps = {
    label: string;
    icon: ComponentProps<typeof Ionicons>['name'];
    color: string;
    caption: string;
    onPress: () => void;
};
function Action({ label, icon, color, caption, onPress }: ActionProps) {
    return <Pressable onPress={onPress} style={styles.action} accessibilityLabel={label} hitSlop={3}>
    <Ionicons name={icon} size={25} color={color}/>
    <GText numberOfLines={1} style={styles.actionLabel}>{caption}</GText>
  </Pressable>;
}
const styles = StyleSheet.create({
    card: { marginHorizontal: 10, borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
    sellerRow: { height: 61, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15 },
    sellerRowCompact: { height: 43, paddingHorizontal: 10 },
    sellerLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 12 },
    avatar: { height: 36, width: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    follow: { borderRadius: 18, paddingHorizontal: 17, paddingVertical: 9 },
    available: { position: 'absolute', bottom: 12, left: 13, borderRadius: 15, paddingHorizontal: 10, paddingVertical: 6 },
    views: { position: 'absolute', bottom: 12, right: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.52)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6 },
    body: { paddingHorizontal: 15, paddingTop: 12, paddingBottom: 16 },
    bodyCompact: { paddingHorizontal: 10, paddingTop: 5, paddingBottom: 7 },
    actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    actionGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    action: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', gap: 1 },
    actionLabel: { fontSize: 9, textAlign: 'center' },
    productText: { gap: 4 }, pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 3 },
    productTextCompact: { gap: 1 },
    name: { fontSize: 19, lineHeight: 23 }, description: { fontSize: 13, lineHeight: 17 }, stock: { fontSize: 12, marginTop: 2 },
    nameCompact: { fontSize: 16, lineHeight: 19 }, descriptionCompact: { fontSize: 11, lineHeight: 14 },
    priceRow: { marginTop: 15, marginBottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    priceRowCompact: { marginTop: 5, marginBottom: 2 },
    stepper: { height: 37, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 20 },
    stepButton: { width: 33, height: 34, alignItems: 'center', justifyContent: 'center' },
    bottom: { flexDirection: 'row', gap: 9, height: 49 },
    bottomCompact: { height: 44 },
    cart: { width: 55, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    details: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
