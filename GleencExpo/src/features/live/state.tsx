import { usePushLifecycle } from './push';
import { onSessionInvalidated } from '@/services/api';
import { clearPrivateCache } from './media';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';
import { api } from '@/services/api';
import { FRONTEND_PREVIEW } from '@/config/preview';
import { getApiErrorMessage } from '@/services/api-client';
export type RecordData = Record<string, any>;
export const object = (v: unknown): RecordData => v && typeof v === 'object' && !Array.isArray(v) ? v as RecordData : {};
export const rows = (v: unknown): RecordData[] => Array.isArray(v) ? v.map(object) : [];
type LiveState = {
    account: RecordData | null;
    capabilities: RecordData;
    notice: string;
    loading: boolean;
    version: number;
    counts: {
        notificationCount: number;
        messageCount: number;
    };
    reload: () => Promise<void>;
    changed: () => void;
    ensure: (verified?: boolean, terms?: boolean) => Promise<boolean>;
    perform: <T>(task: () => Promise<T>, options?: {
        verified?: boolean;
        terms?: boolean;
    }) => Promise<T | undefined>;
};
export const LiveContext = createContext<LiveState | null>(null);
export function LiveProvider({ children }: {
    children: ReactNode;
}) {
    usePushLifecycle();
    const { user, isLoading, refreshSession } = useAuth(), router = useRouter();
    const [account, setAccount] = useState<RecordData | null>(null), [capabilities, setCapabilities] = useState<RecordData>({}), [notice, setNotice] = useState(''), [loading, setLoading] = useState(false), [version, setVersion] = useState(0), [counts, setCounts] = useState({ notificationCount: 0, messageCount: 0 });
    useEffect(() => onSessionInvalidated(() => { void clearPrivateCache().catch(() => undefined); }), []);
    const owner = useRef(user?.id);
    owner.current = user?.id;
    const reload = useCallback(async () => {
        if (FRONTEND_PREVIEW)
            return;
        const id = user?.id;
        setLoading(true);
        try {
            const cap = await api.capabilities();
            if (owner.current !== id)
                return;
            setCapabilities(cap);
            if (id) {
                const data = await api.account.get();
                if (owner.current !== id)
                    return;
                setAccount(data);
                const counts = await api.activityCounts();
                if (owner.current !== id)
                    return;
                setCounts(counts);
            }
            else {
                setAccount(null);
                setCounts({ notificationCount: 0, messageCount: 0 });
            }
            setNotice('');
        }
        catch (e) {
            if (owner.current === id)
                setNotice(getApiErrorMessage(e));
        }
        finally {
            if (owner.current === id)
                setLoading(false);
        }
    }, [user?.id]);
    useEffect(() => { setAccount(null); setCounts({ notificationCount: 0, messageCount: 0 }); if (!isLoading)
        void reload(); }, [reload, isLoading]);
    useEffect(() => { if (FRONTEND_PREVIEW || !user)
        return; let active = true; const refresh = async () => { try {
        const next = await api.activityCounts();
        if (active)
            setCounts(next);
    }
    catch { } }; const timer = setInterval(() => { if (AppState.currentState === 'active')
        void refresh(); }, 10000); const sub = AppState.addEventListener('change', s => { if (s === 'active') {
        void reload();
        void api.account.presence().catch(() => undefined);
    } }); void api.account.presence().catch(() => undefined); return () => { active = false; clearInterval(timer); sub.remove(); }; }, [user?.id, reload]);
    const ensure = async (verified = true, terms = true) => {
        if (!user) {
            router.push('/login');
            return false;
        }
        if (verified && !user.emailVerified) {
            router.push('/verify-email');
            return false;
        }
        if (terms && capabilities.termsVersion && account?.termsVersion !== capabilities.termsVersion) {
            router.push('/community-guidelines');
            return false;
        }
        return true;
    };
    const perform = async <T,>(task: () => Promise<T>, options: {
        verified?: boolean;
        terms?: boolean;
    } = {}) => { if (!(await ensure(options.verified ?? true, options.terms ?? true)))
        return undefined; const id = owner.current; try {
        const result = await task();
        if (owner.current !== id)
            return undefined;
        setVersion(v => v + 1);
        void reload();
        return result;
    }
    catch (e) {
        Alert.alert('Could not complete this action', getApiErrorMessage(e));
        throw e;
    } };
    const changed = () => { setVersion(v => v + 1); void reload(); void refreshSession(); };
    return <LiveContext.Provider value={{ account: account && object(account.user).id === user?.id ? account : null, capabilities, notice, loading, version, counts, reload, changed, ensure, perform }}>{children}</LiveContext.Provider>;
}
export function useLive() { const value = useContext(LiveContext); if (!value)
    throw new Error('LiveProvider is missing.'); return value; }
/** Account-keyed queries discard stale requests and never substitute demonstration data. */
export function useServerQuery<T>(loader: () => Promise<T>, key: string, enabled = true) {
    const { user } = useAuth(), { version } = useLive();
    const load = useRef(loader);
    load.current = loader;
    const identity = `${user?.id ?? 'guest'}:${key}`, current = useRef(identity);
    current.current = identity;
    const [state, setState] = useState<{
        key: string;
        data: T | null;
        error: string;
        loading: boolean;
    }>({ key: identity, data: null, error: '', loading: enabled }), [retry, setRetry] = useState(0);
    useEffect(() => { let active = true; setState(previous => previous.key === identity ? { ...previous, error: '', loading: enabled && previous.data === null } : { key: identity, data: null, error: '', loading: enabled }); if (enabled)
        void load.current().then(data => { if (active && current.current === identity)
            setState({ key: identity, data, error: '', loading: false }); }).catch(e => { if (active && current.current === identity)
            setState(previous => ({ ...previous, error: getApiErrorMessage(e), loading: false })); }); return () => { active = false; }; }, [identity, version, enabled, retry]);
    return { ...(state.key === identity ? state : { key: identity, data: null, error: '', loading: enabled }), refresh: () => setRetry(v => v + 1) };
}
