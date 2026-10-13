import { FRONTEND_PREVIEW } from '@/config/preview';
import { useServerQuery, rows } from '@/features/live/state';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/use-auth';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { GText } from '@/components/gleenc/text';
import { Choice } from '@/features/create/controls';
import type { ProductDraft } from '@/features/create/model';
import { useMarketplace } from './marketplace-state';
import { defaultPlan } from './domain';
import { PlanEditor } from './plan-editor';
import { Button, Box } from './ui';
export function CreateOrdering({ draft, onChange }: {
    draft: ProductDraft;
    onChange: (update: Partial<ProductDraft>) => void;
}) {
    const market = useMarketplace();
    const router = useRouter();
    const {user}=useAuth();
    const server=useServerQuery(()=>api.catalogue.get(user?.id||''),'create-catalogue',!FRONTEND_PREVIEW&&!!user);
    const own = !FRONTEND_PREVIEW ? rows(server.data).map(c=>({id:c.id,title:c.name,plan:{...defaultPlan(),baseKobo:c.priceKobo}})) : market.definitions.filter(d => d.ownerId === market.ownerId && !d.hidden);
    const entry = own.find(d => d.id === draft.catalogueId);
    return <View style={{ gap: 15 }}><GText weight="bold" style={{ fontSize: 21 }}>How should buyers order?</GText><GText tone="muted">Image and video are presentation formats. Pricing and order contents are configured separately.</GText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Choice title="Use my catalogue" active={!!draft.catalogueId} onPress={() => { if (own[0])
        onChange({ catalogueId: own[0].id, orderingPlan: undefined });
    else
        router.push({ pathname: '/catalogue', params: { manage: '1' } }); }}/><Choice title="Set a separate price" active={!draft.catalogueId} onPress={() => onChange({ catalogueId: undefined, orderingPlan: draft.orderingPlan ?? defaultPlan() })}/></View>
 {draft.catalogueId ? <><View style={{ gap: 9 }}>{own.map(d => <Choice key={d.id} title={d.title} active={d.id === draft.catalogueId} onPress={() => onChange({ catalogueId: d.id, orderingPlan: undefined })}/>)}</View><Box><GText weight="bold">Linked to your catalogue</GText><GText>{entry?.title ?? 'Choose an available catalogue'}</GText><GText tone="muted">Prices, portions and availability follow this catalogue. Paid orders keep their purchased prices.</GText></Box></> : draft.orderingPlan ? <PlanEditor value={draft.orderingPlan} onChange={orderingPlan => onChange({ orderingPlan })}/> : <><GText tone="muted">Existing single-item pricing and variants will be used.</GText><Button secondary title="Configure pack, menu or extras" onPress={() => onChange({ orderingPlan: defaultPlan() })}/></>}
 <Button secondary title="Manage reusable catalogue" onPress={() => router.push({ pathname: '/catalogue', params: { manage: '1' } })}/></View>;
}
