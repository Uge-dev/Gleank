import { FRONTEND_PREVIEW } from '@/config/preview';
import { AddressesPage as ServerScreen } from '@/features/live/account-pages';
import { useState } from 'react';
import { Alert } from 'react-native';
import { GText } from '@/components/gleenc/text';
import { useAccount, type Address } from '@/features/account/account-state';
import { explain } from '@/features/account/guards';
import { Button, Card, Empty, Input, Notice, Page, Toggle } from '@/features/studio/ui';
type Form = Omit<Address, 'ownerId' | 'id'> & {
    id?: string;
};
function PreviewAddresses() {
    const a = useAccount();
    const blank = (): Form => ({ label: 'Home', recipient: a.profile.displayName, phone: a.profile.phone, street: '', city: a.profile.city, state: a.profile.state, instructions: '', isDefault: !a.addresses.length });
    const [form, setForm] = useState<Form | null>(null), [notice, setNotice] = useState('');
    return <Page title="Delivery addresses" subtitle="Save a place once and choose it at checkout."><Button title="Add an address" icon="add" onPress={() => {
            setForm(blank());
            setNotice('');
        }}/>{form ? <Card>{(['label', 'recipient', 'phone', 'street', 'city', 'state', 'instructions'] as const).map(key => <Input key={key} label={{ label: 'Label', recipient: 'Recipient', phone: 'Phone number', street: 'Street & building', city: 'City', state: 'State', instructions: 'Delivery instructions' }[key]} value={form[key]} maxLength={key === 'street' ? 250 : key === 'instructions' ? 300 : 80} onChange={v => setForm({ ...form, [key]: v })}/>)}<Toggle title="Default address" value={form.isDefault} onChange={isDefault => setForm({ ...form, isDefault })}/><Button title="Save address" disabled={!a.ready} onPress={() => {
                try {
                    a.saveAddress(form);
                    setForm(null);
                }
                catch (e) {
                    setNotice(explain(e));
                }
            }}/><Button secondary title="Cancel" onPress={() => setForm(null)}/></Card> : null}<Notice text={notice || a.notice}/>{!a.addresses.length && !form ? <Empty title="Your places" detail="Add a delivery address to make checkout quicker." icon="location-outline"/> : a.addresses.map(address => <Card key={address.id}><GText weight="bold">{address.label}{address.isDefault ? ' · Default' : ''}</GText><GText>{address.recipient} · {address.phone}</GText><GText tone="muted">{address.street}, {address.city}, {address.state}</GText><Button secondary title="Edit address" onPress={() => setForm({ ...address })}/><Button secondary title="Remove" onPress={() => Alert.alert('Remove this address?', 'You can add it again later.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => {
                        try {
                            a.removeAddress(address.id);
                        }
                        catch (e) {
                            setNotice(explain(e));
                        }
                    } }])}/></Card>)}</Page>;
}

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewAddresses/> : <ServerScreen/>;}
