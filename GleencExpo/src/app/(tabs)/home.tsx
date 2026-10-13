import { useLive } from '@/features/live/state';
import { api } from '@/services/api';
import { useCommunity } from '@/features/community/community-state';
import { useEffect } from 'react';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StatusBar, StyleSheet, useWindowDimensions, View, type ViewToken } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/hooks/use-auth';
import { FEED, type FeedItem } from '@/features/feed/data';
import { useFeedState } from '@/features/feed/feed-state';
import { ProductPost } from '@/features/feed/product-post';
import { VideoPost } from '@/features/feed/video-post';
import { FRONTEND_PREVIEW } from '@/config/preview';
const tabs = ['Hot Product', 'New Vendors', 'Following'] as const;
type FeedTab = (typeof tabs)[number];
export default function Home() {
    const social = useCommunity();
    const live=useLive();
    const viewed=useRef(new Set<string>());
    const { colors, isDark } = useAppTheme();
    const { width } = useWindowDimensions();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user, sessionNotice } = useAuth();
    const { followed, reshared, cart, catalog, feedLoading, feedLoadingMore, feedError, refreshFeed, loadMoreFeed, setFeedMode } = useFeedState();
    const [tab, setTab] = useState<FeedTab>('Hot Product');
    const [pageHeight, setPageHeight] = useState(650);
    const [activeId, setActiveId] = useState(FEED[0]?.id ?? '');
    const [screenFocused, setScreenFocused] = useState(true);
    const list = useRef<FlatList<FeedItem>>(null);
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
    useFocusEffect(useCallback(() => {
        setScreenFocused(true);
        return () => setScreenFocused(false);
    }, []));
    const feed = catalog.filter(item => !item.id.startsWith("CAT-")).sort((a, b) => b.createdAt - a.createdAt);
    const items = !FRONTEND_PREVIEW ? (tab === 'New Vendors'
      ? feed.filter((item, index) => feed.findIndex(other => other.remote?.authorId === item.remote?.authorId) === index) : feed) : tab === 'Following'
        ? feed.filter(item => Boolean((user || FRONTEND_PREVIEW) && (followed.includes(item.store) || reshared.includes(item.id))))
        : tab === 'New Vendors'
            ? feed.filter((item, index) => feed.findIndex(other => other.store === item.store) === index)
            : feed;
    const current = items.find(item => item.id === activeId) ?? items[0];
    const videoHeader = current?.kind === 'video' && !(tab === 'Following' && !user && !FRONTEND_PREVIEW);
    useEffect(() => {
        if (!FRONTEND_PREVIEW && screenFocused && current?.remote && user?.emailVerified && live.account?.termsVersion===live.capabilities.termsVersion && !viewed.current.has(current.remote.postId)) {
            viewed.current.add(current.remote.postId);
            void api.posts.event(current.remote.postId,'view').catch(()=>viewed.current.delete(current.remote!.postId));
        }
        if (FRONTEND_PREVIEW && screenFocused && current && social.ready)
            social.track(current.id, 'view');
    }, [screenFocused, current?.id, social.ready]);
    useEffect(() => {
        if (items.length && !items.some(item => item.id === activeId)) setActiveId(items[0].id);
    }, [items, activeId]);
    const navHeight = insets.top + 54;
    // Every item has exactly one viewport of space, regardless of its media type.
    const availableCardHeight = Math.max(0, pageHeight - navHeight - 12);
    const compact = availableCardHeight < 510;
    const onViewable = useRef(({ viewableItems }: {
        viewableItems: ViewToken[];
    }) => {
        const id = (viewableItems[0]?.item as FeedItem | undefined)?.id;
        if (id)
            setActiveId(id);
    }).current;
    function changeTab(next: FeedTab) {
        setTab(next);
        setFeedMode(next === 'Following' ? 'following' : next === 'New Vendors' ? 'vendors' : 'hot');
        const first = next === 'Following'
            ? feed.find(item => (user || FRONTEND_PREVIEW) && (followed.includes(item.store) || reshared.includes(item.id)))
            : feed[0];
        setActiveId(first?.id ?? '');
        list.current?.scrollToOffset({ offset: 0, animated: false });
    }
    return (<View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={videoHeader ? 'light-content' : isDark ? 'light-content' : 'dark-content'}/>
      {tab === 'Following' && !user && !FRONTEND_PREVIEW ? (<View style={styles.empty}>
          <GText weight="bold" style={{ fontSize: 20 }}>See sellers you follow</GText>
          <GText tone="muted">Sign in to follow sellers and reshare products.</GText>
          <Pressable onPress={() => router.push('/login')} style={[styles.signIn, { backgroundColor: colors.primary }]}><GText tone="white" weight="bold">Sign in</GText></Pressable>
        </View>) : (<View style={styles.viewport} onLayout={event => setPageHeight(event.nativeEvent.layout.height)}>
          <FlatList ref={list} key={tab} data={items} refreshing={!FRONTEND_PREVIEW && feedLoading} onRefresh={() => void refreshFeed()}
            onEndReached={() => { if (!FRONTEND_PREVIEW && !feedError) void loadMoreFeed(); }} onEndReachedThreshold={0.6}
            ListFooterComponent={feedLoadingMore ? <ActivityIndicator style={{ padding: 16 }} color={colors.text}/> : feedError && items.length ? <Pressable onPress={() => void refreshFeed()} style={{ padding: 20 }}><GText tone="muted">{feedError}</GText><GText weight="bold">Retry</GText></Pressable> : null}
            keyExtractor={item => item.id} showsVerticalScrollIndicator={false} pagingEnabled removeClippedSubviews={false} initialNumToRender={2} maxToRenderPerBatch={2} windowSize={3} getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })} viewabilityConfig={viewabilityConfig} onViewableItemsChanged={onViewable} ListEmptyComponent={<View style={styles.empty}>
              {feedLoading ? <ActivityIndicator color={colors.text}/> : <>
                <GText weight="bold">{feedError ? 'Could not load products' : 'No products yet'}</GText>
                <GText tone="muted">{feedError || sessionNotice || (tab === 'Following' ? 'Products from followed sellers will appear here.' : 'Published products from this backend will appear here.')}</GText>
                <Pressable onPress={() => void refreshFeed()} style={styles.signIn}><GText weight="bold">Refresh</GText></Pressable>
                <Pressable onPress={() => void loadMoreFeed()}><GText tone="muted">Check more posts</GText></Pressable>
              </>}
            </View>} renderItem={({ item }) => (<View style={{ height: pageHeight }}>
                {item.kind === 'video' ? (<VideoPost item={item} active={screenFocused && activeId === item.id} height={pageHeight}/>) : (<View style={{ paddingTop: navHeight + 6, paddingBottom: 6 }}>
                    <ProductPost item={item} availableHeight={availableCardHeight} compact={compact}/>
                  </View>)}
              </View>)}/>
        </View>)}
      <View style={[styles.nav, { height: navHeight, paddingTop: insets.top, backgroundColor: videoHeader ? 'rgba(0,0,0,0.30)' : colors.surface, borderBottomColor: videoHeader ? 'transparent' : colors.border }]}>
        <View style={styles.navGroup}>
          {tabs.map(label => (<Pressable key={label} onPress={() => changeTab(label)} style={[styles.navCell, { paddingHorizontal: width < 360 ? 3 : 8 }]} accessibilityLabel={label}>
              <GText weight="bold" numberOfLines={1} style={[styles.navText, { fontSize: width < 360 ? 10 : 12, color: videoHeader ? '#FFFFFF' : tab === label ? colors.primary : colors.text }]}>{label}</GText>
              {tab === label && <View style={[styles.underline, { backgroundColor: videoHeader ? '#FFFFFF' : colors.primary }]}/>}
            </Pressable>))}
          <Pressable onPress={() => router.push('/discover')} style={styles.navIcon} accessibilityLabel="Search products">
            <Ionicons name="search-outline" size={22} color={videoHeader ? '#FFFFFF' : colors.text}/>
          </Pressable>
          <Pressable onPress={() => router.push('/cart')} style={styles.navIcon} accessibilityLabel={`Cart, ${cart.length} products`}>
            <Ionicons name="cart-outline" size={22} color={videoHeader ? '#FFFFFF' : colors.text}/>
            {cart.length > 0 && <View style={[styles.cartBadge, { backgroundColor: colors.primary }]}><GText tone="white" weight="bold" style={{ fontSize: 9 }}>{cart.length}</GText></View>}
          </Pressable>
        </View>
      </View>
    </View>);
}
const styles = StyleSheet.create({
    screen: { flex: 1 }, viewport: { flex: 1 },
    nav: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
    navGroup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', maxWidth: '100%', gap: 3 },
    navCell: { minWidth: 0, height: 46, alignItems: 'center', justifyContent: 'center' },
    navIcon: { width: 38, height: 46, alignItems: 'center', justifyContent: 'center' },
    cartBadge: { position: 'absolute', top: 3, right: 1, minWidth: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
    navText: { textAlign: 'center' }, underline: { position: 'absolute', bottom: 2, height: 2, width: 21, borderRadius: 2 },
    empty: { flex: 1, minHeight: 380, alignItems: 'center', justifyContent: 'center', gap: 13, paddingHorizontal: 30 },
    signIn: { marginTop: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 14 },
});
