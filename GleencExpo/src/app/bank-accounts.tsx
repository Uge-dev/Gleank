import { FRONTEND_PREVIEW } from '@/config/preview';
import { BankPage as ServerScreen } from '@/features/live/orders-wallet';
import { useState } from 'react';
import { GText } from '@/components/gleenc/text';
import { useAccount } from '@/features/account/account-state';
import { explain } from '@/features/account/guards';
import { Button, Card, Chips, Empty, Input, Notice, Page } from '@/features/studio/ui';
function PreviewBanks() {
    const a = useAccount();
    const [bank, setBank] = useState('Access Bank'), [customBank, setCustomBank] = useState(''), [name, setName] = useState(a.profile.displayName), [number, setNumber] = useState(''), [open, setOpen] = useState(false), [notice, setNotice] = useState('');
    return <Page title="Bank accounts" subtitle="Choose where released earnings should go."><Button title="Add bank account" icon="add" onPress={() => setOpen(true)}/>{open ? <Card><Chips items={['Access Bank', 'GTBank', 'UBA', 'Zenith Bank', 'FirstBank', 'Other']} value={bank} onChange={setBank}/>{bank === 'Other' ? <Input label="Bank name" value={customBank} onChange={setCustomBank}/> : null}<Input label="Account holder" value={name} maxLength={80} onChange={setName}/><Input label="Account number" value={number} numeric maxLength={10} onChange={setNumber}/><GText tone="muted" style={{ fontSize: 12 }}>For this frontend flow, only the bank name, holder and last four digits are saved. Account verification will use the payout service.</GText><Button title="Save bank account" disabled={!a.ready} onPress={() => {
                try {
                    a.saveBank(bank === 'Other' ? customBank : bank, name, number);
                    setNumber('');
                    setOpen(false);
                }
                catch (e) {
                    setNotice(explain(e));
                }
            }}/><Button secondary title="Cancel" onPress={() => {
                setNumber('');
                setOpen(false);
            }}/></Card> : null}<Notice text={notice}/>{!a.banks.length && !open ? <Empty title="No bank account yet" detail="Add one before requesting a withdrawal." icon="business-outline"/> : a.banks.map(b => <Card key={b.id}><GText weight="bold">{b.bank} · •••• {b.last4}</GText><GText tone="muted">{b.name}</GText><Button secondary title="Remove account" onPress={() => {
                try {
                    a.removeBank(b.id);
                }
                catch (e) {
                    setNotice(explain(e));
                }
            }}/></Card>)}</Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewBanks/> : <ServerScreen/>;}
