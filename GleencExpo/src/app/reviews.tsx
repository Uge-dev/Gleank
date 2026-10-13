import { FRONTEND_PREVIEW } from '@/config/preview';
import { ReviewsPage as ServerScreen } from '@/features/live/social-pages';
import { LoadingState } from '@/features/experience/recovery';
import { useState } from 'react';
import { Alert, Image, Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFeedState } from '@/features/feed/feed-state';
import { useReviews, reviewProductId, type Review } from '@/features/reviews/review-state';
import { useCommunity } from '@/features/community/community-state';
import { CommunityConsent } from '@/features/community/terms';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { originalSeller } from '@/features/commerce/settlement';
import { useCommerce } from '@/features/commerce/commerce-state';
import { pickLibrary } from '@/features/media/picker';
import { retainMedia } from '@/features/media/retain-media';
import { explain } from '@/features/account/guards';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Page, Card, Input, Chips, Button, Empty, Notice, Picker } from '@/features/studio/ui';
import { GText } from '@/components/gleenc/text';
function PreviewProductReviews() {
    const { id } = useLocalSearchParams<{
        id?: string;
    }>();
    const { catalog } = useFeedState();
    const reviews = useReviews();
    const community = useCommunity();
    const market = useMarketplace();
    const commerce = useCommerce();
    const router = useRouter();
    const { colors } = useAppTheme();
    const [sort, setSort] = useState('Recent');
    const [rating, setRating] = useState(5);
    const [body, setBody] = useState('');
    const [photos, setPhotos] = useState<string[]>([]);
    const [lineId, setLine] = useState('');
    const [writing, setWriting] = useState(false);
    const [replyId, setReply] = useState('');
    const [response, setResponse] = useState('');
    const [photo, setPhoto] = useState('');
    const [limit, setLimit] = useState(15);
    const item = catalog.find(p => p.id === id) ?? commerce.orders.flatMap(o => o.items).map(r => r.item).find(p => p.id === id || reviewProductId(p) === id);
    const productId = item ? reviewProductId(item) : '';
    const eligible = reviews.eligible(productId);
    const selected = eligible.find(p => p.lineId === lineId) ?? eligible[0];
    const all = reviews.forProduct(productId);
    const visible = all.filter(r => sort !== 'With photos' || r.photos.length).sort((a, b) => sort === 'Top rated' ? b.rating - a.rating : b.at - a.at);
    const avg = all.length ? (all.reduce((n, r) => n + r.rating, 0) / all.length).toFixed(1) : '—';
    const run = (f: () => void) => {
        try {
            f();
        }
        catch (e) {
            Alert.alert('Review unavailable', explain(e));
        }
    };
    async function pickPhotos() {
        try {
            const selected = await pickLibrary('images', 4 - photos.length);
            const retained = await Promise.all(selected.map(p => retainMedia(p.uri)));
            setPhotos(p => [...p, ...retained].slice(0, 4));
        }
        catch (e) {
            Alert.alert('Photo unavailable', explain(e));
        }
    }
    function edit(r: Review) {
        setLine(r.lineId);
        setRating(r.rating);
        setBody(r.body);
        setPhotos(r.photos);
        setWriting(true);
    }
    if (!reviews.ready || !commerce.ready || !community.ready)
        return <Page title="Product reviews"><LoadingState label="Loading reviews…"/></Page>;
    if (!item)
        return <Page title="Reviews"><Empty title="Product unavailable" detail="Return to your order to find this product."/></Page>;
    return <Page title="Product reviews" subtitle={item.name}><Notice text={reviews.notice}/><Card><View style={{ flexDirection: 'row', gap: 22, alignItems: 'center' }}><View style={{ alignItems: 'center', gap: 6 }}><GText weight="bold" style={{ fontSize: 42 }}>{avg}</GText><GText tone="muted">{all.length} reviews</GText></View><View style={{ flex: 1, gap: 7 }}>{[5, 4, 3, 2, 1].map(n => <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><GText>{n}</GText><Ionicons name="star" color="#D79A15" size={12}/><View style={{ height: 6, borderRadius: 4, backgroundColor: colors.border, flex: 1, overflow: 'hidden' }}><View style={{ width: `${all.length ? 100 * all.filter(r => r.rating === n).length / all.length : 0}%`, backgroundColor: '#D79A15', height: 6 }}/></View></View>)}</View></View><Button title={writing ? 'Close review editor' : 'Write a review'} secondary disabled={!eligible.length} onPress={() => setWriting(v => !v)}/>{!eligible.length ? <GText tone="muted" style={{ fontSize: 12 }}>Reviews open after your purchase is completed. Refunded purchases are excluded.</GText> : null}</Card>
    {writing ? <Card>{!community.accepted ? <CommunityConsent /> : <>{eligible.length > 1 ? <Picker items={eligible.map(p => ({ id: p.lineId, title: p.orderId }))} value={selected?.lineId ?? ''} onChange={setLine}/> : null}<GText weight="bold">Your rating</GText><View style={{ flexDirection: 'row' }}>{[1, 2, 3, 4, 5].map(n => <Pressable key={n} accessibilityLabel={`${n} stars`} accessibilityRole="radio" accessibilityState={{ selected: rating === n }} onPress={() => setRating(n)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={n <= rating ? 'star' : 'star-outline'} size={31} color="#D79A15"/></Pressable>)}</View><Input label="Your experience" value={body} onChange={setBody} multiline maxLength={2000}/><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{photos.map(uri => <Pressable key={uri} accessibilityLabel="Remove review photo" onPress={() => setPhotos(p => p.filter(x => x !== uri))}><Image source={{ uri }} style={{ width: 64, height: 64, borderRadius: 12 }}/><GText style={{ textAlign: 'center', fontSize: 11 }}>Remove</GText></Pressable>)}</View><Button title="Add buyer photos" icon="images-outline" secondary disabled={photos.length >= 4} onPress={() => void pickPhotos()}/><Button title="Publish review" disabled={!selected || !body.trim()} onPress={() => run(() => {
                    reviews.saveReview(productId, selected!.orderId, selected!.lineId, rating, body, photos);
                    setWriting(false);
                    setBody('');
                    setPhotos([]);
                })}/></>}</Card> : null}
    <Chips items={['Recent', 'Top rated', 'With photos']} value={sort} onChange={v => {
            setSort(v);
            setLimit(15);
        }}/>
    {!visible.length ? <Empty title="No reviews yet" detail="Completed purchases can share ratings, photos and feedback." icon="star-outline"/> : null}
    {visible.slice(0, limit).map(r => <Card key={r.id}><View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Image source={{ uri: r.avatar }} style={{ width: 42, height: 42, borderRadius: 21 }}/><View style={{ flex: 1, gap: 4 }}><GText weight="bold">{r.name}</GText><GText style={{ fontSize: 11, color: '#258A65' }}>✓ Verified purchase</GText></View><Pressable accessibilityLabel="Review options" style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }} onPress={() => Alert.alert('Review', '', [...(r.ownerId === community.me.id ? [{ text: 'Edit', onPress: () => edit(r) }, { text: 'Delete', style: 'destructive' as const, onPress: () => run(() => reviews.removeReview(r.id)) }] : []), { text: 'Report', onPress: () => router.push({ pathname: '/report', params: { kind: 'review', id: r.id, author: r.name } }) }, { text: 'Cancel', style: 'cancel' }])}><Ionicons name="ellipsis-horizontal" size={22} color={colors.text}/></Pressable></View><GText style={{ color: '#D79A15' }}>{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</GText><GText style={{ lineHeight: 21 }}>{r.body}</GText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{r.photos.map(uri => <Pressable key={uri} onPress={() => setPhoto(uri)} accessibilityLabel="Open buyer photo"><Image source={{ uri }} style={{ width: 75, height: 75, borderRadius: 12 }}/></Pressable>)}</View><GText tone="muted" style={{ fontSize: 11 }}>{new Date(r.updatedAt).toLocaleDateString()}</GText><Pressable accessibilityLabel={`Helpful, ${r.helpful.length} votes`} onPress={() => run(() => reviews.helpful(r.id))} style={{ minHeight: 44, justifyContent: 'center' }}><GText weight="bold">Helpful · {r.helpful.length}</GText></Pressable>{r.reply ? <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.surfaceSecondary, gap: 5 }}><GText weight="bold">Seller response</GText><GText>{r.reply.text}</GText></View> : null}{commerce.orders.some(o => o.items.some(row => row.lineId === r.lineId && originalSeller(row) === market.ownerId)) ? <Button title="Reply as seller" secondary onPress={() => {
                    setReply(r.id);
                    setResponse(r.reply?.text ?? '');
                }}/> : null}{replyId === r.id ? <><Input label="Seller response" value={response} onChange={setResponse} multiline maxLength={2000}/><Button title="Send response" onPress={() => run(() => {
                    reviews.reply(r.id, response);
                    setReply('');
                })}/></> : null}</Card>)}
    {visible.length > limit ? <Button title="Load more reviews" secondary onPress={() => setLimit(n => n + 15)}/> : null}
    <Modal visible={!!photo} transparent onRequestClose={() => setPhoto('')}><View style={{ flex: 1, backgroundColor: '#080808', justifyContent: 'center' }}><Pressable accessibilityLabel="Close photo" onPress={() => setPhoto('')} style={{ alignSelf: 'flex-end', padding: 22, minHeight: 64 }}><Ionicons name="close" color="#fff" size={28}/></Pressable>{photo ? <Image source={{ uri: photo }} resizeMode="contain" style={{ width: '100%', flex: 1 }}/> : null}</View></Modal>
  </Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewProductReviews/> : <ServerScreen/>;}
