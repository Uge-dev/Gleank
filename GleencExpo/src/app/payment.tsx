import { FRONTEND_PREVIEW } from '@/config/preview';
import { PaymentPage as ServerScreen } from '@/features/live/purchase';
import { useEffect, useState } from 'react';
import { Alert, View, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Ionicons } from '@expo/vector-icons';
import { usePayments } from '@/features/payments/payment-state';
import { Page, Card, Button, Notice, Empty, Row } from '@/features/studio/ui';
import { GText } from '@/components/gleenc/text';
import { formatPrice } from '@/features/feed/data';
import { explain } from '@/features/account/guards';
function PreviewPayment() {
    const { id } = useLocalSearchParams<{
        id?: string;
    }>();
    const p = usePayments();
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const [, tick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => tick(v => v + 1), 1000);
        return () => clearInterval(timer);
    }, []);
    const a = p.attempts.find(a => a.id === id);
    const expired = a && Date.now() >= a.expiresAt && ['ready', 'pending', 'failed'].includes(a.status);
    const status = expired ? 'expired' : a?.status;
    const run = (f: () => void) => {
        if (busy)
            return;
        setBusy(true);
        try {
            f();
        }
        catch (e) {
            Alert.alert('Payment update', explain(e));
        }
        finally {
            setBusy(false);
        }
    };
    async function copy() {
        try {
            if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoClipboard'))
                throw new Error('Install the updated development build to copy references.');
            await (require('expo-clipboard') as typeof import('expo-clipboard')).setStringAsync(a!.id);
            Alert.alert('Copied', 'Payment reference copied.');
        }
        catch (e) {
            Alert.alert('Copy unavailable', explain(e));
        }
    }
    if (!a)
        return <Page title="Payment"><Empty title={p.ready ? 'Payment unavailable' : 'Loading payment…'} detail="Find your payment from wallet activity."/><Button title="Payment activity" onPress={() => router.replace('/payments')}/></Page>;
    const ink = status === 'succeeded' ? '#258A65' : status === 'failed' || status === 'expired' ? '#D64D5B' : '#C38B2C';
    return <Page title="Payment" subtitle="Local test checkout"><Notice text={p.notice}/><Card><View style={{ alignItems: 'center', gap: 16, paddingVertical: 20 }}><Ionicons name={status === 'succeeded' ? 'checkmark-circle' : status === 'failed' || status === 'expired' ? 'alert-circle' : 'time-outline'} size={64} color={ink}/><GText weight="bold" style={{ fontSize: 27, textAlign: 'center' }}>{status === 'succeeded' ? 'Payment successful' : status === 'pending' ? 'Awaiting transfer' : status === 'failed' ? 'Payment failed' : status === 'cancelled' ? 'Payment cancelled' : status === 'expired' ? 'Session expired' : 'Ready to pay'}</GText><GText weight="bold" style={{ fontSize: 34 }}>{formatPrice(a.totalKobo)}</GText></View><GText tone="muted">Method · {a.details.paymentMethod}</GText><GText tone="muted" selectable>{a.id}</GText><GText style={{ lineHeight: 21 }}>{status === 'pending' ? 'Pending transfers do not create an order or release funds. Use the controls below to test a verified transfer result.' : a.failure || 'No real money is collected. Live confirmation must come from the payment service.'}</GText>
    {['ready', 'pending'].includes(status ?? '') ? <><GText tone="muted">Session ends in {Math.max(0, Math.ceil((a.expiresAt - Date.now()) / 60000))} minutes.</GText><Button title={busy ? 'Processing…' : a.details.paymentMethod === 'wallet' ? 'Pay from test wallet' : 'Test successful payment'} disabled={busy || !p.ready} onPress={() => run(() => {
                const o = p.complete(a.id);
                router.replace({ pathname: '/order-success', params: { id: o.id } });
            })}/><Button title="Test a declined payment" secondary disabled={busy} onPress={() => run(() => p.fail(a.id))}/>{a.details.paymentMethod === 'transfer' ? <Button title="Copy transfer reference" secondary onPress={() => void copy()}/> : null}<Button title="Cancel payment" secondary onPress={() => run(() => p.cancel(a.id))}/></> : null}
    {status === 'failed' ? <Button title="Retry payment" disabled={busy} onPress={() => run(() => p.retry(a.id))}/> : null}
    {status === 'succeeded' && a.orderId ? <><Button title="View receipt" onPress={() => router.push({ pathname: '/receipt', params: { id: a.orderId! } })}/><Button title="View order" secondary onPress={() => router.push({ pathname: '/order-details', params: { id: a.orderId! } })}/></> : null}
    {['failed', 'cancelled', 'expired'].includes(status ?? '') ? <Button title="Return to bag" secondary onPress={() => router.replace('/cart')}/> : null}
  </Card><Row title="All payments" icon="receipt-outline" onPress={() => router.push('/payments')}/></Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewPayment/> : <ServerScreen/>;}
