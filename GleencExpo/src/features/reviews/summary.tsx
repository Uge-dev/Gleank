import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useReviews, reviewProductId } from './review-state';
import type { FeedItem } from '@/features/feed/data';
export function ReviewSummary({ item }: {
    item: FeedItem;
}) {
    const reviews = useReviews();
    const router = useRouter();
    const { colors } = useAppTheme();
    const rows = reviews.forProduct(reviewProductId(item));
    const rating = rows.length ? (rows.reduce((n, r) => n + r.rating, 0) / rows.length).toFixed(1) : '—';
    return <Pressable accessibilityRole="button" accessibilityLabel={`Reviews, rating ${rating}, ${rows.length} reviews`} onPress={() => router.push({ pathname: '/reviews', params: { id: item.id } })} style={{ minHeight: 76, flexDirection: 'row', gap: 14, alignItems: 'center' }}><Ionicons name="star" size={29} color="#D79A15"/><View style={{ flex: 1, gap: 5 }}><GText weight="bold" style={{ fontSize: 20 }}>{rating} <GText tone="muted">· {rows.length} reviews</GText></GText><GText tone="muted" style={{ fontSize: 13 }}>Ratings, buyer photos and seller replies</GText></View><Ionicons name="chevron-forward" size={20} color={colors.textMuted}/></Pressable>;
}
