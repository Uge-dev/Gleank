import { FRONTEND_PREVIEW } from '@/config/preview';
import { SettingsPage as ServerScreen } from '@/features/live/account-pages';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { useAccount } from '@/features/account/account-state';
import { useAuth } from '@/hooks/use-auth';
import { explain } from '@/features/account/guards';
import { Button, Card, Chips, Heading, Input, Notice, Page, Row, Toggle } from '@/features/studio/ui';
function PreviewSettings() {
    const a = useAccount(), router = useRouter(), auth = useAuth();
    const [notice, setNotice] = useState(''), [block, setBlock] = useState('');
    const update = (key: 'orderAlerts' | 'socialAlerts' | 'messageAlerts' | 'privateProfile' | 'showOnline', value: boolean) => {
        try {
            a.updatePreferences({ [key]: value });
        }
        catch (e) {
            setNotice(explain(e));
        }
    };
    return <Page title="Settings"><Card><Row title="Edit profile" icon="person-outline" onPress={() => router.push('/edit-profile')}/><Row title="Delivery addresses" icon="location-outline" onPress={() => router.push('/addresses')}/><Row title="Bank accounts" icon="business-outline" onPress={() => router.push('/bank-accounts')}/></Card><Card><Heading>Appearance</Heading><Chips items={['system', 'light', 'dark']} value={a.preferences.appearance} onChange={appearance => {
            try {
                a.updatePreferences({ appearance: appearance as 'system' | 'light' | 'dark' });
            }
            catch (e) {
                setNotice(explain(e));
            }
        }}/></Card><Card><Heading>Activity preferences</Heading><Toggle title="Orders & delivery" value={a.preferences.orderAlerts} onChange={v => update('orderAlerts', v)}/><Toggle title="Likes, comments & follows" value={a.preferences.socialAlerts} onChange={v => update('socialAlerts', v)}/><Toggle title="Message alerts" detail="Include unread messages in the bottom Alerts badge. Your conversations remain available." value={a.preferences.messageAlerts} onChange={v => update('messageAlerts', v)}/></Card><Card><Heading>Privacy</Heading><Toggle title="Private profile" detail="Hide personal bio and location from your public storefront. Listings stay visible." value={a.preferences.privateProfile} onChange={v => update('privateProfile', v)}/><Toggle title="Show online status" value={a.preferences.showOnline} onChange={v => update('showOnline', v)}/><Input label="Block a seller or account name" value={block} maxLength={100} onChange={setBlock}/><Button secondary title="Block account" disabled={!block.trim()} onPress={() => {
            try {
                if (a.isBlocked(block.trim()))
                    throw new Error('This account is already blocked.');
                a.toggleBlock(block.trim());
                setBlock('');
            }
            catch (e) {
                setNotice(explain(e));
            }
        }}/>{a.blocked.map(name => <Row key={name} title={name} detail="Blocked · tap to unblock" icon="ban-outline" onPress={() => {
                try {
                    a.toggleBlock(name);
                }
                catch (e) {
                    setNotice(explain(e));
                }
            }}/>)}</Card><Notice text={notice || a.notice}/><Card><Heading>Help & community</Heading><Row title="Community rules" icon="people-outline" onPress={() => router.push('/community-guidelines')}/><Row title="App & permissions" icon="settings-outline" onPress={() => router.push('/app-status')}/><Row title="Privacy, terms & support" icon="shield-checkmark-outline" onPress={() => router.push('/legal')}/></Card><Card><Heading>Account security</Heading><Row title="Reset password" detail="Use the existing password reset flow" icon="key-outline" onPress={() => router.push('/forgot-password')}/><Button secondary title="Request account deletion" onPress={() => router.push('/account-deletion')}/><Button secondary title="Sign out" onPress={() => {
            void auth.signOut().then(() => router.replace('/home')).catch(e => setNotice(explain(e)));
        }}/></Card></Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewSettings/> : <ServerScreen/>;}
