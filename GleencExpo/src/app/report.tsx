import { FRONTEND_PREVIEW } from '@/config/preview';
import { ReportPage as ServerScreen } from '@/features/live/social-pages';
import { useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useCommunity } from '@/features/community/community-state';
import { useAccount } from '@/features/account/account-state';
import { REPORT_REASONS, type Report } from '@/features/community/domain';
import { explain } from '@/features/account/guards';
import { Page, Card, Input, Picker, Button, Notice, Toggle } from '@/features/studio/ui';
import { GText } from '@/components/gleenc/text';
function PreviewReportContent() {
    const p = useLocalSearchParams<{
        kind?: string;
        id?: string;
        author?: string;
    }>();
    const social = useCommunity();
    const account = useAccount();
    const [reason, setReason] = useState(REPORT_REASONS[0]);
    const [detail, setDetail] = useState('');
    const [block, setBlock] = useState(false);
    const [result, setResult] = useState('');
    const valid = ['comment', 'review', 'message', 'product', 'account'].includes(p.kind ?? '') && typeof p.id === 'string' && p.id.length <= 200 && typeof p.author === 'string' && !!p.author.trim() && p.author.length <= 100;
    return <Page title="Report content" subtitle="Choose the reason that best describes the issue."><Notice text={social.notice}/>{result ? <Card><GText weight="bold">Report recorded</GText><GText>{result}</GText></Card> : <Card><Picker items={REPORT_REASONS.map(id => ({ id, title: id }))} value={reason} onChange={setReason}/><Input label="More detail · optional" multiline maxLength={1000} value={detail} onChange={setDetail}/><Toggle title={`Also block ${p.author ?? 'this account'}`} detail="Hides their content and prevents local contact." value={block} onChange={setBlock}/><Button title="Submit report" disabled={!valid || !social.ready} onPress={() => {
                try {
                    const r = social.report(p.kind as Report['kind'], p.id!, p.author!, reason, detail);
                    if (block && !account.isBlocked(p.author!))
                        account.toggleBlock(p.author!);
                    setResult('Reference ' + r.id + '. This local report is queued for the connected moderation service.');
                }
                catch (e) {
                    Alert.alert('Report unavailable', explain(e));
                }
            }}/></Card>}{!valid ? <Notice text="This content reference is unavailable. Return to the content and try again."/> : null}</Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewReportContent/> : <ServerScreen/>;}
