import { WithdrawPage as ServerScreen } from '@/features/live/orders-wallet';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GText } from '@/components/gleenc/text';
import { useCommerce } from '@/features/commerce/commerce-state';
import { useAccount } from '@/features/account/account-state';
import { explain, safeAmount } from '@/features/account/guards';
import { formatPrice } from '@/features/feed/data';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { Button, Card, Chips, Picker, Empty, Input, Notice, Page } from '@/features/studio/ui';
function PreviewWithdraw() {
    const c = useCommerce(), a = useAccount(), router = useRouter(), params = useLocalSearchParams<{
        ownerId?: string;
    }>();
    const ownerId = FRONTEND_PREVIEW && c.walletOwners.some(o => o.id === params.ownerId) ? params.ownerId! : c.buyerId;
    const available = c.walletSummary(ownerId).availableKobo;
    const [bankId, setBankId] = useState(a.banks[0]?.id ?? ''), [amount, setAmount] = useState(''), [review, setReview] = useState(false), [notice, setNotice] = useState('');
    const history = c.withdrawals.filter(w => w.ownerId === ownerId);
    const validate = () => {
        const n = safeAmount(amount);
        if (n > available)
            throw new Error('The amount exceeds your released earnings.');
        if (!a.banks.some(b => b.id === bankId))
            throw new Error('Choose a saved bank account.');
        return n;
    };
    return <Page title="Withdraw earnings" subtitle="Only released earnings can be withdrawn. Funds for open issues remain held."><Card><GText tone="muted">Available earnings</GText><GText weight="bold" style={{ fontSize: 32 }}>{formatPrice(available)}</GText><GText tone="muted">{c.walletOwners.find(o => o.id === ownerId)?.name}</GText></Card><Notice text={notice}/>{!a.banks.length ? <><Empty title="Add your bank account" detail="Save bank details before requesting a withdrawal." icon="business-outline"/><Button title="Add bank account" onPress={() => router.push('/bank-accounts')}/></> : <Card><Picker items={a.banks.map(b => ({ id: b.id, title: b.bank + ' · ' + b.last4, detail: b.name }))} value={bankId} onChange={id => {
                setBankId(id);
                setReview(false);
            }}/><Input label="Withdrawal amount ₦" value={amount} numeric maxLength={13} onChange={v => {
                setAmount(v);
                setReview(false);
            }}/>{review ? <><GText weight="bold">Review · {formatPrice(safeAmount(amount))}</GText><GText tone="muted">Transfer fee: ₦0 in this frontend flow. Destination: •••• {a.banks.find(b => b.id === bankId)?.last4}</GText><Button title="Confirm withdrawal" onPress={() => {
                    try {
                        c.requestPayout(ownerId, bankId, validate());
                        setReview(false);
                        setAmount('');
                        setNotice('Withdrawal queued. The amount is reserved until the transfer completes.');
                    }
                    catch (e) {
                        setNotice(explain(e));
                    }
                }}/></> : <Button title="Review withdrawal" disabled={!c.ready || !a.ready} onPress={() => {
                    try {
                        validate();
                        setReview(true);
                    }
                    catch (e) {
                        setNotice(explain(e));
                    }
                }}/>}</Card>}<GText weight="bold" style={{ fontSize: 20 }}>Withdrawal history</GText>{history.map(w => <Card key={w.id}><GText weight="bold">{formatPrice(w.amountKobo)} · {w.status}</GText><GText tone="muted">{w.bank} · •••• {w.last4}</GText><GText tone="muted" style={{ fontSize: 12 }}>{new Date(w.createdAt).toLocaleString()}</GText>{FRONTEND_PREVIEW && w.status === 'pending' ? <><Button secondary title="Test completed transfer" onPress={() => {
                    try {
                        c.resolvePayout(w.id, ownerId, true);
                    }
                    catch (e) {
                        setNotice(explain(e));
                    }
                }}/><Button secondary title="Test failed transfer" onPress={() => {
                    try {
                        c.resolvePayout(w.id, ownerId, false);
                    }
                    catch (e) {
                        setNotice(explain(e));
                    }
                }}/></> : null}</Card>)}</Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewWithdraw/> : <ServerScreen/>;}
