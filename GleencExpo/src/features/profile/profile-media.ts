import { useEffect, useRef, useState } from 'react';
import { uri } from '@/features/marketplace/domain';
type Media = {
    avatar?: string;
    cover?: string;
};
let storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
} | undefined;
try {
    storage = require('@react-native-async-storage/async-storage').default;
}
catch {
}
const watchers = new Set<(owner: string, media: Media) => void>();
const versions = new Map<string, number>();
export function useProfileMedia(owner: string) {
    const [media, setMedia] = useState<Media>({});
    const [ready, setReady] = useState(false);
    const [notice, setNotice] = useState('');
    const currentOwner = useRef(owner);
    currentOwner.current = owner;
    const snapshot = useRef<Media>({});
    const writes = useRef(Promise.resolve());
    useEffect(() => {
        let active = true;
        const version = versions.get(owner) ?? 0;
        const receive = (changedOwner: string, next: Media) => {
            if (active && changedOwner === owner) {
                snapshot.current = next;
                setMedia(next);
            }
        };
        watchers.add(receive);
        snapshot.current = {};
        setMedia({});
        setReady(false);
        setNotice('');
        const load = async () => {
            if (!owner || !storage)
                return;
            const raw = await storage.getItem('gleenc:profile-media:v1:' + owner);
            if (!raw)
                return;
            if (raw.length > 5000)
                throw new Error('Invalid saved profile images.');
            const parsed: Media = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object')
                throw new Error('Invalid saved profile images.');
            for (const value of [parsed.avatar, parsed.cover])
                if (value !== undefined)
                    uri(value);
            if (active && (versions.get(owner) ?? 0) === version) {
                snapshot.current = parsed;
                setMedia(parsed);
            }
        };
        void load().catch(() => {
            if (active)
                setNotice('Saved profile images could not be loaded. Choose them again.');
        }).finally(() => {
            if (active)
                setReady(true);
        });
        return () => {
            active = false;
            watchers.delete(receive);
        };
    }, [owner]);
    async function update(kind: keyof Media, value?: string) {
        if (!owner || currentOwner.current !== owner || !ready)
            throw new Error('Your profile is still loading or the account changed.');
        if (value)
            uri(value);
        const next = { ...snapshot.current, [kind]: value };
        const save = writes.current.catch(() => {
        }).then(async () => {
            if (storage)
                await storage.setItem('gleenc:profile-media:v1:' + owner, JSON.stringify(next));
        });
        writes.current = save;
        await save;
        if (currentOwner.current !== owner)
            throw new Error('The account changed while saving.');
        snapshot.current = next;
        setMedia(next);
        versions.set(owner, (versions.get(owner) ?? 0) + 1);
        watchers.forEach(watch => watch(owner, next));
    }
    return { media, ready, notice, update, persistent: !!storage };
}
