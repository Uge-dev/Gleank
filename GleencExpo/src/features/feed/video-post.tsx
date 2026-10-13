import { useCommunity } from '@/features/community/community-state';
import { PurchaseActions } from './purchase-actions';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GText } from '@/components/gleenc/text';
import { Colors } from '@/constants/theme';
import { listingPrice, formatPrice, shortCount, type FeedItem } from './data';
import { Comments } from './comments';
import { useFeedState } from './feed-state';
import { VideoSurface } from './video-surface';
export function VideoPost({ item, height, active }: {
    item: FeedItem;
    height: number;
    active: boolean;
}) {
    const router = useRouter();
    const social = useCommunity();
    const { liked, saved, followed, reshared, shared, toggleLike, toggleSave, toggleFollow, addToCart, openReshare, openShare, openBid, showIntegrationNotice } = useFeedState();
    const [muted, setMuted] = useState(true);
    const [paused, setPaused] = useState(false);
    const [commentsOpen, setCommentsOpen] = useState(false);
    const uploaderName = item.remote?.authorName || item.store;
    const openSeller = () => router.push({ pathname: '/store', params: { seller: item.store, userId: item.remote?.authorId ?? '' } });
    const openProduct = () => router.push({ pathname: '/product', params: { id: item.id } });
    function shareProduct() {
        openShare(item);
    }
    return (<View style={[styles.root, { height }]}>
      <VideoSurface asset={item.videoAsset} uri={item.videoUrl} poster={item.image} active={active} paused={paused} muted={muted}/>
      <View pointerEvents="none" style={styles.tint}/>
      <Pressable onPress={() => setPaused(value => !value)} style={StyleSheet.absoluteFill} accessibilityLabel={paused ? 'Play video' : 'Pause video'}/>
      {paused && <View pointerEvents="none" style={styles.playIcon}><Ionicons name="play-circle" size={68} color="rgba(255,255,255,0.88)"/></View>}

      <Pressable onPress={() => setMuted(value => !value)} accessibilityLabel={muted ? 'Unmute video' : 'Mute video'} style={styles.mute}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#FFFFFF"/>
      </Pressable>

      <View style={styles.rail}>
        <Pressable style={styles.railAction} onPress={() => toggleLike(item.id)} accessibilityLabel="Like video">
          <Ionicons name={(item.remote?.viewerLiked || liked.includes(item.id)) ? 'heart' : 'heart-outline'} color={(item.remote?.viewerLiked || liked.includes(item.id)) ? Colors.light.red : '#FFFFFF'} size={29}/>
          <GText tone="white" weight="bold" style={styles.railLabel}>{shortCount(item.remote ? item.likes : item.likes + Number(liked.includes(item.id)))}</GText>
        </Pressable>
        <Pressable style={styles.railAction} onPress={() => item.remote ? router.push({pathname:'/comments' as any,params:{productId:item.remote.productId}}) : setCommentsOpen(true)} accessibilityLabel="Video comments">
          <Ionicons name="chatbubble-outline" color="#FFFFFF" size={28}/>
          <GText tone="white" weight="bold" style={styles.railLabel}>{shortCount(item.remote ? item.comments : item.comments + social.commentsFor(item.id).filter(c => !c.deleted).length)}</GText>
        </Pressable>
        <Pressable style={styles.railAction} onPress={() => toggleSave(item.id)} accessibilityLabel="Save video">
          <Ionicons name={saved.includes(item.id) ? 'bookmark' : 'bookmark-outline'} color={saved.includes(item.id) ? Colors.light.yellow : '#FFFFFF'} size={28}/>
          <GText tone="white" style={styles.railLabel}>Save</GText>
        </Pressable>
        <Pressable style={styles.railAction} onPress={() => openReshare(item)} accessibilityLabel="Reshare video & earn">
          <Ionicons name="repeat" color={(item.remote?.viewerReshared || (!item.remote&&reshared.includes(item.id))) ? Colors.light.yellow : '#FFFFFF'} size={29}/>
          <GText tone="white" style={styles.railLabel}>{shortCount(item.remote ? (item.reshares??0) : (item.reshares ?? 0) + Number(reshared.includes(item.id)))}</GText>
        </Pressable>
        <Pressable style={styles.railAction} onPress={() => void shareProduct()} accessibilityLabel="Share video">
          <Ionicons name="paper-plane-outline" color="#FFFFFF" size={28}/>
          <GText tone="white" style={styles.railLabel}>{shortCount(item.remote ? (item.shares??0) : (item.shares ?? 0) + (shared[item.id] ?? 0))}</GText>
        </Pressable>
        <Pressable style={styles.addToCart} onPress={() => addToCart(item)} accessibilityLabel="Add video product to cart">
          <Ionicons name="cart-outline" color="#FFFFFF" size={26}/>
        </Pressable>
      </View>

      <View style={styles.caption}>
        <View style={styles.sellerRow}>
          <Pressable onPress={openSeller} style={styles.sellerLink} accessibilityLabel={`Open ${item.store} profile`}>
            <View style={styles.avatar}>{item.remote?.avatarUrl ? <Image source={{ uri: item.remote.avatarUrl }} style={{ width: '100%', height: '100%', borderRadius: 20 }}/> : <GText tone="white" weight="bold">{uploaderName[0]}</GText>}</View>
            <View style={styles.sellerName}>
              <GText tone="white" weight="bold" numberOfLines={1} style={{ fontSize: 15 }}>{uploaderName}</GText>
              <GText tone="white" style={{ fontSize: 11 }}>{item.offer ? `Reshared by ${item.offer.promoterName}` : item.handle}</GText>
            </View>
          </Pressable>
          <Pressable style={styles.follow} onPress={() => toggleFollow(item.remote?.authorId??item.store)} accessibilityLabel={`Follow ${item.store}`}>
            <GText weight="bold" style={{ fontSize: 11, color: '#111111' }}>{followed.includes(item.remote?.authorId??item.store) ? 'Following' : 'Follow'}</GText>
          </Pressable>
        </View>
        <PurchaseActions item={item} overlay/>
        <Pressable onPress={openProduct} accessibilityLabel={`View details of ${item.name}`} style={styles.productLink}>
          <GText tone="white" weight="bold" numberOfLines={2} style={styles.productName}>{item.name}</GText>
          <GText tone="white" style={styles.price}>{listingPrice(item)}</GText>
          <GText tone="white" numberOfLines={2} style={styles.description}>{item.description}</GText>
        </Pressable>
      </View>
      <Comments postId={item.id} open={commentsOpen} close={() => setCommentsOpen(false)} title={item.name}/>
    </View>);
}
const styles = StyleSheet.create({
    root: { backgroundColor: '#090909', overflow: 'hidden' },
    tint: { zIndex: 1, position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.17)' },
    playIcon: { zIndex: 2, position: 'absolute', alignSelf: 'center', top: '42%' },
    mute: { zIndex: 2, position: 'absolute', top: 106, right: 14, width: 42, height: 42, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.42)', alignItems: 'center', justifyContent: 'center' },
    rail: { zIndex: 2, position: 'absolute', right: 9, bottom: 18, alignItems: 'center', gap: 11 },
    railAction: { width: 55, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    railLabel: { fontSize: 10, marginTop: 2 },
    addToCart: { width: 49, height: 49, borderRadius: 25, backgroundColor: Colors.light.red, justifyContent: 'center', alignItems: 'center' },
    caption: { zIndex: 2, position: 'absolute', left: 15, right: 72, bottom: 23 },
    sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sellerLink: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 7 },
    avatar: { width: 39, height: 39, borderRadius: 20, backgroundColor: Colors.light.red, alignItems: 'center', justifyContent: 'center' },
    sellerName: { flexShrink: 1 },
    follow: { borderRadius: 19, backgroundColor: '#FFFFFF', paddingVertical: 7, paddingHorizontal: 12 },
    productLink: { paddingTop: 2 },
    productName: { fontSize: 20, lineHeight: 24, fontWeight: '700' },
    price: { fontSize: 18, lineHeight: 22, marginTop: 2 },
    description: { fontSize: 14, lineHeight: 19, marginTop: 3 },
});
