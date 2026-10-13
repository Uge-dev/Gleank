import { FRONTEND_PREVIEW } from '@/config/preview';
import { AppStatusPage as ServerScreen } from '@/features/live/seller-tools';
import { Platform, Linking, Alert } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useExperience } from '@/features/experience/experience';
import { useCommunity } from '@/features/community/community-state';
import { useChat } from '@/features/chat/chat-state';
import { useReviews } from '@/features/reviews/review-state';
import { usePayments } from '@/features/payments/payment-state';
import { Page, Card, Heading, Row, Button, Notice } from '@/features/studio/ui';
import { GText } from '@/components/gleenc/text';
function PreviewAppStatus() {
    const experience = useExperience(), social = useCommunity(), chat = useChat(), reviews = useReviews(), payment = usePayments();
    return <Page title="App & permissions"><Card><Heading>Connection</Heading><GText>{experience.connection === 'unknown' ? 'Connection status unavailable' : experience.connection}</GText><Button title="Check again" secondary onPress={() => void experience.checkConnection()}/><GText tone="muted">Reduced motion · {experience.reducedMotion ? 'On' : 'Off'} · follows device settings</GText></Card><Card><Heading>Native features</Heading>{[['Photo picker', 'ExponentImagePicker'], ['Microphone', 'ExpoAudio'], ['Video playback', 'ExpoVideo'], ['Document picker', 'ExpoDocumentPicker'], ['Files', 'ExponentFileSystem'], ['PDF receipt', 'ExpoPrint'], ['Share sheet', 'ExpoSharing']].map(([name, module]) => <GText key={module}>{name} · {Platform.OS === 'web' ? 'Browser capability' : requireOptionalNativeModule(module) ? 'Included in this build' : 'Install a new development build'}</GText>)}<Button title="Open device permissions" secondary onPress={() => void Linking.openSettings().catch(() => Alert.alert('Device Settings', 'Open Settings and find Gleenc.'))}/></Card><Card><Heading>Saved records</Heading>{[[social, 'Community'], [chat, 'Messages'], [reviews, 'Reviews'], [payment, 'Payments']].map(([entry, label]) => {
            const record = entry as typeof social;
            return <Row key={String(label)} title={String(label)} detail={record.notice || (record.ready ? 'Ready' : 'Loading')} icon="refresh-outline" onPress={() => record.notice.includes('loaded') ? record.reload() : void record.retrySave()}/>;
        })}</Card></Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewAppStatus/> : <ServerScreen/>;}
