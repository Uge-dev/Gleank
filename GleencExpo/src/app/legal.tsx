import { FRONTEND_PREVIEW } from '@/config/preview';
import { LegalPage as ServerScreen } from '@/features/live/legal-pages';
import { Alert, Linking } from 'react-native';
import { AppConfig } from '@/constants/config';
import { Page, Card, Heading, Row } from '@/features/studio/ui';
import { GText } from '@/components/gleenc/text';
import { useRouter } from 'expo-router';
function PreviewLegal() {
    const router = useRouter();
    return <Page title="Privacy, terms & support"><Card><Heading>Your information</Heading><GText style={{ lineHeight: 22 }}>This frontend stores profile preferences, comments, messages, cart selections, order records, reviews and payment test history in app storage on this device. Selected attachments are copied into app files. These local records are not encrypted end-to-end and are not proof of payment or identity.</GText><GText style={{ lineHeight: 22 }}>Microphone, photo and camera access is requested only when you use the corresponding feature. Denying microphone access does not prevent text messaging. You can change permissions in device Settings.</GText><Heading>Content & purchases</Heading><GText style={{ lineHeight: 22 }}>Follow community rules and share only content you are permitted to upload. Prices, stock, delivery terms and licences must be clear. Wallet and checkout controls in this build simulate transactions; they do not charge or transfer real money.</GText><Heading>Retention & deletion</Heading><GText style={{ lineHeight: 22 }}>You can delete your comments and reviews, clear conversations and request account deletion in Settings. A deletion request in this frontend does not delete a live account. Connected services must enforce data retention, deletion, moderation and payment policies before launch.</GText><Row title="Community rules" icon="people-outline" onPress={() => router.push('/community-guidelines')}/><Row title="Account deletion" icon="trash-outline" onPress={() => router.push('/account-deletion')}/><Row title="Contact support" detail={AppConfig.supportEmail} icon="mail-outline" onPress={() => void Linking.openURL('mailto:' + AppConfig.supportEmail).catch(() => Alert.alert('Contact support', AppConfig.supportEmail))}/></Card></Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewLegal/> : <ServerScreen/>;}
