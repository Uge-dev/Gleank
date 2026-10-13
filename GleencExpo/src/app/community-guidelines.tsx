import { FRONTEND_PREVIEW } from '@/config/preview';
import { LegalPage as ServerScreen } from '@/features/live/legal-pages';
import { useRouter } from 'expo-router';
import { Page, Card, Heading, Row } from '@/features/studio/ui';
import { GText } from '@/components/gleenc/text';
import { COMMUNITY_VERSION } from '@/features/community/domain';
function PreviewGuidelines() {
    const router = useRouter();
    return <Page title="Community rules" subtitle={'Version ' + COMMUNITY_VERSION}><Card><Heading>Respect people</Heading><GText>Do not post harassment, hate, threats, sexual exploitation, or content that exposes someone’s private information. Do not impersonate another person.</GText><Heading>Trade honestly</Heading><GText>Describe products accurately. Prohibited and illegal products, counterfeit goods, scams, malicious files and misleading price or delivery claims are not allowed.</GText><Heading>Own your content</Heading><GText>Upload only material you own or are allowed to use. Keep discussions relevant. Do not spam, manipulate reviews or use messages to pressure buyers.</GText><Heading>Report and block</Heading><GText>Use the options beside a comment, review, message, product or profile to report it. You can block an account immediately and manage blocked accounts in Settings. A connected moderation team must review reports and apply content removal or account restrictions.</GText></Card><Card><Row icon="shield-checkmark-outline" title="Privacy, terms and support" onPress={() => router.push('/settings')}/></Card></Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewGuidelines/> : <ServerScreen community/>;}
