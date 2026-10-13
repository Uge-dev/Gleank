import { OfferPage as ServerScreen } from '@/features/live/seller-tools';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Field } from '@/features/create/controls';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { Box, Button } from '@/features/marketplace/ui';
import { naira, quoteSplit, offerMinimumPercent, offerPrice } from '@/features/marketplace/domain';
import { formatPrice } from '@/features/feed/data';
import { FRONTEND_PREVIEW } from '@/config/preview';
function PreviewOffer() {
    const { id } = useLocalSearchParams<{
        id: string;
    }>();
    const router = useRouter();
    const { colors } = useAppTheme();
    const market = useMarketplace();
    const q = market.quotes.find(q => q.id === id);
    const [sellerView, setSellerView] = useState(false);
    const [counter, setCounter] = useState('');
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
    const expired = !!q && q.expiresAt <= now;
    const seller = !!q && (market.buyerId === q.sellerId || (FRONTEND_PREVIEW && sellerView));
    const live = !!q && !expired && !['purchased', 'declined', 'cancelled'].includes(q.state);
    const respond = (action: 'accept' | 'decline' | 'counter' | 'cancel') => { try {
        market.respondOffer(id, action, action === 'counter' ? naira(counter) : undefined, FRONTEND_PREVIEW && sellerView);
    }
    catch (e) {
        Alert.alert('Unable to respond', e instanceof Error ? e.message : 'Try again.');
    } };
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={{ height: 59, paddingHorizontal: 19, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Pressable onPress={() => router.back()} style={{ minWidth: 35, minHeight: 42, justifyContent: 'center' }}><Ionicons name="arrow-back" size={23} color={colors.text}/></Pressable><GText weight="bold" style={{ fontSize: 23 }}>Private offer</GText></View><ScrollView contentContainerStyle={{ padding: 20, gap: 17, maxWidth: 650, width: '100%', alignSelf: 'center' }}>{!q ? <GText>Offer unavailable.</GText> : <>
 {FRONTEND_PREVIEW ? <View style={{ flexDirection: 'row', gap: 9 }}><Button secondary={!sellerView} title="Buyer view" onPress={() => setSellerView(false)}/><Button secondary={sellerView} title="Test seller response" onPress={() => setSellerView(true)}/></View> : null}
 <Box><Image source={{ uri: q.item.image }} style={{ width: '100%', height: 170, borderRadius: 13 }}/><GText weight="bold" style={{ fontSize: 20 }}>{q.quantity} × {q.item.name}</GText><GText tone="muted">Original seller · {q.item.store}</GText>{q.item.config?.selections.map(c => <GText key={c.id}>{c.name}: {c.quantity} {c.unit} per pack</GText>)}<GText tone="muted">Listed total {formatPrice(q.item.priceKobo * q.quantity)}</GText><GText weight="bold" style={{ fontSize: 28 }}>{formatPrice((q.approvedKobo ?? q.requestedKobo) * q.quantity)}</GText><GText weight="bold" style={{ color: q.state === 'accepted' ? colors.success : colors.text }}>{expired && q.state !== 'purchased' ? 'Expired' : q.state === 'counter' ? 'Seller counteroffer' : q.state}</GText>{q.state !== 'purchased' ? <GText tone="muted">Valid until {new Date(q.expiresAt).toLocaleString()}</GText> : null}{q.note ? <GText>{q.buyerName}: {q.note}</GText> : null}{q.item.offer ? <><GText>Seller proceeds {formatPrice((q.sellerKobo ?? quoteSplit(q.item, q.requestedKobo).sellerKobo) * q.quantity)}</GText><GText tone="muted">Reshare attribution: {q.item.offer.promoterName}</GText>{q.commissionKobo !== undefined ? <GText>Commission {formatPrice(q.commissionKobo * q.quantity)}</GText> : null}</> : null}</Box>
 {live && seller && q.state === 'pending' ? <><Button title="Accept buyer's price" onPress={() => respond('accept')}/><Field label="Counteroffer per pack/item ₦" note={"Allowed: " + formatPrice(offerPrice(q.item, offerMinimumPercent(q.item.plan))) + "–" + formatPrice(q.item.priceKobo) + " per unit; maximum 20% off."} value={counter} onChange={setCounter} keyboardType="decimal-pad"/><Button secondary title="Send counteroffer" onPress={() => respond('counter')}/><Button secondary title="Decline offer" onPress={() => respond('decline')}/></> : null}
 {live && !seller && q.buyerId === market.buyerId && q.state === 'counter' ? <Button title="Accept seller's counteroffer" onPress={() => respond('accept')}/> : null}
 {live && !seller && q.state === 'accepted' && q.buyerId === market.buyerId ? <Button title="Checkout accepted offer" onPress={() => router.push({ pathname: '/checkout', params: { source: 'quote', quoteId: q.id } })}/> : null}
 {live && !seller && q.buyerId === market.buyerId && ['pending', 'counter'].includes(q.state) ? <Button secondary title="Cancel my offer" onPress={() => respond('cancel')}/> : null}
 <Button secondary title="Open conversation" onPress={() => router.push({ pathname: '/chat', params: { seller: q.item.store } })}/><GText tone="muted">This private price covers the exact quantity and configuration above. It does not change the public listing. Delivery is separate; payment is held until receipt.</GText>
 </>}</ScrollView></SafeAreaView>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewOffer/> : <ServerScreen/>;}
