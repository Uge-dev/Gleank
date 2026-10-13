import { FRONTEND_PREVIEW } from '@/config/preview';
import { SearchPage as ServerScreen } from '@/features/live/social-pages';
import { useMemo, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useFeedState } from '@/features/feed/feed-state';
import { formatPrice } from '@/features/feed/data';
import { CATEGORIES } from '@/features/create/catalog';
import { Chips, Input, Empty } from '@/features/studio/ui';
function PreviewMarket() {
    const router = useRouter(), { colors } = useAppTheme(), { catalog } = useFeedState();
    const [query, setQuery] = useState(''), [category, setCategory] = useState('All'), [type, setType] = useState('All products'), [sort, setSort] = useState('Newest'), [format, setFormat] = useState('Any format'), [stockOnly, setStockOnly] = useState(false), [minimum, setMinimum] = useState(''), [maximum, setMaximum] = useState(''), [filters, setFilters] = useState(false);
    const invalidRange = !!minimum && !/^\d+(\.\d{1,2})?$/.test(minimum) || !!maximum && !/^\d+(\.\d{1,2})?$/.test(maximum) || !!minimum && !!maximum && Number(minimum) > Number(maximum);
    const items = useMemo(() => {
        if (invalidRange)
            return [];
        const seen = new Set<string>();
        return catalog.filter(p => {
            if (seen.has(p.id) || p.id.startsWith('CAT-'))
                return false;
            seen.add(p.id);
            return `${p.name} ${p.store} ${p.category} ${p.fullDescription ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()) && (category === 'All' || p.category.toLowerCase() === category.toLowerCase() || CATEGORIES.find(c => c.id === category)?.name.toLowerCase() === p.category.toLowerCase()) && (type === 'All products' || (type === 'Digital downloads' ? p.productType === 'digital' : p.productType !== 'digital')) && (!stockOnly || p.stock > 0) && (format === 'Any format' || (p.plan?.mode ?? 'item') === format) && (!minimum || p.priceKobo >= Number(minimum) * 100) && (!maximum || p.priceKobo <= Number(maximum) * 100);
        }).sort((a, b) => sort === 'Price: low to high' ? a.priceKobo - b.priceKobo : sort === 'Price: high to low' ? b.priceKobo - a.priceKobo : b.createdAt - a.createdAt);
    }, [catalog, query, category, type, sort, stockOnly, minimum, maximum, format, invalidRange]);
    const header = <View style={{ padding: 6, paddingVertical: 17, gap: 12 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><GText weight="bold" style={{ fontSize: 28 }}>Explore</GText><Pressable accessibilityLabel="Toggle search filters" onPress={() => setFilters(!filters)} style={{ padding: 10 }}><Ionicons name="options-outline" size={23} color={colors.text}/></Pressable></View><TextInput accessibilityLabel="Search products and sellers" value={query} onChangeText={setQuery} maxLength={120} placeholder="Search products, sellers and categories" placeholderTextColor={colors.textMuted} style={{ minHeight: 49, borderRadius: 15, paddingHorizontal: 15, color: colors.text, backgroundColor: colors.surfaceSecondary, fontFamily: 'ReoSans-Medium' }}/><Chips items={['All products', 'Physical products', 'Digital downloads']} value={type} onChange={setType}/>{filters ? <><Chips items={['All', ...CATEGORIES.map(c => c.name)]} value={category === 'All' ? 'All' : CATEGORIES.find(c => c.id === category)?.name ?? category} onChange={name => setCategory(CATEGORIES.find(c => c.name === name)?.id ?? 'All')}/><Chips items={['Newest', 'Price: low to high', 'Price: high to low']} value={sort} onChange={setSort}/><Chips items={['Any format', 'item', 'pack', 'menu', 'extras']} value={format} onChange={setFormat}/><View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Input label="Minimum ₦" value={minimum} numeric maxLength={12} onChange={setMinimum}/></View><View style={{ flex: 1 }}><Input label="Maximum ₦" value={maximum} numeric maxLength={12} onChange={setMaximum}/></View></View><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: stockOnly }} onPress={() => setStockOnly(!stockOnly)} style={{ minHeight: 40, flexDirection: 'row', gap: 8, alignItems: 'center' }}><Ionicons name={stockOnly ? 'checkbox' : 'square-outline'} size={22} color={colors.text}/><GText>In stock only</GText></Pressable><Pressable onPress={() => {
                setCategory('All');
                setSort('Newest');
                setFormat('Any format');
                setMinimum('');
                setMaximum('');
                setStockOnly(false);
            }} style={{ minHeight: 40, justifyContent: 'center' }}><GText weight="bold">Reset filters</GText></Pressable></> : null}<GText tone="muted" style={{ fontSize: 12 }}>{invalidRange ? 'Enter a valid price range.' : items.length + ' products'}</GText></View>;
    return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}><FlatList data={items} keyExtractor={p => p.id} numColumns={2} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 30, width: '100%', maxWidth: 720, alignSelf: 'center' }} columnWrapperStyle={{ gap: 10 }} ListHeaderComponent={header} ListEmptyComponent={<Empty title="No matching products" detail="Try another search or clear your filters." icon="search-outline"/>} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={'Open ' + item.name} onPress={() => router.push({ pathname: '/product', params: { id: item.id } })} style={({ pressed }) => [s.tile, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? .8 : 1 }]}><Image source={{ uri: item.image }} style={{ width: '100%', aspectRatio: 1, borderRadius: 14 }}/><View style={{ padding: 10, gap: 5 }}><GText weight="bold" numberOfLines={2}>{item.name}</GText><GText tone="muted" style={{ fontSize: 11 }}>{item.store} · {item.productType === 'digital' ? 'Download' : item.stock ? 'Available' : 'Sold out'}</GText><GText weight="bold">{item.plan?.components.length ? 'From ' : ''}{formatPrice(item.priceKobo)}</GText></View></Pressable>}/></SafeAreaView>;
}
const s = StyleSheet.create({ tile: { flex: 1, maxWidth: '50%', borderRadius: 17, borderWidth: 1, overflow: 'hidden', marginBottom: 12 } });

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewMarket/> : <ServerScreen/>;}
