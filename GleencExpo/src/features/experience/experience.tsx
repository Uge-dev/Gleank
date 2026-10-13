import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, AppState, Platform, Pressable, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/hooks/use-app-theme';
import { GText } from '@/components/gleenc/text';
import { Ionicons } from '@expo/vector-icons';
type Experience = {
    connection: 'online' | 'offline' | 'unknown';
    reducedMotion: boolean;
    checkConnection: () => Promise<void>;
};
const Context = createContext<Experience>({ connection: 'unknown', reducedMotion: false, checkConnection: async () => {
    } });
export function ExperienceProvider({ children }: {
    children: ReactNode;
}) {
    const [connection, setConnection] = useState<Experience['connection']>('unknown');
    const [reducedMotion, setReduced] = useState(false);
    const alive = useRef(true);
    const network = () => Platform.OS === 'web' || requireOptionalNativeModule('ExpoNetwork') ? require('expo-network') as typeof import('expo-network') : null;
    const apply = (value: {
        isConnected?: boolean;
        isInternetReachable?: boolean;
    }) => {
        if (alive.current)
            setConnection(value.isConnected === false || value.isInternetReachable === false ? 'offline' : value.isConnected === true ? 'online' : 'unknown');
    };
    async function checkConnection() {
        try {
            const n = network();
            if (n)
                apply(await n.getNetworkStateAsync());
        }
        catch {
            if (alive.current)
                setConnection('unknown');
        }
    }
    useEffect(() => {
        alive.current = true;
        void checkConnection();
        void AccessibilityInfo.isReduceMotionEnabled().then(v => {
            if (alive.current)
                setReduced(v);
        }).catch(() => {
        });
        const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
        let subscription: {
            remove: () => void;
        } | undefined;
        try {
            subscription = network()?.addNetworkStateListener(apply);
        }
        catch {
        }
        const state = AppState.addEventListener('change', s => {
            if (s === 'active')
                void checkConnection();
        });
        return () => {
            alive.current = false;
            motion.remove();
            state.remove();
            subscription?.remove();
        };
    }, []);
    return <Context.Provider value={{ connection, reducedMotion, checkConnection }}>{children}</Context.Provider>;
}
export const useExperience = () => useContext(Context);
export function OfflineBanner() {
    const e = useExperience();
    const insets = useSafeAreaInsets();
    const { colors } = useAppTheme();
    if (e.connection !== 'offline')
        return null;
    return <View style={{ position: 'absolute', left: 12, right: 12, top: insets.top + 4, zIndex: 100, elevation: 30 }}><Pressable accessibilityRole="button" accessibilityLabel="Offline. Tap to check connection" onPress={() => void e.checkConnection()} style={{ minHeight: 44, padding: 12, borderRadius: 13, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Ionicons name="cloud-offline-outline" color={colors.text} size={21}/><GText style={{ flex: 1, fontSize: 12 }}>Offline · Saved work stays available. Tap to retry.</GText></Pressable></View>;
}
