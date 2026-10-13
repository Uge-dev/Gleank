import { useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Page, Card, Heading, Button, Input, Row, Notice, Chips, Toggle } from '@/features/studio/ui';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'expo-router';
import { getApiErrorMessage } from '@/services/api-client';
export { Page, Card, Heading, Button, Input, Row, Notice, Chips, Toggle, GText };
export function Action({ title, run, secondary = false, disabled = false }: {
    title: string;
    run: () => Promise<unknown>;
    secondary?: boolean;
    disabled?: boolean;
}) {
    const lock = useRef(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    async function submit() { if (lock.current)
        return; lock.current = true; setBusy(true); setError(''); try {
        await run();
    }
    catch (e) {
        setError(getApiErrorMessage(e));
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    return <View style={{ gap: 6 }}><Button title={busy ? 'Please wait…' : title} disabled={busy || disabled} secondary={secondary} onPress={() => void submit()}/><Notice text={error}/></View>;
}
export function QueryState({ query, empty = 'Nothing here yet', children }: {
    query: {
        loading: boolean;
        error: string;
        data: unknown;
        refresh: () => void;
    };
    empty?: string;
    children: ReactNode;
}) {
    const { colors } = useAppTheme();
    if (query.loading)
        return <ActivityIndicator style={{ padding: 24 }} color={colors.text}/>;
    if (query.error && query.data !== null)
        return <><Notice text={query.error}/><Button secondary title="Try again" onPress={query.refresh}/>{children}</>;
    if (query.error)
        return <Card><Notice text={query.error}/><Button secondary title="Try again" onPress={query.refresh}/></Card>;
    if (query.data === null)
        return <GText tone="muted">{empty}</GText>;
    return <>{children}</>;
}
export function Member({ children }: {
    children: ReactNode;
}) { const { user, isLoading } = useAuth(), router = useRouter(); if (isLoading)
    return <ActivityIndicator />; return user ? <>{children}</> : <Card><Heading>Sign in to continue</Heading><GText>Keep your purchases, messages and selling activity together.</GText><Button title="Sign in" onPress={() => router.push('/login')}/></Card>; }
export function Avatar({ uri, name, size = 44 }: {
    uri?: string | null;
    name: string;
    size?: number;
}) { const { colors } = useAppTheme(); return uri ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }}/> : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person-outline" size={size / 2} color={colors.text}/></View>; }
export function Money({ amount }: {
    amount: unknown;
}) { const n = typeof amount === 'number' ? amount : 0; return <GText weight="bold">{new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(n / 100)}</GText>; }
export function naira(value: string) { if (!/^\d{1,8}(\.\d{1,2})?$/.test(value.trim()))
    throw new Error('Enter a valid amount, with up to two decimal places.'); const result = Math.round(Number(value) * 100); if (!Number.isSafeInteger(result) || result > 1000000000)
    throw new Error('The amount is outside the supported limit.'); return result; }
