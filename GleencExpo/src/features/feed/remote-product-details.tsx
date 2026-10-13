import { ScrollView, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GText } from '@/components/gleenc/text';
import { ProductGallery } from '@/components/products/product-gallery';
import { useAppTheme } from '@/hooks/use-app-theme';
import { listingPrice, type FeedItem } from './data';
import { useFeedState } from './feed-state';
/** Read-only server-backed details while purchasing is integrated in the next stage. */
export function RemoteProductDetails({ item }: { item: FeedItem }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { showIntegrationNotice } = useFeedState();
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Pressable onPress={() => router.back()} style={{ flexDirection: 'row', gap: 8, paddingVertical: 8 }}><Ionicons name="arrow-back" size={22} color={colors.text}/><GText weight="bold">Back to Market</GText></Pressable>
      <View style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: colors.surface }}><ProductGallery images={item.images ?? []} height={320} showThumbnails/></View>
      <GText weight="bold" style={{ fontSize: 24 }}>{item.name}</GText>
      <GText weight="bold" style={{ fontSize: 23 }}>{listingPrice(item)}</GText>
      <GText tone="muted">{item.category} · {item.productType === 'digital' ? 'Digital product' : `${item.stock} in stock`}</GText>
      {item.remote?.markupBps ? <GText tone="muted">Includes this post’s {item.remote.markupBps / 100}% reshare markup.</GText> : null}
      <GText>{item.fullDescription || item.description}</GText>
      <Pressable onPress={() => router.push({ pathname: '/store', params: { seller: item.store, userId: item.remote?.ownerId ?? '' } })} style={{ paddingVertical: 12 }}><GText weight="bold">Sold by {item.store} →</GText></Pressable>
      {item.remote?.orderingFormat ? <GText tone="muted">Ordering: {item.remote.orderingFormat.replace(/_/g, ' ')}</GText> : null}
      <Pressable accessibilityLabel="Add to cart" onPress={showIntegrationNotice} style={{ backgroundColor: colors.text, padding: 16, borderRadius: 14, alignItems: 'center' }}><GText weight="bold" style={{ color: colors.background }}>Add to cart</GText></Pressable>
    </ScrollView>
  </SafeAreaView>;
}
