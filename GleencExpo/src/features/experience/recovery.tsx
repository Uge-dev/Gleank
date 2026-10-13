import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { Page, Button, Empty } from '@/features/studio/ui';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
export function LoadingState({ label = 'Loading…' }: {
    label?: string;
}) {
    const { colors } = useAppTheme();
    return <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ padding: 40, gap: 15, alignItems: 'center' }}><ActivityIndicator color={colors.text}/><GText tone="muted">{label}</GText></View>;
}
export function Skeleton({ rows = 3 }: {
    rows?: number;
}) {
    const { colors } = useAppTheme();
    return <View accessible accessibilityLabel="Content is loading" style={{ padding: 18, gap: 16 }}>{Array.from({ length: Math.min(8, Math.max(1, rows)) }, (_, i) => <View key={i} style={{ borderRadius: 16, backgroundColor: colors.surfaceSecondary, height: 72 }}/>)}</View>;
}
export function RouteError({ retry }: {
    retry: () => Promise<void>;
}) {
    const [busy, setBusy] = useState(false);
    return <Page title="Something went wrong"><Empty title="This screen could not open" detail="Your saved records remain on this device. Retry to reopen this screen." icon="refresh-outline"/><Button title={busy ? 'Retrying…' : 'Try again'} disabled={busy} onPress={() => {
            setBusy(true);
            void retry().catch(() => {
            }).finally(() => setBusy(false));
        }}/></Page>;
}
export async function permissionHelp(message: string) {
    Alert.alert('Permission needed', message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Open Settings', onPress: () => void Linking.openSettings().catch(() => Alert.alert('Open Settings', 'Open device Settings and find Gleenc.')) }]);
}
