import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/use-auth';
import { useLive, useServerQuery, object, rows } from './state';
import { Page, Card, Heading, Button, Row, GText, Action, QueryState, Member } from './ui';
export function LegalPage({ community = false }: {
    community?: boolean;
}) { const params = useLocalSearchParams<{
    kind?: string;
}>(), [kind, setKind] = useState(community ? 'community' : params.kind || 'privacy'), query = useServerQuery(() => api.request('/legal/' + kind), 'legal:' + kind), document = object(query.data), router = useRouter(); return <Page title={document.title || 'Privacy, terms & support'}>{!community ? <View style={{ gap: 8 }}>{[['privacy', 'Privacy Policy'], ['terms', 'Terms of Service'], ['community', 'Community Guidelines']].map(([id, title]) => <Button key={id} secondary title={title} onPress={() => setKind(id)}/>)}</View> : null}<QueryState query={query}><GText tone="muted">Version {document.version} · Effective {document.effectiveDate}</GText>{(Array.isArray(document.sections) ? document.sections : []).map((s: string[], index: number) => <Card key={index}><Heading>{s[0]}</Heading><GText style={{ lineHeight: 23 }}>{s[1]}</GText></Card>)}<Row title="Contact support" detail={document.supportEmail} icon="mail-outline" onPress={() => void Linking.openURL('mailto:' + encodeURIComponent(document.supportEmail || 'support@gleenc.com'))}/><Row title="Account deletion" icon="trash-outline" onPress={() => router.push('/account-deletion')}/></QueryState>{community ? <TermsConsent /> : null}</Page>; }
export function TermsConsent() { const live = useLive(), { user } = useAuth(), router = useRouter(), [checked, setChecked] = useState(false); if (live.account?.termsVersion === live.capabilities.termsVersion && live.capabilities.termsVersion)
    return <GText tone="muted">You have accepted the current terms.</GText>; return <Member><Card><Heading>Before you continue</Heading><GText>Read the Terms of Service, Privacy Policy and Community Guidelines before publishing, messaging or purchasing.</GText><Row title="Read terms" icon="document-text-outline" onPress={() => router.push({ pathname: '/legal', params: { kind: 'terms' } })}/><Row title="Read privacy policy" icon="shield-outline" onPress={() => router.push({ pathname: '/legal', params: { kind: 'privacy' } })}/><Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => setChecked(v => !v)} style={{ paddingVertical: 14 }}><GText weight="bold">{checked ? '☑' : '☐'} I am at least 18 and accept the Terms of Service and Community Guidelines. I have read the Privacy Policy.</GText></Pressable><Action title="Accept and continue" disabled={!checked || !live.capabilities.termsVersion} run={async () => { const result = await live.perform(() => api.account.acceptTerms(String(live.capabilities.termsVersion)), { verified: false, terms: false }); if (result) {
    await live.reload();
    router.back();
} }}/></Card></Member>; }
