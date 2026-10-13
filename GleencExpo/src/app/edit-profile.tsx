import { FRONTEND_PREVIEW } from '@/config/preview';
import { EditProfilePage as ServerScreen } from '@/features/live/account-pages';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useAccount, type ProfileDetails } from '@/features/account/account-state';
import { explain } from '@/features/account/guards';
import { Button, Card, Heading, Input, Notice, Page } from '@/features/studio/ui';
function PreviewEditProfile() {
    const account = useAccount();
    const router = useRouter();
    const [form, setForm] = useState<ProfileDetails>({ ...account.profile }), [notice, setNotice] = useState('');
    const loaded = useRef(account.ready);
    useEffect(() => {
        if (account.ready && !loaded.current) {
            setForm({ ...account.profile });
            loaded.current = true;
        }
    }, [account.ready]);
    const field = (key: keyof ProfileDetails, label: string, maxLength = 100, multiline = false) => <Input key={key} label={label} value={form[key]} maxLength={maxLength} multiline={multiline} onChange={value => setForm(p => ({ ...p, [key]: value }))}/>;
    return <Page title="Edit profile" subtitle="Let people know who you are and what you offer."><Card><Heading>Your identity</Heading>{field('displayName', 'Display name', 80)}{field('username', 'Username', 24)}{field('bio', 'Bio', 300, true)}</Card><Card><Heading>Contact & location</Heading>{field('phone', 'Phone number', 25)}{field('city', 'City', 80)}{field('state', 'State', 80)}</Card><Card><Heading>Your storefront</Heading>{field('storeName', 'Store name', 100)}{field('storeDescription', 'About your store', 600, true)}</Card><Notice text={notice || account.notice}/><Button title="Save changes" disabled={!account.ready} onPress={() => {
            try {
                account.updateProfile(form);
                router.back();
            }
            catch (e) {
                setNotice(explain(e));
            }
        }}/></Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewEditProfile/> : <ServerScreen/>;}
