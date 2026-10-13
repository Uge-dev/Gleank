import { DeliveryPage as ServerScreen } from '@/features/live/orders-wallet';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useCommerce } from '@/features/commerce/commerce-state';
import { DeliveryQR } from '@/features/commerce/delivery-qr';
import { DeliveryScanner } from '@/features/commerce/delivery-scanner';
import { FRONTEND_PREVIEW } from '@/config/preview';

function PreviewDelivery() {
  const params = useLocalSearchParams<{ orderId: string; ticketId: string; mode?: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { orders, confirmReceipt } = useCommerce();
  const order = orders.find(value => value.id === params.orderId);
  const row = order?.items.find(value => value.tickets.some(ticket => ticket.id === params.ticketId));
  const ticket = row?.tickets.find(value => value.id === params.ticketId);
  const [mode, setMode] = useState<'buyer' | 'seller'>(FRONTEND_PREVIEW && params.mode === 'seller' ? 'seller' : 'buyer');
  const [code, setCode] = useState('');
  const [received, setReceived] = useState(false);
  const [scanner, setScanner] = useState(false);
  const confirm = () => {
    if (!received || !ticket) return;
    if (code.trim().toUpperCase() !== ticket.code) { Alert.alert('Code does not match', 'Scan or enter the code attached to this exact product unit.'); return; }
    try { confirmReceipt(code); Alert.alert('Delivery confirmed', 'This unit is marked delivered. Its seller earnings and reshare commission are now available.'); }
    catch (error) { Alert.alert('Unable to confirm', error instanceof Error ? error.message : 'Try again.'); }
  };
  return <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.tap}><Ionicons name="arrow-back" size={23} color={colors.text} /></Pressable><GText weight="bold" style={styles.heading}>Delivery confirmation</GText><View style={styles.tap} /></View>
    {!order || !row || !ticket ? <View style={styles.center}><GText>This order label is unavailable.</GText></View> : <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {FRONTEND_PREVIEW ? <View style={styles.tabs}>{(['buyer', 'seller'] as const).map(value => <Pressable key={value} onPress={() => setMode(value)} style={[styles.tab, { backgroundColor: mode === value ? colors.text : colors.surfaceSecondary }]}><GText weight="bold" style={{ color: mode === value ? colors.background : colors.text }}>{value === 'buyer' ? 'Confirm receipt' : 'Seller label'}</GText></Pressable>)}</View> : null}
      <View style={[styles.card, { backgroundColor: colors.surfaceSecondary }]}><GText weight="bold" style={styles.heading}>{row.item.name}</GText><GText tone="muted">Sold by {row.item.store}</GText><GText tone="muted">Unit {ticket.unit} of {row.quantity} · {order.id}</GText><View style={styles.row}><Ionicons name={ticket.status === 'confirmed' ? 'checkmark-circle' : 'lock-closed-outline'} size={19} color={ticket.status === 'confirmed' ? '#269B72' : colors.textMuted} /><GText weight="bold">{ticket.status === 'confirmed' ? 'Delivery confirmed' : 'Payment held until receipt'}</GText></View></View>
      {mode === 'seller' ? <View style={[styles.label, { borderColor: colors.border }]}><GText weight="bold" style={{ fontSize: 18 }}>GLEENC · Delivery label</GText><GText tone="muted">For {order.recipient}</GText><DeliveryQR code={ticket.code} /><GText weight="bold" style={{ textAlign: 'center' }}>{row.item.name} · Unit {ticket.unit}</GText><GText tone="muted" style={styles.small}>{ticket.id}</GText><GText tone="muted" style={styles.copy}>Attach this label to this exact product unit. Only its purchasing buyer can confirm it. Take a screenshot to print the label.</GText><Pressable onPress={() => void Share.share({ message: row.item.name + ' · Unit ' + ticket.unit + '\nDelivery code: ' + ticket.code + '\nFor ' + order.recipient })} style={[styles.button, { backgroundColor: colors.text }]}><Ionicons name="share-outline" size={19} color={colors.background} /><GText weight="bold" style={{ color: colors.background }}>Share delivery code</GText></Pressable></View> : ticket.status === 'confirmed' ? <View style={styles.center}><Ionicons name="checkmark-circle" size={61} color="#269B72" /><GText weight="bold" style={styles.heading}>Received successfully</GText><GText tone="muted" style={styles.copy}>This QR code has been used and cannot release funds again.</GText><Pressable onPress={() => router.push('/wallet')} style={[styles.button, { backgroundColor: colors.text }]}><GText weight="bold" style={{ color: colors.background }}>Open wallet</GText></Pressable></View> : <>
        <GText weight="bold" style={styles.heading}>Have you received this unit?</GText><GText tone="muted" style={{ lineHeight: 22 }}>Inspect your product before confirming. Receipt releases the original seller payment and the resharer's commission for this unit.</GText>
        <Pressable onPress={() => setScanner(true)} style={[styles.scan, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}><Ionicons name="scan-outline" size={33} color={colors.text} /><GText weight="bold">Scan product QR</GText><GText tone="muted" style={styles.small}>Use the label attached by the seller</GText></Pressable>
        <GText tone="muted" style={styles.small}>Or enter the delivery code</GText><TextInput value={code} onChangeText={setCode} autoCapitalize="characters" autoCorrect={false} placeholder="GLC:..." placeholderTextColor={colors.textMuted} style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text }]} />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: received }} onPress={() => setReceived(value => !value)} style={styles.consent}><Ionicons name={received ? 'checkbox' : 'square-outline'} size={25} color={received ? '#269B72' : colors.textMuted} /><GText style={{ flex: 1, lineHeight: 21 }}>I received and inspected this product unit.</GText></Pressable>
        <Pressable onPress={confirm} disabled={!received || !code.trim()} style={[styles.button, { backgroundColor: colors.text, opacity: received && code.trim() ? 1 : .4 }]}><GText weight="bold" style={{ color: colors.background }}>Confirm receipt & release funds</GText></Pressable>
      </>}
    </ScrollView>}
    <Modal transparent visible={scanner} animationType="fade" onRequestClose={() => setScanner(false)}><View style={styles.scrim}><View style={[styles.scanModal, { backgroundColor: colors.background }]}><GText weight="bold" style={styles.heading}>Scan delivery label</GText><DeliveryScanner onRead={value => { setCode(value); setScanner(false); }} /><GText tone="muted" style={styles.copy}>Scanning fills the delivery code. Funds release only after you confirm receipt.</GText>{FRONTEND_PREVIEW ? <Pressable onPress={() => { if (ticket) setCode(ticket.code); setScanner(false); }} style={[styles.button, { backgroundColor: colors.text }]}><GText weight="bold" style={{ color: colors.background }}>Use label · simulator test</GText></Pressable> : null}<Pressable onPress={() => setScanner(false)} style={styles.tap}><GText>Cancel</GText></Pressable></View></View></Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, header: { height: 61, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, tap: { minWidth: 37, minHeight: 42, justifyContent: 'center', alignItems: 'center' }, heading: { fontSize: 19 }, content: { padding: 20, paddingBottom: 35, gap: 17, maxWidth: 650, width: '100%', alignSelf: 'center' }, tabs: { flexDirection: 'row', gap: 9 }, tab: { flex: 1, borderRadius: 13, padding: 13, alignItems: 'center' }, card: { borderRadius: 19, padding: 18, gap: 9 }, row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, label: { borderWidth: 1, borderRadius: 22, padding: 19, gap: 12, alignItems: 'center' }, small: { fontSize: 12, lineHeight: 18 }, copy: { textAlign: 'center', lineHeight: 21 }, button: { minHeight: 54, paddingHorizontal: 17, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, width: '100%' }, center: { alignItems: 'center', justifyContent: 'center', padding: 22, gap: 15, minHeight: 180 }, scan: { borderWidth: 1, borderRadius: 19, padding: 24, alignItems: 'center', gap: 8 }, input: { borderRadius: 13, padding: 15, minHeight: 53, fontSize: 14 }, consent: { flexDirection: 'row', alignItems: 'center', gap: 11 }, scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,.65)', justifyContent: 'center', padding: 22 }, scanModal: { borderRadius: 24, padding: 24, alignItems: 'center', gap: 19 }, viewfinder: { width: 190, height: 190, borderWidth: 2, borderRadius: 22, alignItems: 'center', justifyContent: 'center' } });

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewDelivery/> : <ServerScreen/>;}
