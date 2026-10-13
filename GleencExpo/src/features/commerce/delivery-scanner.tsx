import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';

type CameraAPI = typeof import('expo-camera');
// Load only when the scanner opens. An older development client can still test
// the rest of the frontend instead of crashing the Home route on import.
export function DeliveryScanner({ onRead }: { onRead: (code: string) => void }) {
  const [api, setAPI] = useState<CameraAPI | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const { colors } = useAppTheme();
  useEffect(() => {
    try { const camera: CameraAPI = require('expo-camera'); setAPI(camera); }
    catch { setUnavailable(true); }
  }, []);
  if (api) return <CameraPanel api={api} onRead={onRead} />;
  return <View style={styles.fallback}><Ionicons name="qr-code-outline" size={68} color={colors.textMuted} /><GText tone="muted" style={styles.copy}>{unavailable ? 'Camera scanning needs the updated development build. You can enter the label code manually.' : 'Preparing camera…'}</GText></View>;
}
function CameraPanel({ api, onRead }: { api: CameraAPI; onRead: (code: string) => void }) {
  const [permission, requestPermission] = api.useCameraPermissions();
  const { CameraView } = api;
  const { colors } = useAppTheme();
  const read = useRef(false);
  const [error, setError] = useState('');
  if (error) return <View style={styles.fallback}><GText tone="muted" style={styles.copy}>{error}</GText></View>;
  if (!permission) return <View style={styles.fallback}><GText tone="muted">Checking camera permission…</GText></View>;
  if (!permission.granted) return <View style={styles.fallback}><Ionicons name="camera-outline" size={43} color={colors.text} /><GText tone="muted" style={styles.copy}>Allow camera access to read the seller's delivery label.</GText><Pressable style={[styles.button, { backgroundColor: colors.text }]} onPress={() => { if (!permission.canAskAgain) { void Linking.openSettings(); return; } void requestPermission().catch(() => setError('Camera access is unavailable. Enter the code manually or use the simulator test.')); }}><GText weight="bold" style={{ color: colors.background }}>{permission.canAskAgain ? 'Allow camera' : 'Open settings'}</GText></Pressable></View>;
  return <View style={styles.cameraWrap}><CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onMountError={() => setError('The camera is unavailable on this device. Enter the code manually or use the simulator test.')} onBarcodeScanned={result => { if (read.current || !result.data.toUpperCase().startsWith('GLC:')) return; read.current = true; onRead(result.data); }} /><View pointerEvents="none" style={styles.guide} /></View>;
}
const styles = StyleSheet.create({ fallback: { minHeight: 205, gap: 17, padding: 15, justifyContent: 'center', alignItems: 'center', width: '100%' }, copy: { textAlign: 'center', lineHeight: 21 }, cameraWrap: { width: '100%', height: 255, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, guide: { width: 180, height: 180, borderRadius: 17, borderWidth: 2, borderColor: '#fff' }, button: { minHeight: 47, paddingHorizontal: 21, justifyContent: 'center', borderRadius: 13 } });
