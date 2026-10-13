import { enablePush, disablePush } from './push';
import { useEffect, useState } from 'react';
import { View, Linking, Alert, Image, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/services/api';
import { useLive, useServerQuery, object, rows } from './state';
import { Page, Card, Heading, Button, Input, Row, Notice, Chips, Toggle, GText, Action, QueryState, Member, Avatar, Money } from './ui';
import { pickUpload, pickDocument } from './media';
export function ProfilePage() {
    const { user, signOut } = useAuth(), live = useLive(), router = useRouter(), account = live.account, profile = object(user?.profile);
    const query = useServerQuery(() => api.products.mine({ limit: 100 }), 'profile-listings', !!user);
 const followers=useServerQuery(()=>api.people.connections(user?.id||'',{kind:'followers',limit:1}),'own-followers',!!user),following=useServerQuery(()=>api.people.connections(user?.id||'',{kind:'following',limit:1}),'own-following',!!user);
    return <Page title="Your profile"><Member><Notice text={live.notice}/><Card>
  {object(account?.profile).coverUrl ? <Pressable onPress={() => router.push('/edit-profile')} accessibilityLabel="Change cover photo"><Image source={{ uri: object(account?.profile).coverUrl }} style={{ height: 170, borderRadius: 18 }}/></Pressable> : <Button secondary title="Add cover photo" onPress={() => router.push('/edit-profile')}/>}
  <Pressable onPress={() => router.push('/edit-profile')} accessibilityLabel="Change profile photo"><Avatar uri={user?.avatarUrl} name={user?.name || ''} size={80}/></Pressable><Heading>{profile.displayName || user?.name || 'Your profile'}</Heading>
  {profile.username ? <GText tone="muted">@{profile.username}</GText> : <Row title="Choose your username" icon="at-outline" onPress={() => router.push('/edit-profile')}/>}
  {profile.bio ? <GText>{profile.bio}</GText> : null}<Row title={(followers.data?.total??0)+' followers'} icon="people-outline" onPress={()=>router.push({pathname:'/connections',params:{userId:user?.id||'',kind:'followers'}})}/><Row title={(following.data?.total??0)+' following'} icon="people-outline" onPress={()=>router.push({pathname:'/connections',params:{userId:user?.id||'',kind:'following'}})}/>
  <View style={{ flexDirection: 'row', gap: 12 }}><View style={{ flex: 1 }}><Button title="Edit profile" onPress={() => router.push('/edit-profile')}/></View><View style={{ flex: 1 }}><Button title="Verification" secondary onPress={() => router.push('/verification')}/></View></View>
  {!user?.emailVerified ? <Row title="Verify your email" detail="Complete this step to publish and purchase." icon="mail-outline" onPress={() => router.push('/verify-email')}/> : null}
 </Card><Card>{[['Selling details', 'selling-settings', 'storefront-outline'], ['My products', 'manage-products', 'cube-outline'], ['Saved products', 'saved', 'bookmark-outline'], ['Orders', 'orders', 'bag-outline'], ['Seller orders', 'seller-orders', 'receipt-outline'], ['Price catalogue', 'catalogue', 'list-outline'], ['Offers', 'offers', 'pricetag-outline'], ['Wallet', 'wallet', 'wallet-outline'], ['Digital library', 'digital-library', 'document-outline'], ['Settings', 'settings', 'settings-outline']].map(([title, path, icon]) => <Row key={path} title={title} icon={icon as any} onPress={() => router.push('/' + path as any)}/>)}</Card>
 <Card><Heading>Your listings</Heading><QueryState query={query}>{rows(query.data).map(p => <Row key={p.id} title={p.name} detail={p.state} icon="cube-outline" onPress={() => router.push({ pathname: '/product', params: { productId: p.id } })}/>)}</QueryState></Card>
 <Action title="Sign out" secondary run={async () => { try {
        await disablePush().catch(() => undefined);
        await signOut();
    }
    finally {
        router.replace('/home');
    } }}/></Member></Page>;
}
export function EditProfilePage() {
    const { user, refreshSession } = useAuth(), live = useLive(), router = useRouter();
    const [form, setForm] = useState({ name: '', username: '', displayName: '', bio: '', country: 'Nigeria', state: '', city: '', activities: [] as string[] });
    useEffect(() => { if (user)
        setForm({ name: user.name, username: user.profile?.username || '', displayName: user.profile?.displayName || user.name, bio: user.profile?.bio || '', country: user.country || 'Nigeria', state: user.state || '', city: user.city || '', activities: user.profile?.activities || [] }); }, [user?.id]);
    const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));
    return <Page title="Complete your profile" subtitle="Your name and username help people recognise you across Gleenc."><Member><Card>
 {(['name', 'displayName', 'username', 'bio', 'country', 'state', 'city'] as const).map(key => <Input key={key} label={{ name: 'Full name', displayName: 'Display name', username: 'Username', bio: 'Bio', country: 'Country', state: 'State', city: 'City' }[key]} value={form[key]} onChange={v => update(key, key === 'username' ? v.toLowerCase().replace(/^@/, '') : v)} maxLength={key === 'bio' ? 300 : 80} multiline={key === 'bio'}/>)}
 <Heading>Your interests</Heading>{[['selling', 'Sell my products'], ['dropshipping', 'Reshare products and earn'], ['marketing', 'Promote products']].map(([key, label]) => <Toggle key={key} title={label} value={form.activities.includes(key)} onChange={checked => setForm(f => ({ ...f, activities: checked ? [...f.activities, key] : f.activities.filter(v => v !== key) }))}/>)}
 <Action title="Save profile" run={async () => { const result = await live.perform(() => api.account.editProfile({ profile: form }), { verified: false, terms: false }); if (result) {
        await refreshSession();
        live.changed();
        router.replace('/profile');
    } }}/>
 </Card><Card><Heading>Profile images</Heading><Action title="Change profile photo" secondary run={async () => { if (!(await live.ensure()))
        return; const media = await pickUpload('avatar'); if (media)
        await live.perform(() => api.account.editProfile({ avatarId: media.id })); live.changed(); }}/><Action title="Change cover photo" secondary run={async () => { if (!(await live.ensure()))
        return; const media = await pickUpload('cover'); if (media)
        await live.perform(() => api.account.editProfile({ coverId: media.id })); live.changed(); }}/></Card></Member></Page>;
}
export function SellingSettingsPage() { const live = useLive(), [form, setForm] = useState({ name: '', coverage: '', deliveryFee: '0', deliveryDays: '2', dispatchAddress: '', phone: '' }); useEffect(() => { const s = object(live.account?.selling); if (s.name)
    setForm({ name: s.name, coverage: s.coverage || '', deliveryFee: String(s.deliveryFee || 0), deliveryDays: String(s.deliveryDays || 2), dispatchAddress: s.dispatchAddress || '', phone: s.phone || '' }); }, [live.account?.user?.id]); return <Page title="Selling details" subtitle="Tell buyers who fulfils their order and where it is dispatched from."><Member><Card>{Object.entries(form).map(([key, value]) => <Input key={key} label={{ name: 'Store name', coverage: 'Delivery coverage', deliveryFee: 'Delivery fee (₦)', deliveryDays: 'Delivery days', dispatchAddress: 'Dispatch address', phone: 'Contact phone' }[key] || key} value={value} onChange={v => setForm(f => ({ ...f, [key]: v }))}/>)}<Action title="Save selling details" run={async () => { await live.perform(() => api.account.selling({ ...form, deliveryFee: Number(form.deliveryFee), deliveryDays: Number(form.deliveryDays) })); }}/></Card></Member></Page>; }
