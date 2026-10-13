import { FRONTEND_PREVIEW } from '@/config/preview';
import { CataloguePage as ServerScreen } from '@/features/live/seller-tools';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useMarketplace, cataloguePost, localId } from '@/features/marketplace/marketplace-state';
import { defaultPlan, type Catalogue } from '@/features/marketplace/domain';
import { useFeedState } from '@/features/feed/feed-state';
import { Field } from '@/features/create/controls';
import { PlanEditor, FORMATS } from '@/features/marketplace/plan-editor';
import { Box, Button } from '@/features/marketplace/ui';
import { formatPrice } from '@/features/feed/data';
function PreviewCatalogueScreen() {
    const params = useLocalSearchParams<{
        seller?: string;
        manage?: string;
    }>();
    const router = useRouter();
    const { colors } = useAppTheme();
    const market = useMarketplace();
    const { addToCart } = useFeedState();
    const [manage, setManage] = useState(params.manage === '1');
    const [editor, setEditor] = useState<Catalogue | null>(null);
    const [query, setQuery] = useState('');
    const store = params.seller ?? market.storeName;
    const entries = market.definitions.filter(d => manage ? d.ownerId === market.ownerId : d.store === store && !d.hidden).filter(d => d.title.toLowerCase().includes(query.toLowerCase()));
    function save() { if (!editor)
        return; try {
        market.saveCatalogue(editor);
        setEditor(null);
    }
    catch (e) {
        Alert.alert('Review your catalogue', e instanceof Error ? e.message : 'Try again.');
    } }
    function create() { setEditor({ id: 'CATALOGUE-' + localId(), ownerId: market.ownerId, store: market.storeName, title: '', version: 1, updatedAt: Date.now(), hidden: false, plan: defaultPlan() }); }
    return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><View style={{ height: 60, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 13 }}><Pressable onPress={() => editor ? setEditor(null) : router.back()} style={{ minHeight: 44, minWidth: 34, justifyContent: 'center' }}><Ionicons name="arrow-back" size={23} color={colors.text}/></Pressable><GText weight="bold" style={{ fontSize: 22, flex: 1 }}>{editor ? 'Edit catalogue' : manage ? 'Your catalogue' : 'Menu & prices'}</GText>{store === market.storeName ? <Pressable onPress={() => { setEditor(null); setManage(v => !v); }}><GText weight="bold">{manage ? 'Preview' : 'Manage'}</GText></Pressable> : null}</View>
 <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 19, gap: 17, paddingBottom: 45, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
 {market.storageIssue ? <GText tone="muted">{market.storageIssue}</GText> : null}
 {editor ? <><Field label="Catalogue / pack name" value={editor.title} onChange={title => setEditor({ ...editor, title })}/><PlanEditor value={editor.plan} onChange={plan => setEditor({ ...editor, plan })}/><Button title="Save catalogue" disabled={!market.ready} onPress={() => { const count = market.posts.filter(p => p.catalogueId === editor.id).length; if (count)
            Alert.alert('Update linked posts?', `This changes ${count} linked posts. Paid orders keep their purchased prices.`, [{ text: 'Cancel' }, { text: 'Save', onPress: save }]);
        else
            save(); }}/></> : <>
 <GText tone="muted">{manage ? 'Set prices and portions once. Link your image and video posts to this catalogue.' : `Order directly from ${store}. Select a pack or build your own combination.`}</GText><Field label="Search catalogue" value={query} onChange={setQuery}/>{manage ? <Button title="Add catalogue / item / pack" onPress={create}/> : null}
 {entries.map((entry, index) => {
                const item = market.resolve(cataloguePost(entry));
                return <Animated.View key={entry.id} entering={FadeInDown.duration(200).delay(Math.min(index * 40, 160))}><Box><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><GText weight="bold" style={{ fontSize: 20, flex: 1 }}>{entry.title}</GText><GText style={{ color: entry.plan.takingOrders ? colors.success : colors.textMuted }}>{entry.hidden ? 'Hidden' : entry.plan.takingOrders ? 'Taking orders' : 'Paused'}</GText></View><GText tone="muted">{FORMATS[entry.plan.mode]} · {entry.plan.unit}</GText><GText weight="bold">{entry.plan.components.length ? 'From ' : ''}{formatPrice(item.priceKobo)}</GText><GText tone="muted">{entry.plan.preparation} {entry.plan.hours}</GText>{entry.plan.components.map(c => <View key={c.id} style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between' }}><View style={{ flex: 1 }}><GText>{c.name}</GText><GText tone="muted" style={{ fontSize: 11 }}>{c.description || c.unit} · {c.group}</GText></View><GText>{c.available ? formatPrice(c.priceKobo) + ' / ' + c.unit : 'Sold out'}</GText></View>)}
 {manage ? <><Button title="Edit prices & portions" onPress={() => setEditor(JSON.parse(JSON.stringify(entry)))}/><View style={{ flexDirection: 'row', gap: 8 }}><Button secondary title="Duplicate" onPress={() => setEditor({ ...JSON.parse(JSON.stringify(entry)), id: 'CATALOGUE-' + localId(), title: entry.title + ' copy', version: 1 })}/><Button secondary title={entry.hidden ? 'Restore' : 'Hide'} onPress={() => { try {
                    market.saveCatalogue({ ...entry, hidden: !entry.hidden });
                }
                catch (e) {
                    Alert.alert('Unable to save', String(e));
                } }}/></View></> : <Button title={entry.plan.components.length ? 'Build this order' : 'Add ' + entry.plan.unit} disabled={!item.stock || !entry.plan.takingOrders} onPress={() => addToCart(item)}/>}</Box></Animated.View>;
            })}
 {!entries.length ? <Box><GText weight="bold">{manage ? 'Your reusable prices start here' : 'No catalogue available'}</GText><GText tone="muted">{manage ? 'Add a single item, pack or a menu with priced components.' : 'Check the seller posts or send them a message.'}</GText></Box> : null}</>}
 </ScrollView></SafeAreaView>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewCatalogueScreen/> : <ServerScreen/>;}
