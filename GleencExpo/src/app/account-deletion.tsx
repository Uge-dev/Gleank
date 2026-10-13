import { FRONTEND_PREVIEW } from '@/config/preview';
import { DeleteAccountPage as ServerScreen } from '@/features/live/account-pages';
import { useState } from 'react';
import { GText } from '@/components/gleenc/text';
import { useAccount } from '@/features/account/account-state';
import { useCommerce } from '@/features/commerce/commerce-state';
import { explain } from '@/features/account/guards';
import { Button, Card, Input, Notice, Page } from '@/features/studio/ui';
function PreviewAccountDeletion() {
    const a = useAccount(), c = useCommerce();
    const [confirmation, setConfirmation] = useState(''), [reason, setReason] = useState(''), [notice, setNotice] = useState('');
    const pending = c.orders.some(o => o.items.some(r => r.tickets.some(t => t.status === 'awaiting'))) || c.withdrawals.some(w => w.status === 'pending');
    return <Page title="Delete account"><Card><GText weight="bold" style={{ fontSize: 22 }}>Review before you continue</GText><GText>Account deletion removes your public profile and listings. Purchase, dispute and payout records may need to be retained for unresolved transactions.</GText>{pending ? <Notice text="You have open orders or transfers. These must be resolved before account deletion can complete."/> : null}<GText tone="muted">In this frontend, you can prepare and cancel a deletion request. Final deletion and session revocation require the connected account service.</GText></Card><Notice text={notice}/>{a.deletionRequest ? <Card><GText weight="bold">Deletion request prepared</GText><GText tone="muted">{new Date(a.deletionRequest.at).toLocaleString()}</GText><GText>{a.deletionRequest.reason}</GText><Button secondary title="Cancel request" onPress={() => {
                try {
                    a.cancelDeletion();
                }
                catch (e) {
                    setNotice(explain(e));
                }
            }}/></Card> : <Card><Input label="Reason · optional" multiline maxLength={500} value={reason} onChange={setReason}/><Input label={'Type your username: ' + a.profile.username} maxLength={24} value={confirmation} onChange={setConfirmation}/><Button title="Prepare deletion request" disabled={!a.ready} onPress={() => {
                try {
                    a.requestDeletion(confirmation, reason);
                    setConfirmation('');
                }
                catch (e) {
                    setNotice(explain(e));
                }
            }}/></Card>}</Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewAccountDeletion/> : <ServerScreen/>;}