export function VerificationPage() {
    const { user, refreshSession } = useAuth(), live = useLive(), router = useRouter();
    const query = useServerQuery(() => api.request('/me/verification'), 'verification', !!user), v = object(query.data), policy = object(v.policy);
    const [tier, setTier] = useState('2'), [phone, setPhone] = useState(''), [code, setCode] = useState(''), [documents, setDocuments] = useState<string[]>([]), [addressFiles, setAddressFiles] = useState<string[]>([]), [form, setForm] = useState({ legalName: '', documentType: 'national_id', address: '', businessName: '', sourceOfGoods: '' });
    return <Page title="Seller verification" subtitle="Upgrade before publishing higher-value products. You can apply before creating a listing."><Member><QueryState query={query}><Card><Heading>Tier {v.tier || 0}</Heading><GText>Listing and order limit</GText><Money amount={v.limitKobo}/><GText>{String(v.status || 'Not started').replace(/_/g, ' ')}</GText><Notice text={v.reason || ''}/>{rows(policy.tiers).map(t => <Card key={t.tier}><Heading>Tier {t.tier} · {t.name}</Heading><Money amount={t.limitKobo}/>{(t.requirements || []).map((r: string) => <GText key={r}>• {r}</GText>)}</Card>)}</Card>
 <Card><Heading>Tier 1 checklist</Heading>{Object.entries(object(v.checks)).map(([key, done]) => <GText key={key}>{done ? '✓' : '○'} {key === 'email' ? 'Verified email' : key === 'phone' ? 'Verified phone' : key === 'profile' ? 'Complete profile' : 'Selling details'}</GText>)}
 <Row title="Verify email" icon="mail-outline" onPress={() => router.push('/verify-email')}/><Row title="Complete profile" icon="person-outline" onPress={() => router.push('/edit-profile')}/><Row title="Selling details" icon="storefront-outline" onPress={() => router.push('/selling-settings')}/>
 <Input label="Phone number, including country code" value={phone} onChange={setPhone} placeholder="+234…"/><Action title="Send phone code" disabled={!policy.phoneAvailable} run={async () => { await live.perform(() => api.request('/me/phone/request', { method: 'POST', body: { phone } }), { terms: false }); }}/>
 {!policy.phoneAvailable ? <GText tone="muted">Phone verification is temporarily unavailable. Contact support if you need help completing this step.</GText> : null}
 <Input label="Verification code" value={code} onChange={setCode} numeric/><Action title="Verify phone" disabled={!policy.phoneAvailable} run={async () => { await live.perform(() => api.request('/me/phone/confirm', { method: 'POST', body: { code } }), { terms: false }); await refreshSession(); query.refresh(); }}/>
 </Card><Card><Heading>Apply for the next tier</Heading><Chips items={['2', '3']} value={tier} onChange={setTier}/>{(['legalName', 'address', 'businessName', 'sourceOfGoods'] as const).map(key => <Input key={key} label={{ legalName: 'Name on identity document', address: 'Residential or business address', businessName: 'Business name (optional)', sourceOfGoods: 'How you source the goods you sell' }[key]} value={form[key]} onChange={value => setForm(f => ({ ...f, [key]: value }))} multiline={key === 'sourceOfGoods'} maxLength={2000}/>)}
 <Chips items={['national_id', 'passport', 'drivers_licence', 'voters_card']} value={form.documentType} onChange={value => setForm(f => ({ ...f, documentType: value }))}/>
 <Action title={`Attach identity evidence (${documents.length})`} secondary run={async () => { if (!(await live.ensure()))
        return; const file = await pickDocument('document'); if (file)
        setDocuments(ids => [...ids, file.id].slice(0, 3)); }}/>
 <Action title={`Attach address evidence (${addressFiles.length})`} secondary run={async () => { if (!(await live.ensure()))
        return; const file = await pickDocument('document'); if (file)
        setAddressFiles(ids => [...ids, file.id].slice(0, 3)); }}/>
 <GText tone="muted">Evidence is private and accessible only to authorised reviewers. Approval is a verification decision, not a guarantee of a seller’s future conduct.</GText>
 <Action title="Submit for review" disabled={v.status === 'under_review'} run={async () => { const result = await live.perform(() => api.request('/me/verification', { method: 'POST', body: { ...form, tier: Number(tier), documentIds: documents, addressEvidenceIds: addressFiles } })); if (result)
        query.refresh(); }}/>
 </Card></QueryState></Member></Page>;
}
export function SettingsPage() { const live = useLive(), { user, linkGoogle } = useAuth(), [linkPassword, setLinkPassword] = useState(''), router = useRouter(), s = object(live.account?.settings); const devices = useServerQuery(() => api.account.devices(), 'devices', !!user); const save = async (patch: object) => { await live.perform(() => api.account.settings({ ...s, ...patch }), { verified: false, terms: false }); }; return <Page title="Settings"><Member>{live.capabilities.googleSignInAvailable ? <Card><Heading>Link Google sign-in</Heading><Input label="Confirm your account password" value={linkPassword} onChange={setLinkPassword} secure/><Action title="Link my Google account" run={async () => { await linkGoogle(linkPassword); setLinkPassword(''); live.changed(); }}/></Card> : null}<Card><Action title="Enable device push notifications" secondary run={async () => { if (await live.ensure(false, false))
    await enablePush(); }}/><Action title="Disable device push notifications" secondary run={async () => { if (await live.ensure(false, false))
    await disablePush(); }}/><Heading>Appearance</Heading><Chips items={['system', 'light', 'dark']} value={s.theme || 'system'} onChange={theme => void save({ theme }).catch(() => undefined)}/>{[['orderNotifications', 'Order notifications'], ['activityNotifications', 'Activity notifications'], ['messageNotifications', 'Message notifications'], ['showOnline', 'Show online status']].map(([key, title]) => <Toggle key={key} title={title} value={s[key] !== false} onChange={value => void save({ [key]: value }).catch(() => undefined)}/>)}<Heading>Who can message you?</Heading><Chips items={['everyone', 'following', 'nobody']} value={s.allowMessages || 'everyone'} onChange={allowMessages => void save({ allowMessages }).catch(() => undefined)}/></Card><Card>{[['Addresses', 'addresses', 'location-outline'], ['Bank account', 'bank-accounts', 'card-outline'], ['Blocked accounts', 'blocked-accounts', 'ban-outline'], ['Verification', 'verification', 'shield-checkmark-outline'], ['Privacy and terms', 'legal', 'document-text-outline'], ['Community guidelines', 'community-guidelines', 'people-outline'], ['Delete account', 'account-deletion', 'trash-outline']].map(([title, path, icon]) => <Row key={path} title={title} icon={icon as any} onPress={() => router.push('/' + path as any)}/>)}</Card><Card><Heading>Signed-in devices</Heading><QueryState query={devices}>{rows(devices.data).map(device => <View key={device.id} style={{ gap: 8 }}><GText>{device.device_name}</GText><GText tone="muted">Expires {new Date(device.expires_at).toLocaleDateString()}</GText><Action title="Sign out this device" secondary run={async () => { await live.perform(() => api.account.revokeDevice(device.id), { verified: false, terms: false }); devices.refresh(); }}/></View>)}</QueryState></Card></Member></Page>; }
