import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Ionicons } from '@expo/vector-icons';
import { GText } from '@/components/gleenc/text';
import { Button } from '@/features/studio/ui';
import { useAppTheme } from '@/hooks/use-app-theme';
import { retainMedia } from '@/features/media/retain-media';
import { explain } from '@/features/account/guards';
import { fileBytes } from './attachments';
import type { Attachment } from './chat-state';
function audio() {
    if (Platform.OS !== 'web' && !requireOptionalNativeModule('ExpoAudio'))
        throw new Error('Voice messages need the new development build containing expo-audio.');
    return require('expo-audio') as typeof import('expo-audio');
}
export function VoiceNote({ attachment }: {
    attachment: Attachment;
}) {
    try {
        audio();
    }
    catch {
        return <GText>Voice note · Install the updated app to listen.</GText>;
    }
    return <VoicePlayer attachment={attachment}/>;
}
function VoicePlayer({ attachment }: {
    attachment: Attachment;
}) {
    const module = audio();
    const player = module.useAudioPlayer(attachment.uri);
    const status = module.useAudioPlayerStatus(player);
    const { colors } = useAppTheme();
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
    return <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause voice message' : 'Play voice message'} onPress={() => {
            try {
                if (status.playing)
                    player.pause();
                else {
                    if (status.didJustFinish)
                        void player.seekTo(0);
                    player.play();
                }
            }
            catch (e) {
                Alert.alert('Audio unavailable', explain(e));
            }
        }} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48, minWidth: 180 }}><Ionicons name={status.playing ? 'pause-circle' : 'play-circle'} size={36} color={colors.text}/><View style={{ flex: 1, gap: 6 }}><View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', height: 24 }}>{[8, 14, 22, 12, 18, 9, 23, 15, 20, 10, 17, 13].map((height, i) => <View key={i} style={{ width: 4, height, backgroundColor: colors.text, opacity: i / 12 <= (status.currentTime / Math.max(1, status.duration)) ? .9 : .25, borderRadius: 2 }}/>)}</View><GText tone="muted" style={{ fontSize: 11 }}>{Math.floor(status.currentTime || 0)}s / {Math.round((attachment.durationMs ?? 0) / 1000)}s</GText></View></Pressable>;
}
export function VoiceRecorder({ open, close, onSend }: {
    open: boolean;
    close: () => void;
    onSend: (a: Attachment) => void;
}) {
    const { colors } = useAppTheme();
    if (!open)
        return null;
    try {
        audio();
    }
    catch (e) {
        return <Modal visible onRequestClose={close} transparent><View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#000A' }}><View style={{ padding: 24, gap: 16, backgroundColor: colors.surface, borderRadius: 20 }}><GText>{explain(e)}</GText><Button title="Close" onPress={close}/></View></View></Modal>;
    }
    return <Recorder close={close} onSend={onSend}/>;
}
function Recorder({ close, onSend }: {
    close: () => void;
    onSend: (a: Attachment) => void;
}) {
    const module = audio();
    const recorder = module.useAudioRecorder(module.RecordingPresets.HIGH_QUALITY);
    const status = module.useAudioRecorderState(recorder, 200);
    const { colors } = useAppTheme();
    const [error, setError] = useState('');
    const [starting, setStarting] = useState(false);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const alive = useRef(true);
    const began = useRef(false);
    async function start() {
        setStarting(true);
        try {
            const permission = await module.AudioModule.requestRecordingPermissionsAsync();
            if (!alive.current)
                return;
            if (!permission.granted) {
                setError('Microphone access was denied. Enable it in device Settings to record a voice message.');
                return;
            }
            await module.setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: false });
            if (!alive.current)
                return;
            await recorder.prepareToRecordAsync();
            if (!alive.current)
                return;
            if (AppState.currentState && AppState.currentState !== 'active')
                throw new Error('Return to Gleenc before starting a recording.');
            recorder.record();
            began.current = true;
        }
        catch (e) {
            if (alive.current)
                setError(explain(e));
        }
        finally {
            if (alive.current)
                setStarting(false);
        }
    }
    async function finish(send: boolean) {
        if (busyRef.current || !began.current) {
            if (!send)
                close();
            return;
        }
        busyRef.current = true;
        setBusy(true);
        try {
            const durationMs = Math.max(1, Math.min(120000, status.durationMillis));
            await recorder.stop();
            began.current = false;
            await module.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false });
            if (!alive.current)
                return;
            if (send) {
                const source = recorder.uri;
                if (!source)
                    throw new Error('Recording unavailable. Try recording again.');
                const bytes = await fileBytes(source);
                if (bytes > 15 * 1024 * 1024)
                    throw new Error('Voice message exceeds 15 MB.');
                const retained = await retainMedia(source);
                if (alive.current)
                    onSend({ kind: 'voice', uri: retained, name: 'Voice-message.m4a', mime: 'audio/mp4', bytes, durationMs });
            }
            close();
        }
        catch (e) {
            if (alive.current)
                setError(explain(e));
        }
        finally {
            busyRef.current = false;
            if (alive.current)
                setBusy(false);
        }
    }
    useEffect(() => {
        alive.current = true;
        const sub = AppState.addEventListener('change', state => {
            if (state !== 'active' && began.current)
                void finish(false);
        });
        return () => {
            alive.current = false;
            sub.remove();
            void module.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true, shouldPlayInBackground: false }).catch(() => {
            });
        };
    }, [recorder]);
    useEffect(() => {
        if (status.durationMillis >= 119000 && began.current)
            void finish(true);
    }, [status.durationMillis]);
    return <Modal visible transparent animationType="fade" onRequestClose={() => void finish(false)}><View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#0008' }}><ScrollView style={{ maxHeight: '90%', backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26 }} contentContainerStyle={{ padding: 24, paddingBottom: 36, gap: 16 }}><GText weight="bold" style={{ fontSize: 23 }}>Voice message</GText><GText tone="muted">Up to 2 minutes. Recording stops when you leave the app.</GText><View style={{ alignItems: 'center', padding: 22, gap: 10 }}><Ionicons name="mic" size={42} color={status.isRecording ? '#D94A55' : colors.text}/><GText weight="bold" style={{ fontSize: 30 }}>{Math.floor(status.durationMillis / 1000)}s</GText></View>{error ? <><GText tone="red">{error}</GText><Button title="Open device Settings" secondary onPress={() => void Linking.openSettings().catch(() => setError('Settings could not be opened.'))}/></> : null}<Button title={starting ? 'Preparing microphone…' : status.isRecording ? 'Send voice message' : 'Start recording'} disabled={busy || starting} onPress={() => status.isRecording ? void finish(true) : void start()}/><Button title="Discard" secondary disabled={busy || starting} onPress={() => void finish(false)}/></ScrollView></View></Modal>;
}
