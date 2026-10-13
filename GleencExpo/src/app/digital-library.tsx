import { FRONTEND_PREVIEW } from '@/config/preview';
import { DigitalLibraryPage as ServerScreen } from '@/features/live/orders-wallet';
import { useState } from 'react';
import { Image, View } from 'react-native';
import { GText } from '@/components/gleenc/text';
import { useCommerce } from '@/features/commerce/commerce-state';
import { fileSize, openPurchasedFile } from '@/features/digital/files';
import { explain } from '@/features/account/guards';
import { Button, Card, Empty, Notice, Page } from '@/features/studio/ui';
function PreviewDigitalLibrary() {
    const c = useCommerce();
    const [busy, setBusy] = useState(''), [notice, setNotice] = useState('');
    const purchases = c.orders.filter(o => o.buyerId === c.buyerId).flatMap(order => order.items.filter(r => r.item.productType === 'digital').map(row => ({ order, row })));
    return <Page title="Your downloads" subtitle="Files and licences from your digital purchases."><Notice text={notice || c.storageNotice}/>{!purchases.length ? <Empty title="Your library starts here" detail="Purchase a digital product to unlock its files." icon="document-outline"/> : purchases.map(({ order, row }) => <Card key={row.lineId}><View style={{ flexDirection: 'row', gap: 13 }}><Image source={{ uri: row.item.image }} style={{ width: 65, height: 65, borderRadius: 13 }}/><View style={{ flex: 1, gap: 5 }}><GText weight="bold" style={{ fontSize: 18 }}>{row.item.name}</GText><GText tone="muted">{row.item.store} · {row.item.digital?.licence} licence</GText></View></View><GText tone="muted">Version {row.item.digital?.version} · Purchased {new Date(order.placedAt).toLocaleDateString()}</GText>{row.item.digital?.requirements ? <GText>{row.item.digital.requirements}</GText> : null}{row.item.digital?.licenceText ? <GText tone="muted">{row.item.digital.licenceText}</GText> : null}{row.item.digital?.files.map(file => <Button key={file.id} title={busy === file.id ? 'Opening…' : file.name + ' · ' + fileSize(file.bytes)} secondary icon="download-outline" disabled={!!busy || row.tickets.some(t => t.status !== 'confirmed')} onPress={() => {
                    if (busy)
                        return;
                    setBusy(file.id);
                    setNotice('');
                    void (async () => {
                        try {
                            const allowed = c.purchasedFiles(order.id, row.lineId).find(f => f.id === file.id);
                            if (!allowed)
                                throw new Error('This file is not included in your licence.');
                            await openPurchasedFile(allowed);
                        }
                        catch (e) {
                            setNotice(explain(e));
                        }
                        finally {
                            setBusy('');
                        }
                    })();
                }}/>)}{row.tickets.some(t => t.status === 'refunded') ? <GText tone="muted">Access revoked after refund.</GText> : null}</Card>)}</Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewDigitalLibrary/> : <ServerScreen/>;}
