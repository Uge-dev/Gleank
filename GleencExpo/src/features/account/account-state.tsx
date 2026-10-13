import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { localStorage } from '@/features/commerce/session-storage';
import { text } from '@/features/marketplace/domain';
import { list, phone, required, secureId } from './guards';
export type ProfileDetails = {
    displayName: string;
    username: string;
    bio: string;
    phone: string;
    city: string;
    state: string;
    storeName: string;
    storeDescription: string;
};
export type Preferences = {
    appearance: 'system' | 'light' | 'dark';
    orderAlerts: boolean;
    socialAlerts: boolean;
    messageAlerts: boolean;
    privateProfile: boolean;
    showOnline: boolean;
};
export type Address = {
    id: string;
    ownerId: string;
    label: string;
    recipient: string;
    phone: string;
    street: string;
    city: string;
    state: string;
    instructions: string;
    isDefault: boolean;
};
// Only display metadata is retained. Real bank verification must return a server-side recipient token.
export type BankAccount = {
    id: string;
    ownerId: string;
    bank: string;
    name: string;
    last4: string;
};
type Snapshot = {
    ownerId: string;
    profile: ProfileDetails;
    preferences: Preferences;
    addresses: Address[];
    banks: BankAccount[];
    blocked: string[];
    deletionRequest?: {
        id: string;
        ownerId: string;
        reason: string;
        at: number;
    };
};
type Value = Snapshot & {
    requestDeletion: (confirmation: string, reason: string) => void;
    cancelDeletion: () => void;
    ready: boolean;
    notice: string;
    updateProfile: (p: ProfileDetails) => void;
    updatePreferences: (p: Partial<Preferences>) => void;
    saveAddress: (a: Omit<Address, 'ownerId' | 'id'> & {
        id?: string;
    }) => void;
    removeAddress: (id: string) => void;
    saveBank: (bank: string, name: string, number: string) => void;
    removeBank: (id: string) => void;
    toggleBlock: (name: string) => void;
    isBlocked: (name: string) => boolean;
};
export const AccountContext = createContext<Value | null>(null);
const defaults: Preferences = { appearance: 'system', orderAlerts: true, socialAlerts: true, messageAlerts: true, privateProfile: false, showOnline: true };
function validateProfile(p: ProfileDetails): ProfileDetails {
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(p.username))
        throw new Error('Username must be 3–24 letters, numbers or underscores.');
    return { displayName: required(p.displayName, 'your name', 80), username: p.username.toLowerCase(), bio: text(p.bio, 300), phone: p.phone ? phone(p.phone) : '', city: text(p.city, 80), state: text(p.state, 80), storeName: text(p.storeName, 100), storeDescription: text(p.storeDescription, 600) };
}
function validatePreferences(p: Preferences) {
    if (!['system', 'light', 'dark'].includes(p.appearance))
        throw new Error('Choose a valid appearance.');
    for (const key of ['orderAlerts', 'socialAlerts', 'messageAlerts', 'privateProfile', 'showOnline'] as const)
        if (typeof p[key] !== 'boolean')
            throw new Error('Invalid preference.');
    return p;
}
function validateAddress(a: Address, ownerId: string): Address {
    if (a.ownerId !== ownerId || typeof a.isDefault !== 'boolean')
        throw new Error('Address ownership mismatch.');
    return { id: required(a.id, 'an address ID'), ownerId, label: required(a.label, 'an address label', 40), recipient: required(a.recipient, 'the recipient', 80), phone: phone(a.phone), street: required(a.street, 'the street address', 250), city: required(a.city, 'the city', 80), state: required(a.state, 'the state', 80), instructions: text(a.instructions, 300), isDefault: a.isDefault };
}
export function restoreAccount(raw: string, ownerId: string): Snapshot {
    if (raw.length > 150000)
        throw new Error('Saved account is too large.');
    const s: Snapshot = JSON.parse(raw);
    if (!s || s.ownerId !== ownerId)
        throw new Error('Account ownership mismatch.');
    s.profile = validateProfile(s.profile);
    s.preferences = validatePreferences(s.preferences);
    s.addresses = list<Address>(s.addresses, 20).map(a => validateAddress(a, ownerId));
    s.banks = list<BankAccount>(s.banks, 5).map(b => {
        if (b.ownerId !== ownerId || !/^\d{4}$/.test(b.last4))
            throw new Error('Invalid bank metadata.');
        return { id: required(b.id, 'bank ID'), ownerId, bank: required(b.bank, 'bank name'), name: required(b.name, 'account holder'), last4: b.last4 };
    });
    s.blocked = list<string>(s.blocked, 100).map(n => required(n, 'blocked account'));
    if (new Set(s.addresses.map(a => a.id)).size !== s.addresses.length || s.addresses.filter(a => a.isDefault).length > 1 || new Set(s.banks.map(b => b.id)).size !== s.banks.length)
        throw new Error('Duplicate saved record.');
    if (s.deletionRequest) {
        if (s.deletionRequest.ownerId !== ownerId)
            throw new Error('Deletion request ownership mismatch.');
        required(s.deletionRequest.id, 'request ID');
        text(s.deletionRequest.reason, 500);
    }
    return s;
}
export function AccountProvider({ children }: {
    children: ReactNode;
}) {
    const { user, store } = useAuth();
    const ownerId = user?.id ?? 'demo-buyer';
    const initial = (): Snapshot => ({ ownerId, profile: { displayName: user?.profile?.displayName || user?.name || 'Solomon', username: user?.profile?.username || 'solomon', bio: user?.profile?.bio || '', phone: user?.phone || '', city: user?.city || 'Warri', state: user?.state || 'Delta', storeName: store?.name || 'Gleenc Seller', storeDescription: store?.description || '' }, preferences: { ...defaults }, addresses: [], banks: [], blocked: [] });
    const [state, setState] = useState<Snapshot>(initial);
    const ref = useRef(state);
    const session = useRef(ownerId);
    const writes = useRef(Promise.resolve());
    const [ready, setReady] = useState(false);
    const [notice, setNotice] = useState('');
    useEffect(() => {
        let alive = true;
        session.current = ownerId;
        ref.current = initial();
        setState(ref.current);
        setReady(false);
        setNotice('');
        if (!localStorage) {
            setReady(true);
            return () => {
                alive = false;
            };
        }
        localStorage.getItem('gleenc:account:v12:' + ownerId).then(raw => {
            if (alive && raw) {
                ref.current = restoreAccount(raw, ownerId);
                setState(ref.current);
            }
        }).catch(() => {
            if (alive)
                setNotice('Saved account details could not be loaded.');
        }).finally(() => {
            if (alive)
                setReady(true);
        });
        return () => {
            alive = false;
        };
    }, [ownerId]);
    const commit = (next: Snapshot) => {
        if (!ready || session.current !== ownerId || (!user && !FRONTEND_PREVIEW))
            throw new Error('Your account is unavailable. Reopen this page.');
        const clean = restoreAccount(JSON.stringify(next), ownerId);
        ref.current = clean;
        setState(clean);
        const key = 'gleenc:account:v12:' + ownerId;
        writes.current = writes.current.catch(() => {
        }).then(async () => {
            if (localStorage)
                await localStorage.setItem(key, JSON.stringify(clean));
        }).catch(() => {
            if (session.current === ownerId)
                setNotice('Changes could not be saved on this device.');
        });
    };
    const updateProfile = (profile: ProfileDetails) => commit({ ...ref.current, profile: validateProfile(profile) });
    const updatePreferences = (p: Partial<Preferences>) => commit({ ...ref.current, preferences: validatePreferences({ ...ref.current.preferences, ...p }) });
    const saveAddress: Value['saveAddress'] = a => {
        const previous = ref.current.addresses;
        if (a.id && !previous.some(p => p.id === a.id))
            throw new Error('Address unavailable.');
        if (!a.id && previous.length >= 20)
            throw new Error('Keep at most 20 addresses.');
        const address = validateAddress({ ...a, id: a.id ?? secureId('ADDRESS'), ownerId, isDefault: !previous.length || a.isDefault }, ownerId);
        const next = [address, ...previous.filter(p => p.id !== address.id).map(p => address.isDefault ? { ...p, isDefault: false } : p)];
        if (!next.some(p => p.isDefault))
            next[0].isDefault = true;
        commit({ ...ref.current, addresses: next });
    };
    const removeAddress = (id: string) => {
        const next = ref.current.addresses.filter(a => a.id !== id);
        if (next.length && !next.some(a => a.isDefault))
            next[0] = { ...next[0], isDefault: true };
        commit({ ...ref.current, addresses: next });
    };
    const saveBank = (bank: string, name: string, number: string) => {
        if (!/^\d{10}$/.test(number))
            throw new Error('Enter a 10-digit Nigerian account number.');
        if (ref.current.banks.length >= 5)
            throw new Error('Keep at most five bank accounts.');
        const b: BankAccount = { id: secureId('BANK'), ownerId, bank: required(bank, 'bank name', 80), name: required(name, 'account holder', 80), last4: number.slice(-4) };
        commit({ ...ref.current, banks: [...ref.current.banks, b] });
    };
    const removeBank = (id: string) => commit({ ...ref.current, banks: ref.current.banks.filter(b => b.id !== id) });
    const toggleBlock = (name: string) => {
        name = required(name, 'account name', 100);
        const key = name.trim().toLocaleLowerCase();
        commit({ ...ref.current, blocked: ref.current.blocked.some(n => n.trim().toLocaleLowerCase() === key) ? ref.current.blocked.filter(n => n.trim().toLocaleLowerCase() !== key) : [...ref.current.blocked, name] });
    };
    const requestDeletion = (confirmation: string, reason: string) => {
        if (confirmation !== ref.current.profile.username)
            throw new Error('Type your exact username to continue.');
        if (ref.current.deletionRequest)
            throw new Error('A request is already queued.');
        commit({ ...ref.current, deletionRequest: { id: secureId('DELETE'), ownerId, reason: text(reason, 500), at: Date.now() } });
    };
    const cancelDeletion = () => commit({ ...ref.current, deletionRequest: undefined });
    return <AccountContext.Provider value={{ ...state, requestDeletion, cancelDeletion, ready, notice, updateProfile, updatePreferences, saveAddress, removeAddress, saveBank, removeBank, toggleBlock, isBlocked: name => ref.current.blocked.some(n => n.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()) }}>{children}</AccountContext.Provider>;
}
export function useAccount() {
    const value = useContext(AccountContext);
    if (!value)
        throw new Error('AccountProvider is missing.');
    return value;
}
