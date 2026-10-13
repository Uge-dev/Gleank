import { FRONTEND_PREVIEW } from '@/config/preview';
import { ManageProductsPage as ServerScreen } from '@/features/live/seller-tools';
import { useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GText } from '@/components/gleenc/text';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { formatPrice } from '@/features/feed/data';
import { explain } from '@/features/account/guards';
import { Button, Card, Chips, Empty, Input, Notice, Page } from '@/features/studio/ui';
function PreviewManageProducts() {
    const m = useMarketplace(), router = useRouter();
    const [filter, setFilter] = useState('All'), [notice, setNotice] = useState(''), [stock, setStock] = useState<Record<string, string>>({});
    const rows = m.posts.filter(p => p.sellerId === m.ownerId && p.listingStatus !== 'deleted' && (filter === 'All' || (p.listingStatus ?? 'active') === filter));
    const run = (fn: () => void) => {
        try {
            fn();
            setNotice('');
        }
        catch (e) {
            setNotice(explain(e));
        }
    };
    return <Page title="Manage products" subtitle="Control your published listings without changing completed purchases."><Button title="Create product" icon="add" onPress={() => router.push('/create')}/><Chips items={['All', 'active', 'paused', 'archived']} value={filter} onChange={setFilter}/><Notice text={notice || m.storageIssue}/>{!rows.length ? <Empty title="No listings here" detail="Publish a draft from Create to manage it here."/> : rows.map(p => {
            const live = m.resolve(p);
            const count = p.catalogueId ? m.definitions.find(d => d.id === p.catalogueId)?.plan.stock ?? 0 : Math.max(0, p.stock - (m.inventory[p.id]?.packs ?? 0));
            return <Card key={p.id}><View style={{ flexDirection: 'row', gap: 13 }}><Image source={{ uri: p.image }} style={{ width: 75, height: 75, borderRadius: 14 }}/><View style={{ flex: 1, gap: 6 }}><GText weight="bold" style={{ fontSize: 18 }}>{p.name}</GText><GText tone="muted">{p.productType ?? 'physical'} · {p.listingStatus ?? 'active'}</GText><GText weight="bold">{formatPrice(live.priceKobo)}</GText></View></View><Input label="Available stock" numeric maxLength={4} value={stock[p.id] ?? String(count)} onChange={v => setStock(s => ({ ...s, [p.id]: v }))}/><Button secondary title="Update stock" onPress={() => run(() => {
                    const raw = stock[p.id] ?? String(count);
                    if (!/^\d{1,4}$/.test(raw))
                        throw new Error('Enter a whole stock quantity.');
                    m.updateStock(p.id, Number(raw));
                    setStock(s => ({ ...s, [p.id]: raw }));
                })}/><Button title="Edit listing" icon="create-outline" onPress={() => router.push({ pathname: '/create', params: { editId: p.id } })}/><Button secondary title={p.listingStatus === 'active' || !p.listingStatus ? 'Pause sales' : 'Resume sales'} onPress={() => run(() => m.setListingStatus(p.id, p.listingStatus === 'active' || !p.listingStatus ? 'paused' : 'active'))}/><Button secondary title="Mark sold out" onPress={() => run(() => m.updateStock(p.id, 0))}/><Button secondary title="Archive" onPress={() => run(() => m.setListingStatus(p.id, 'archived'))}/><Button secondary title="Delete listing" onPress={() => Alert.alert('Delete this listing?', 'It leaves discovery. Existing orders and purchased files are retained.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => run(() => m.setListingStatus(p.id, 'deleted')) }])}/></Card>;
        })}</Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewManageProducts/> : <ServerScreen/>;}