export function AddressesPage() {
    const { user } = useAuth(), live = useLive();
    const query = useServerQuery(() => api.account.addresses(), 'addresses', !!user);
    const empty = { label: 'Home', name: '', phone: '', address: '', city: '', state: '', country: 'Nigeria' };
    const [form, setForm] = useState(empty), [editing, setEditing] = useState<string>();
    return <Page title="Delivery addresses"><Member><QueryState query={query}>{rows(query.data).map(a => <Card key={a.id}><Heading>{a.label}</Heading><GText>{a.name} · {a.phone}</GText><GText>{a.address}, {a.city}, {a.state}</GText><Button title="Edit address" secondary onPress={() => { setEditing(a.id); setForm(Object.fromEntries(Object.keys(empty).map(k => [k, a[k] || ''])) as typeof empty); }}/><Action title="Delete address" secondary run={async () => { await live.perform(() => api.account.deleteAddress(a.id), { terms: false }); if (editing === a.id) {
        setEditing(undefined);
        setForm(empty);
    } query.refresh(); }}/></Card>)}</QueryState><Card><Heading>{editing ? 'Edit address' : 'Add an address'}</Heading>{Object.entries(form).map(([key, value]) => <Input key={key} label={key === 'name' ? 'Recipient name' : key === 'address' ? 'Street address' : key[0].toUpperCase() + key.slice(1)} value={value} onChange={v => setForm(f => ({ ...f, [key]: v }))}/>)}<Action title="Save address" run={async () => { const result = await live.perform(() => api.account.saveAddress(form, editing), { terms: false }); if (result) {
        setEditing(undefined);
        setForm(empty);
        query.refresh();
    } }}/>{editing ? <Button title="Cancel editing" secondary onPress={() => { setEditing(undefined); setForm(empty); }}/> : null}</Card></Member></Page>;
}
export function DeleteAccountPage() { const live = useLive(), { signOut } = useAuth(), router = useRouter(), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''); return <Page title="Delete your account"><Member><Card><Heading>Before you continue</Heading><GText>Your listings and access will be disabled. Open orders, held funds and disputes must be resolved first. Records required for fraud prevention, financial obligations or legal compliance may be retained with restricted access.</GText><GText>This action cannot be undone once deletion is completed.</GText><Input label="Password" value={password} onChange={setPassword} secure/><Button title="Set or reset my password" secondary onPress={()=>router.push('/forgot-password')}/><GText tone="muted">If you joined with Google or Apple, use verified email recovery to set a password before requesting deletion.</GText><Input label="Type DELETE to confirm" value={confirmation} onChange={setConfirmation}/><Action title="Request account deletion" disabled={confirmation !== 'DELETE'} run={async () => { const result = await live.perform(() => api.account.delete({ password, confirm: 'DELETE' }), { verified: false, terms: false }); if (result) {
    await signOut().catch(() => undefined);
    router.replace('/home');
} }}/></Card></Member></Page>; }
