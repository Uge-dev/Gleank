import { IssuePage as ServerScreen } from '@/features/live/orders-wallet';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GText } from '@/components/gleenc/text';
import { useCommerce } from '@/features/commerce/commerce-state';
import { originalSeller, type Issue } from '@/features/commerce/settlement';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { pickLibrary } from '@/features/media/picker';
import { retainMedia } from '@/features/media/retain-media';
import { explain } from '@/features/account/guards';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { formatPrice } from '@/features/feed/data';
import { Button, Card, Chips, Empty, Input, Notice, Page } from '@/features/studio/ui';
function PreviewIssuePage() {
    const params = useLocalSearchParams<{
        id?: string;
        orderId?: string;
        lineId?: string;
        role?: string;
        sellerId?: string;
    }>(), c = useCommerce(), m = useMarketplace(), router = useRouter();
    const [kind, setKind] = useState<Issue['kind']>('refund'), [reason, setReason] = useState(''), [evidence, setEvidence] = useState<string[]>([]), [response, setResponse] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
    const issue = c.issues.find(i => i.id === params.id), seller = params.role === 'seller', actor = seller ? (FRONTEND_PREVIEW ? params.sellerId ?? m.ownerId : m.ownerId) : c.buyerId;
    const order = c.orders.find(o => o.id === (issue?.orderId ?? params.orderId)), row = order?.items.find(r => r.lineId === (issue?.lineId ?? params.lineId));
    const permitted = !!order && !!row && (seller ? originalSeller(row) === actor : order.buyerId === actor);
    const run = async (fn: () => void | Promise<void>) => {
        if (busy)
            return;
        setBusy(true);
        setNotice('');
        try {
            await fn();
        }
        catch (e) {
            setNotice(explain(e));
        }
        finally {
            setBusy(false);
        }
    };
    if (!permitted || !row || !order)
        return <Page title="Order support"><Empty title="Request unavailable" detail="Open an order that belongs to this account."/></Page>;
    return <Page title={issue ? 'Your request' : 'Get help with this product'}><Card><GText weight="bold">{row.item.name}</GText><GText tone="muted">{row.quantity} items · {row.item.store}</GText></Card><Notice text={notice}/>{issue ? <><Card><GText weight="bold" style={{ fontSize: 22 }}>{issue.kind} · {issue.status}</GText><GText>{issue.reason}</GText>{issue.response ? <GText tone="muted">Seller response: {issue.response}</GText> : null}{issue.refundKobo ? <GText weight="bold">Refund · {formatPrice(issue.refundKobo)}</GText> : null}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{issue.evidence.map(photo => <Image key={photo} source={{ uri: photo }} style={{ width: 90, height: 90, borderRadius: 12 }}/>)}</View><GText tone="muted">Updated {new Date(issue.updatedAt).toLocaleString()}</GText></Card>{seller && ['requested', 'escalated', 'return-approved'].includes(issue.status) ? <Card><Input label="Response to buyer" multiline maxLength={1000} value={response} onChange={setResponse}/><Button title={issue.status === 'return-approved' ? 'Returned item received · refund' : 'Approve request'} disabled={busy} onPress={() => void run(() => c.replyIssue(issue.id, issue.status === 'return-approved' ? 'received' : 'approve', response, actor))}/><Button secondary title="Decline with explanation" disabled={busy} onPress={() => void run(() => c.replyIssue(issue.id, 'decline', response, actor))}/></Card> : null}{!seller && issue.status === 'requested' ? <Button secondary title="Escalate to support" disabled={busy} onPress={() => void run(() => c.replyIssue(issue.id, 'escalate', '', actor))}/> : null}{FRONTEND_PREVIEW && !seller && ['requested', 'escalated', 'return-approved'].includes(issue.status) ? <Button secondary title="Open seller response" onPress={() => router.push({ pathname: '/issue', params: { id: issue.id, role: 'seller', sellerId: issue.sellerId } })}/> : null}</> : <Card><Chips items={row.item.productType === 'digital' ? ['refund', 'dispute'] : ['cancellation', 'return', 'refund', 'dispute']} value={kind} onChange={v => setKind(v as Issue['kind'])}/><Input label="What happened?" multiline maxLength={1000} value={reason} onChange={setReason}/><Button secondary title="Attach evidence photos" disabled={busy || evidence.length >= 4} onPress={() => void run(async () => {
                const selected = await pickLibrary('images', 4 - evidence.length);
                setEvidence([...evidence, ...await Promise.all(selected.map(p => retainMedia(p.uri)))]);
            })}/><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{evidence.map(photo => <View key={photo}><Image source={{ uri: photo }} style={{ width: 85, height: 85, borderRadius: 12 }}/><Button secondary title="Remove" onPress={() => setEvidence(evidence.filter(p => p !== photo))}/></View>)}</View><GText tone="muted" style={{ fontSize: 12 }}>Cancellation is available before dispatch. Physical returns require receipt and must be requested within seven days. Open issues pause release and withdrawal of the affected funds.</GText><Button title="Submit request" disabled={busy || !c.ready} onPress={() => void run(() => {
                const next = c.openIssue(order.id, row.lineId, kind, reason, evidence);
                router.replace({ pathname: '/issue', params: { id: next.id } });
            })}/></Card>}</Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewIssuePage/> : <ServerScreen/>;}
