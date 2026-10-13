import { validateFile } from '@/features/digital/files';
import { text, uri, integer, money } from '@/features/marketplace/domain';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import type { ProductDraft } from './model';
import { FRONTEND_PREVIEW, PREVIEW_ACCOUNT_ID } from '@/config/preview';
type Store = {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
};
let storage: Store | null = null;
try {
    storage = require('@react-native-async-storage/async-storage').default as Store;
}
catch {
}
type DraftValue = {
    drafts: ProductDraft[];
    loading: boolean;
    storageAvailable: boolean;
    save: (draft: ProductDraft) => Promise<void>;
    remove: (id: string) => Promise<void>;
};
const Context = createContext<DraftValue | null>(null);
export function DraftProvider({ children }: {
    children: ReactNode;
}) {
    const { user } = useAuth();
    const ownerId = user?.id ?? (FRONTEND_PREVIEW ? PREVIEW_ACCOUNT_ID : '');
    const activeOwner = useRef(ownerId);
    const [drafts, setDrafts] = useState<ProductDraft[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        let active = true;
        activeOwner.current = ownerId;
        const nativeStorage = storage;
        setDrafts([]);
        setLoading(true);
        if (!ownerId || !nativeStorage) {
            setLoading(false);
            return () => {
                active = false;
            };
        }
        nativeStorage.getItem(`gleenc:create:${ownerId}`).then(value => {
            if (active) {
                if (value && value.length > 2000000)
                    throw new Error('Saved drafts are too large.');
                const parsed: unknown = value ? JSON.parse(value) : [];
                if (!Array.isArray(parsed) || parsed.length > 200)
                    throw new Error('Invalid saved drafts.');
                const next: ProductDraft[] = [];
                for (const item of parsed) {
                    try {
                        validateLocalDraft(item);
                        if (item.ownerId === ownerId)
                            next.push(item);
                    }
                    catch {
                    }
                }
                setDrafts(next);
            }
        }).catch(() => {
            if (active)
                setDrafts([]);
        }).finally(() => {
            if (active)
                setLoading(false);
        });
        return () => {
            active = false;
        };
    }, [ownerId]);
    async function persist(next: ProductDraft[]) {
        if (!ownerId)
            throw new Error('Sign in to save drafts.');
        if (JSON.stringify(next).length > 2000000 || next.length > 200)
            throw new Error('The local draft limit was reached.');
        if (storage)
            await storage.setItem(`gleenc:create:${ownerId}`, JSON.stringify(next));
        if (activeOwner.current !== ownerId)
            throw new Error('Account changed while saving.');
        setDrafts(next);
    }
    const value = useMemo<DraftValue>(() => ({
        drafts, loading, storageAvailable: Boolean(storage),
        save: async (item) => {
            if (loading)
                throw new Error('Your drafts are still loading. Please try again.');
            if (item.ownerId !== ownerId)
                throw new Error('Sign in to the account that owns this draft.');
            validateLocalDraft(item);
            const updated = { ...item, updatedAt: Date.now() };
            await persist([updated, ...drafts.filter(d => d.id !== updated.id)]);
        },
        remove: async (id) => {
            if (loading)
                throw new Error('Your drafts are still loading.');
            await persist(drafts.filter(d => d.id !== id));
        },
    }), [drafts, loading, ownerId]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDrafts() {
    const value = useContext(Context);
    if (!value)
        throw new Error('useDrafts requires DraftProvider');
    return value;
}
/** Drafts are editable local content, not authenticated seller records. */
function validateLocalDraft(item: ProductDraft) {
    for (const field of [item.id, item.ownerId, item.name, item.shortDescription, item.description, item.basePrice, item.baseStock, item.categoryId, item.subcategory])
        text(field, 5000);
    if (!Array.isArray(item.images) || item.images.length > 12 || !Array.isArray(item.variants) || item.variants.length > 60 || !Array.isArray(item.options) || item.options.length > 3)
        throw new Error('Invalid draft size.');
    if (item.scheduledAt !== undefined)
        integer(item.scheduledAt, 1, Number.MAX_SAFE_INTEGER, 'scheduled time');
    if (item.digitalFiles) {
        if (item.digitalFiles.length > 5)
            throw new Error('Too many digital files.');
        for (const file of item.digitalFiles) {
            validateFile(file);
            uri(file.uri);
            if (file.ownerId !== item.ownerId)
                throw new Error('File ownership mismatch.');
        }
    }
    for (const image of item.images) {
        uri(image.uri);
        text(image.id);
        text(image.color, 60);
    }
    if (item.videoUri)
        uri(item.videoUri);
    if (item.orderingPlan) {
        const p = item.orderingPlan;
        text(p.unit, 60);
        money(p.baseKobo);
        money(p.packagingKobo);
        integer(p.stock, 0, 1000, 'stock');
        if (!Array.isArray(p.components) || p.components.length > 60 || !Array.isArray(p.groups) || p.groups.length > 20)
            throw new Error('Invalid draft menu.');
        for (const c of p.components) {
            text(c.id);
            text(c.name);
            text(c.group, 60);
            text(c.unit, 60);
            money(c.priceKobo);
            integer(c.stock, 0, 1000, 'stock');
            uri(c.image ?? '');
        }
    }
}
