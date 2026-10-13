import { useEffect } from 'react';
import { AppState, Modal, Platform, Pressable, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Ionicons } from '@expo/vector-icons';
import { GText } from '@/components/gleenc/text';
export function ChatVideo({ uri, close }: {
    uri: string;
    close: () => void;
}) {
    if (!uri)
        return null;
    if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoVideo'))
        return <Modal visible onRequestClose={close}><Pressable onPress={close} style={{ padding: 40 }}><GText>Install the updated development build to play videos. Tap to close.</GText></Pressable></Modal>;
    return <Player uri={uri} close={close}/>;
}
function Player({ uri, close }: {
    uri: string;
    close: () => void;
}) {
    const { useVideoPlayer, VideoView } = require('expo-video') as typeof import('expo-video');
    const player = useVideoPlayer(uri, p => {
        p.loop = false;
    });
    useEffect(() => {
        const sub = AppState.addEventListener('change', state => {
            if (state !== 'active') {
                try {
                    player.pause();
                }
                catch {
                }
            }
        });
        return () => sub.remove();
    }, [player]);
    return <Modal visible animationType="fade" onRequestClose={close}><View style={{ flex: 1, backgroundColor: '#080808', justifyContent: 'center' }}><Pressable onPress={close} accessibilityLabel="Close video" style={{ padding: 22, minHeight: 72, alignSelf: 'flex-end' }}><Ionicons name="close" size={28} color="#fff"/></Pressable><VideoView player={player} nativeControls contentFit="contain" style={{ flex: 1, width: '100%' }}/></View></Modal>;
}
