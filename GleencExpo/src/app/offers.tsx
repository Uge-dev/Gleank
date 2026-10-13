import { FRONTEND_PREVIEW } from '@/config/preview';
import { OffersPage as ServerScreen } from '@/features/live/seller-tools';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { Box } from '@/features/marketplace/ui';
import { formatPrice } from '@/features/feed/data';
function PreviewOffers() { const router = useRouter(); const { colors } = useAppTheme(); const { quotes, buyerId } = useMarketplace(); return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={{ height: 59, padding: 16, flexDirection: 'row', gap: 15 }}><Pressable onPress={() => router.back()}><Ionicons name="arrow-back" size={23} color={colors.text}/></Pressable><GText weight="bold" style={{ fontSize: 22 }}>Your price offers</GText></View><ScrollView contentContainerStyle={{ padding: 18, gap: 13 }}>{quotes.filter(q => q.buyerId === buyerId || q.sellerId === buyerId).map(q => <Pressable key={q.id} onPress={() => router.push({ pathname: '/offer', params: { id: q.id } })}><Box><GText weight="bold">{q.item.name} · {q.quantity} {q.item.plan?.unit ?? 'items'}</GText><GText>{formatPrice((q.approvedKobo ?? q.requestedKobo) * q.quantity)}</GText><GText tone="muted">{q.expiresAt <= Date.now() && q.state !== 'purchased' ? 'expired' : q.state} · {q.item.store}</GText></Box></Pressable>)}{!quotes.length ? <GText tone="muted">Make an offer from a product post to start a negotiation.</GText> : null}</ScrollView></SafeAreaView>; }

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewOffers/> : <ServerScreen/>;}
