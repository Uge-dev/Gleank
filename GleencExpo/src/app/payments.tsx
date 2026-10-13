import { FRONTEND_PREVIEW } from '@/config/preview';
import { PaymentHistoryPage as ServerScreen } from '@/features/live/seller-tools';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Page, Card, Chips, Row, Empty, Notice, Button } from '@/features/studio/ui';
import { usePayments } from '@/features/payments/payment-state';
import { formatPrice } from '@/features/feed/data';
function PreviewPayments() {
    const p = usePayments();
    const router = useRouter();
    const [filter, setFilter] = useState('All');
    const rows = p.attempts.filter(a => filter === 'All' || filter === 'Successful' && a.status === 'succeeded' || filter === 'Pending' && ['pending', 'ready'].includes(a.status) || filter === 'Failed' && ['failed', 'expired', 'cancelled'].includes(a.status));
    return <Page title="Payment activity"><Notice text={p.notice}/>{p.notice ? <Button title="Retry saving" secondary onPress={() => void p.retrySave()}/> : null}<Chips items={['All', 'Successful', 'Pending', 'Failed']} value={filter} onChange={setFilter}/>{rows.length ? rows.map(a => <Card key={a.id}><Row title={formatPrice(a.totalKobo)} detail={a.status + ' · ' + a.details.paymentMethod + ' · ' + new Date(a.createdAt).toLocaleString()} icon={a.status === 'succeeded' ? 'checkmark-circle-outline' : 'time-outline'} onPress={() => router.push({ pathname: '/payment', params: { id: a.id } })}/></Card>) : <Empty title={p.ready ? 'No payments here' : 'Loading payments…'} detail="Your checkout sessions and receipts appear here." icon="receipt-outline"/>}</Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewPayments/> : <ServerScreen/>;}
