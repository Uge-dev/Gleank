import { SellerPage as ServerScreen } from '@/features/live/social-pages';
import { RemoteSeller } from '@/features/feed/remote-seller';
import { useProfileMedia } from '@/features/profile/profile-media';
import { useAuth } from '@/hooks/use-auth';
import { FRONTEND_PREVIEW, PREVIEW_ACCOUNT_ID } from '@/config/preview';
import { useCommunity } from '@/features/community/community-state';
import { sellerAvatar } from '@/features/chat/chat-state';
import { useAccount } from '@/features/account/account-state';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { ProfileMenu } from '@/features/marketplace/profile-menu';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { FEED, PROFILE_PRODUCTS, formatPrice, type FeedItem } from '@/features/feed/data';
import { useFeedState } from '@/features/feed/feed-state';
import { useChat } from '@/features/chat/chat-state';
function Stage1Store() {
    return FRONTEND_PREVIEW ? <PreviewStore/> : <RemoteSeller/>;
}
function PreviewStore() {
    const social = useCommunity();
    const { user } = useAuth();
    const photos = useProfileMedia(user?.id ?? (FRONTEND_PREVIEW ? PREVIEW_ACCOUNT_ID : ''));
    const router = useRouter();
    const { colors } = useAppTheme();
    const account = useAccount();
    const market = useMarketplace();
    const { seller } = useLocalSearchParams<{
        seller?: string;
    }>();
    const storeName = typeof seller === 'string' && seller.trim() ? seller : 'Movers';
    const ownStore = storeName === account.profile.storeName || market.posts.some(p => p.store === storeName && p.sellerId === market.ownerId);
    const handle = `@${storeName.toLowerCase().replace(/\s+/g, '-')}`;
    const { catalog, followed, saved, toggleFollow, requireAccount } = useFeedState();
    const { startConversation } = useChat();
    const [query, setQuery] = useState('');
    const [section, setSection] = useState<'grid' | 'products' | 'menu' | 'saved' | 'about'>('grid');
    const [category, setCategory] = useState('All');
    const products = catalog.filter(item => item.store === storeName && !item.id.startsWith('CAT-'));
    const data = products.filter(item => (category === 'All' || item.category === category)
        && (section !== 'saved' || saved.includes(item.id))
        && item.name.toLowerCase().includes(query.trim().toLowerCase()));
    const cover = ownStore && photos.media.cover ? photos.media.cover : storeName === 'Movers'
        ? 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1000'
        : products[0]?.image;
    return (<SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.nav}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back"><Ionicons name="arrow-back" color={colors.text} size={24}/></Pressable>
        <GText weight="bold" numberOfLines={1} style={{ fontSize: 17, maxWidth: '65%' }}>{storeName}</GText>
        <Pressable onPress={() => Share.share({ message: `Meet ${storeName} on Gleenc` })} accessibilityLabel="Share store">
          <Ionicons name="paper-plane-outline" color={colors.text} size={23}/>
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        {cover ? <Image source={{ uri: cover }} style={styles.cover}/> : <View style={[styles.cover, { backgroundColor: colors.primary }]}/>}
        <View style={[styles.summary, { borderColor: colors.border }]}>
          <View style={[styles.avatar, { borderColor: colors.surface, backgroundColor: colors.primary }]}><Image source={{ uri: ownStore && photos.media.avatar ? photos.media.avatar : sellerAvatar(storeName) }} style={{ width: 76, height: 76, borderRadius: 38 }}/></View>
          <View style={styles.buttons}>
            <Pressable onPress={() => toggleFollow(storeName)} style={[styles.primary, { backgroundColor: colors.text }]} accessibilityLabel={`Follow ${storeName}`}>
              <Ionicons name="person-add-outline" color={colors.background} size={16}/>
              <GText weight="bold" style={{ fontSize: 12, color: colors.background }}>{followed.includes(storeName) ? 'Following' : 'Follow'}</GText>
            </Pressable>
            <Pressable onPress={() => requireAccount(() => {
            startConversation(storeName);
            router.push({ pathname: '/chat', params: { seller: storeName } });
        })} style={[styles.secondary, { backgroundColor: colors.surfaceSecondary }]} accessibilityLabel="Message seller">
              <Ionicons name="chatbubble-outline" color={colors.text} size={16}/><GText style={{ fontSize: 12 }}>Message</GText>
            </Pressable>
            <Pressable onPress={() => Share.share({ message: `Meet ${storeName} on Gleenc` })} style={[styles.secondary, { backgroundColor: colors.surfaceSecondary }]} accessibilityLabel="Share store">
              <Ionicons name="paper-plane-outline" size={18} color={colors.text}/>
            </Pressable>
          </View>
          <GText weight="bold" style={{ fontSize: 23, marginTop: 12 }}>{storeName} <GText tone="muted" style={{ fontSize: 13 }}>  |  {ownStore ? '@' + account.profile.username : handle}</GText></GText>
          <View style={{ flexDirection: 'row', gap: 18, flexWrap: 'wrap', marginTop: 9 }}><GText weight="bold">{products.length} products</GText>{(['followers', 'following'] as const).map(mode => <Pressable key={mode} accessibilityRole="button" onPress={() => router.push({ pathname: '/connections', params: { seller: storeName, mode } })} style={{ minHeight: 44, justifyContent: 'center' }}><GText weight="bold">{(mode === 'followers' ? social.followersFor(storeName) : social.followingFor(storeName)).length} {mode}</GText></Pressable>)}</View><Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/report', params: { kind: 'account', id: storeName, author: storeName } })} style={{ minHeight: 44, justifyContent: 'center' }}><GText tone="muted">Report or block account</GText></Pressable>
          <GText style={{ fontSize: 13, marginTop: 10 }}>{storeName === 'Movers' ? 'We Sell Food and Kitchen Utensils' : `Browse products and videos from ${storeName}.`}</GText>
        </View>
        <Pressable onPress={() => router.push({ pathname: '/catalogue', params: { seller: storeName } })} style={[styles.search, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name="restaurant-outline" size={20} color={colors.text}/><GText weight="bold">Menu & prices · Order from catalogue</GText><Ionicons name="chevron-forward" size={18} color={colors.text}/></Pressable>
        <View style={styles.circles}>
          {['All', 'Food', 'Favorites'].map((label, index) => (<Pressable key={label} onPress={() => {
                setCategory(label === 'Food' ? 'Food' : 'All');
                setSection(label === 'Favorites' ? 'saved' : 'grid');
            }} style={{ alignItems: 'center', gap: 6 }}>
              <View style={[styles.circle, { borderColor: colors.border }, ((label === 'Favorites' && section === 'saved') || (label !== 'Favorites' && section !== 'saved' && category === label)) && { borderColor: colors.primary }]}>
                {index && products[index - 1]?.image ? <Image source={{ uri: products[index - 1].image }} style={styles.circleImage}/> : <Ionicons name="grid-outline" size={18} color={colors.primary}/>}
              </View>
              <GText weight="bold" tone={(label === 'Favorites' ? section === 'saved' : section !== 'saved' && category === label) ? 'red' : 'ink'} style={{ fontSize: 12 }}>{label}</GText>
            </Pressable>))}
        </View>
        <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}><Ionicons name="search-outline" size={19} color={colors.textMuted}/><TextInput value={query} onChangeText={setQuery} placeholder="Search this store..." placeholderTextColor={colors.textMuted} style={[styles.searchInput, { color: colors.text }]}/></View>
        <View style={[styles.tabs, { borderColor: colors.border }]}>
          {(['grid', 'products', 'menu', 'saved', 'about'] as const).map((key, index) => (<Pressable key={key} onPress={() => setSection(key)} style={[styles.tab, section === key && [styles.tabSelected, { borderColor: colors.text }]]} accessibilityLabel={key}>
              <Ionicons name={(['grid-outline', 'bag-handle-outline', 'restaurant-outline', 'bookmark-outline', 'information-circle-outline'] as const)[index]} size={23} color={section === key ? colors.text : colors.textMuted}/>
            </Pressable>))}
        </View>
        {section === 'menu' ? <ProfileMenu store={storeName}/> : section === 'about' ? <View style={{ padding: 24, gap: 12 }}><GText weight="bold">About {storeName}</GText>{ownStore && !account.preferences.privateProfile ? <><GText>{account.profile.storeDescription || account.profile.bio}</GText><GText tone="muted">{account.profile.city}, {account.profile.state}</GText></> : <GText tone="muted">Browse this store's public listings and seller menu.</GText>}</View> : data.length ? (<View style={styles.grid}>{data.map(item => <ProductTile key={item.id} product={item} onOpen={() => router.push({ pathname: '/product', params: { id: item.id } })}/>)}</View>) : <GText tone="muted" style={{ textAlign: 'center', padding: 35 }}>No products here yet.</GText>}
      </ScrollView>
    </SafeAreaView>);
}
function ProductTile({ product, onOpen }: {
    product: FeedItem;
    onOpen: () => void;
}) {
    const { colors } = useAppTheme();
    const account = useAccount();
    const market = useMarketplace();
    return (<Pressable onPress={onOpen} style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.tileImageWrap}><Image source={{ uri: product.image }} style={styles.tileImage}/><View style={styles.category}><GText tone="white" style={{ fontSize: 11 }}>{product.category}</GText></View></View>
      <GText weight="bold" numberOfLines={1} style={styles.tileTitle}>{product.name}</GText>
      <GText tone="muted" style={styles.tileMeta}>{product.category} · {product.stock} in stock</GText>
      <GText tone="muted" style={styles.tileMeta}>{product.store}</GText>
      <View style={styles.tileFooter}><GText weight="bold" style={{ fontSize: 14 }}>{formatPrice(product.priceKobo)}</GText><GText tone="muted" style={{ fontSize: 11 }}>{product.views} views</GText></View>
    </Pressable>);
}
const styles = StyleSheet.create({
    root: { flex: 1 }, nav: { height: 45, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cover: { height: 182, width: '100%' }, summary: { paddingHorizontal: 17, paddingBottom: 25, borderBottomWidth: 1 },
    avatar: { width: 90, height: 90, borderRadius: 46, marginTop: -45, backgroundColor: '#171717', alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: '#FFFFFF' },
    buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 7, marginTop: -22 },
    primary: { paddingHorizontal: 13, height: 34, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
    secondary: { paddingHorizontal: 13, height: 34, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
    circles: { flexDirection: 'row', gap: 24, padding: 22, alignItems: 'flex-start' },
    circle: { width: 70, height: 70, borderWidth: 2, borderColor: '#F7BB47', borderRadius: 40, padding: 3, alignItems: 'center', justifyContent: 'center' },
    circleImage: { width: '100%', height: '100%', borderRadius: 40 },
    search: { margin: 15, marginTop: 5, paddingHorizontal: 16, height: 44, borderRadius: 24, borderWidth: 1, flexDirection: 'row', gap: 9, alignItems: 'center' },
    searchInput: { fontFamily: 'ReoSans-Medium', fontSize: 13, flex: 1 },
    tabs: { flexDirection: 'row', borderBottomWidth: 1, marginTop: 2 },
    tab: { flex: 1, height: 53, alignItems: 'center', justifyContent: 'center' }, tabSelected: { borderBottomWidth: 2 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 7, paddingTop: 20, paddingBottom: 32 },
    tile: { width: '48.7%', borderWidth: 1, borderRadius: 19, overflow: 'hidden', paddingBottom: 13 }, tileImageWrap: { height: 180 }, tileImage: { width: '100%', height: '100%' },
    category: { position: 'absolute', bottom: 10, left: 10, backgroundColor: '#333333', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
    tileTitle: { textAlign: 'center', marginTop: 10, fontSize: 13, paddingHorizontal: 6 }, tileMeta: { textAlign: 'center', fontSize: 11, marginTop: 3 },
    tileFooter: { flexDirection: 'row', justifyContent: 'center', gap: 11, marginTop: 10 },
});

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <Stage1Store/> : <ServerScreen/>;}
