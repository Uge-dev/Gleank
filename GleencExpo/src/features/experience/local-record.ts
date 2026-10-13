import { useEffect, useRef, useState } from 'react';
import { localStorage } from '@/features/commerce/session-storage';
import { clone } from '@/features/account/guards';
/** Bounded, account-scoped prototype records. Not an authorization or payment authority. */
export function useLocalRecord<T>(key: string, initial: () => T, validate: (value: unknown) => T, maxBytes = 2000000) {
    const [value, setValue] = useState<T>(initial);
    const current = useRef(value);
    const owner = useRef(key);
    const loaded = useRef(false);
    const writes = useRef(Promise.resolve());
    const [ready, setReady] = useState(false);
    const [notice, setNotice] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        let alive = true;
        owner.current = key;
        loaded.current = false;
        current.current = initial();
        setValue(current.current);
        setReady(false);
        setNotice('');
        const finish = () => {
            if (alive) {
                loaded.current = true;
                setReady(true);
            }
        };
        if (!localStorage) {
            finish();
            return () => {
                alive = false;
            };
        }
        localStorage.getItem(key).then(raw => {
            if (!alive || raw === null)
                return;
            if (raw.length > maxBytes)
                throw new Error('Local record exceeds its limit.');
            current.current = validate(JSON.parse(raw));
            setValue(current.current);
        }).catch(() => {
            if (alive)
                setNotice('Saved records could not be loaded. Retry before making changes.');
        })
            .finally(finish);
        return () => {
            alive = false;
            loaded.current = false;
        };
    }, [key, revision]);
    function commit(update: T | ((previous: T) => T)) {
        if (!loaded.current || owner.current !== key)
            throw new Error('Your account records are loading. Reopen this action.');
        if (notice)
            throw new Error('Resolve the saved-record error before making changes.');
        const candidate = typeof update === 'function' ? (update as (previous: T) => T)(clone(current.current)) : update;
        const next = validate(clone(candidate));
        const raw = JSON.stringify(next);
        if (raw.length > maxBytes)
            throw new Error('The local record limit was reached.');
        current.current = next;
        setValue(next);
        writes.current = writes.current.catch(() => {
        }).then(async () => {
            if (localStorage)
                await localStorage.setItem(key, raw);
        })
            .catch(() => {
            if (owner.current === key)
                setNotice('Changes could not be saved. Keep this app open and retry saving.');
        });
        return next;
    }
    async function retrySave() {
        if (owner.current !== key)
            return;
        if (notice.includes('loaded')) {
            setRevision(v => v + 1);
            return;
        }
        await writes.current;
        try {
            if (localStorage)
                await localStorage.setItem(key, JSON.stringify(current.current));
            setNotice('');
        }
        catch {
            setNotice('Changes could not be saved. Try again.');
        }
    }
    return { value, current, ready, notice, persistent: !!localStorage, commit, retrySave, reload: () => setRevision(v => v + 1) };
}
