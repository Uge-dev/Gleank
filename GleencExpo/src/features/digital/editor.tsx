import { useState } from 'react';
import { GText } from '@/components/gleenc/text';
import { Button, Card, Chips, Input, Notice } from '@/features/studio/ui';
import type { ProductDraft } from '@/features/create/model';
import { explain } from '@/features/account/guards';
import { fileSize, pickDigitalFiles, samplePdf, type PrivateFile } from './files';
import { FRONTEND_PREVIEW } from '@/config/preview';
export function DigitalEditor({ draft, onChange }: {
    draft: ProductDraft;
    onChange: (patch: Partial<ProductDraft>) => void;
}) {
    const [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
    const details = draft.digital ?? { files: [], licence: 'personal' as const, licenceText: '', requirements: '', version: '1.0' };
    const attach = async (sample = false) => {
        if (busy)
            return;
        setBusy(true);
        setNotice('');
        try {
            const files = sample ? [await samplePdf(draft.ownerId)] : await pickDigitalFiles(draft.ownerId);
            const next = [...(draft.digitalFiles ?? []), ...files];
            if (next.length > 5)
                throw new Error('Keep at most five files.');
            onChange({ digitalFiles: next, digital: { ...details, files: next.map(({ uri, ownerId, ...f }) => f) } });
        }
        catch (e) {
            setNotice(explain(e));
        }
        finally {
            setBusy(false);
        }
    };
    return <Card><GText weight="bold" style={{ fontSize: 20 }}>What buyers receive</GText><GText tone="muted">A PDF, template, ZIP or other supported download. Product photos and videos remain the public preview.</GText><Button title={busy ? 'Preparing files…' : 'Attach digital files'} icon="document-attach-outline" disabled={busy} onPress={() => void attach()}/>{FRONTEND_PREVIEW ? <Button secondary title="Use a sample PDF" disabled={busy} onPress={() => void attach(true)}/> : null}{(draft.digitalFiles ?? []).map((f: PrivateFile) => <Card key={f.id}><GText weight="bold">{f.name}</GText><GText tone="muted">{fileSize(f.bytes)}</GText><Button secondary title="Remove file" onPress={() => {
                const files = draft.digitalFiles?.filter(a => a.id !== f.id) ?? [];
                onChange({ digitalFiles: files, digital: { ...details, files: files.map(({ uri, ownerId, ...m }) => m) } });
            }}/></Card>)}<GText weight="bold">Licence</GText><Chips items={['personal', 'commercial']} value={details.licence} onChange={licence => onChange({ digital: { ...details, licence: licence as 'personal' | 'commercial' } })}/><Input label="Licence terms" value={details.licenceText} maxLength={1000} multiline onChange={licenceText => onChange({ digital: { ...details, licenceText } })}/><Input label="Software or requirements" value={details.requirements} maxLength={600} onChange={requirements => onChange({ digital: { ...details, requirements } })}/><Input label="Version" value={details.version} maxLength={40} onChange={version => onChange({ digital: { ...details, version } })}/><Notice text={notice}/></Card>;
}
