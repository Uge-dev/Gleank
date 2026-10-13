import { FRONTEND_PREVIEW } from '@/config/preview';
import { TermsConsent } from '@/features/live/legal-pages';
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Button } from '@/features/studio/ui';
import { useCommunity } from './community-state';
export function CommunityConsent() {
    return FRONTEND_PREVIEW ? <PreviewConsent/> : <TermsConsent/>;
}
function PreviewConsent() {
    const community = useCommunity();
    const { colors } = useAppTheme();
    const [checked, setChecked] = useState(false);
    const [expanded, setExpanded] = useState(false);
    if (community.accepted)
        return null;
    return <View style={{ padding: 16, gap: 12, backgroundColor: colors.surfaceSecondary, borderRadius: 18 }}>
    <GText weight="bold">Keep Gleenc welcoming</GText><GText style={{ fontSize: 13, lineHeight: 20 }}>No harassment, hateful or illegal content, scams or privacy violations. Report unsafe content and block unwanted contact.</GText>
    <Pressable accessibilityRole="button" onPress={() => setExpanded(v => !v)} style={{ minHeight: 44, justifyContent: 'center' }}><GText weight="bold">{expanded ? 'Hide the full rules ↑' : 'Read the community rules ↓'}</GText></Pressable>
    {expanded ? <GText style={{ fontSize: 13, lineHeight: 21 }}>Respect people. Do not upload threats, harassment, hateful or exploitative content. Protect private information. Trade honestly: no scams, illegal products, counterfeit goods, impersonation or misleading prices. Upload only content you own or are licensed to use. Do not spam or manipulate reviews. Report unsafe content through its options, and block unwanted accounts. Reports may result in content removal or account restrictions after review.</GText> : null}
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setChecked(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}><Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={colors.text}/><GText style={{ flex: 1 }}>I accept the community rules and terms.</GText></Pressable>
    {community.notice ? <GText tone="red">{community.notice}</GText> : null}
    <Button title="Continue" disabled={!checked || !community.ready} onPress={() => {
            try {
                community.acceptTerms();
            }
            catch (e) {
                Alert.alert('Try again', e instanceof Error ? e.message : 'Unable to save consent.');
            }
        }}/>
  </View>;
}
