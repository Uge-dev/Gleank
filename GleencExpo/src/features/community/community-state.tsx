import { useProfileMedia } from '@/features/profile/profile-media';
import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAccount } from '@/features/account/account-state';
import { secureId, required } from '@/features/account/guards';
import { FEED } from '@/features/feed/data';
import { PREVIEW_ACCOUNT_ID, FRONTEND_PREVIEW } from '@/config/preview';
import { useLocalRecord } from '@/features/experience/local-record';
import { COMMUNITY_VERSION, REPORT_REASONS, restoreCommunity, contentText, type Person, type Comment, type Report, type Activity, type CommunityRecord } from './domain';
const avatar = (name: string) => 'https://i.pravatar.cc/160?u=' + encodeURIComponent(name);
const Context = createContext<ReturnType<typeof useCommunityValue> | null>(null);
function useCommunityValue() {
    const { user } = useAuth();
    const account = useAccount();
    const ownerId = user?.id ?? 'demo-buyer';
    const photos = useProfileMedia(user?.id ?? (FRONTEND_PREVIEW ? PREVIEW_ACCOUNT_ID : ''));
    const record = useLocalRecord('gleenc:community:v13:' + ownerId, () => ({ ownerId, comments: [], following: [], reports: [], activity: [] } as CommunityRecord), v => restoreCommunity(v, ownerId));
    const session = useRef('');
    const posting = useRef(0);
    const me: Person = { id: ownerId, name: account.profile.displayName, store: account.profile.storeName || account.profile.displayName, handle: account.profile.username, avatar: photos.media.avatar || user?.avatarUrl || avatar(ownerId), bio: account.profile.bio };
    const directory: Person[] = [me, ...[...new Set(FEED.map(p => p.store))].filter(n => n !== me.store).map(store => ({ id: 'seller:' + store, name: store, store, handle: store.toLowerCase().replace(/\W/g, ''), avatar: avatar(store), bio: 'Discover products and connect with ' + store }))];
    const accepted = record.value.consent?.version === COMMUNITY_VERSION;
    function assertPosting() {
        if (!FRONTEND_PREVIEW)
            throw new Error('Posting requires the connected community service.');
        if (!user && !FRONTEND_PREVIEW)
            throw new Error('Sign in to continue.');
        if (record.current.current.consent?.version !== COMMUNITY_VERSION)
            throw new Error('Accept the community rules before posting.');
    }
    function acceptTerms() {
        record.commit(s => ({ ...s, consent: { version: COMMUNITY_VERSION, at: Date.now() } }));
    }
    function addComment(postId: string, body: string, parentId?: string): Comment {
        assertPosting();
        required(postId, 'the post id');
        body = contentText(body);
        if (Date.now() - posting.current < 500)
            throw new Error('Please wait a moment before posting again.');
        const parent = parentId ? record.current.current.comments.find(c => c.id === parentId && c.postId === postId && !c.deleted && !c.parentId) : undefined;
        if (parentId && (!parent || account.isBlocked(parent.author.store)))
            throw new Error('This reply is unavailable.');
        const comment: Comment = { id: secureId('CMT'), postId, author: me, body, at: Date.now(), likes: [], ...(parentId ? { parentId } : {}) };
        record.commit(s => ({ ...s, comments: [...s.comments, comment] }));
        posting.current = Date.now();
        return comment;
    }
    function deleteComment(id: string) {
        record.commit(s => ({ ...s, comments: s.comments.map(c => {
                if (c.id !== id)
                    return c;
                if (c.author.id !== ownerId)
                    throw new Error('Only the author can delete a comment.');
                return { ...c, deleted: true, body: '', likes: [] };
            }) }));
    }
    function toggleCommentLike(id: string) {
        assertPosting();
        record.commit(s => ({ ...s, comments: s.comments.map(c => c.id === id && !c.deleted && !account.isBlocked(c.author.store) ? { ...c, likes: c.likes.includes(ownerId) ? c.likes.filter(x => x !== ownerId) : [...c.likes, ownerId] } : c) }));
    }
    function toggleFollow(store: string) {
        required(store, 'a profile', 100);
        if (store === me.store)
            throw new Error('You cannot follow yourself.');
        if (account.isBlocked(store))
            throw new Error('Unblock this account before following.');
        if (!FRONTEND_PREVIEW)
            throw new Error('Following requires the connected account service.');
        record.commit(s => ({ ...s, following: s.following.includes(store) ? s.following.filter(x => x !== store) : [...s.following, store] }));
    }
    function report(kind: Report['kind'], targetId: string, author: string, reason: string, detail: string) {
        if (!FRONTEND_PREVIEW)
            throw new Error('Reporting requires the connected moderation service. Contact support if you need help.');
        if (!REPORT_REASONS.includes(reason))
            throw new Error('Choose a report reason.');
        required(targetId, 'reported content');
        required(author, 'reported account', 100);
        const existing = record.current.current.reports.find(r => r.kind === kind && r.targetId === targetId);
        if (existing)
            return existing;
        const r: Report = { id: secureId('RPT'), ownerId, kind, targetId, author, reason, detail: detail.trim().slice(0, 1000), at: Date.now(), status: 'queued' };
        record.commit(s => ({ ...s, reports: [r, ...s.reports] }));
        return r;
    }
    function track(postId: string, kind: Activity['kind']) {
        if (!record.ready || record.notice)
            return;
        try {
            if (!session.current)
                session.current = secureId('SESSION');
            const previous = record.current.current.activity;
            if ((kind === 'view' || kind === 'open') && previous.some(a => a.postId === postId && a.kind === kind && a.session === session.current))
                return;
            record.commit(s => ({ ...s, activity: [...s.activity.slice(-2999), { id: secureId('EV'), postId, kind, at: Date.now(), session: session.current }] }));
        }
        catch {
        }
    }
    const following = record.value.following.filter(n => !account.isBlocked(n));
    const commentsFor = (id: string) => record.value.comments.filter(c => c.postId === id && !account.isBlocked(c.author.store)).map(c => c.author.id === ownerId ? { ...c, author: me } : c);
    // Seeded connections are local preview actors; production lists come from the service.
    const previewEdges = FRONTEND_PREVIEW ? directory.filter(p => p.id !== ownerId).slice(0, 3).flatMap((p, i) => [{ from: p, to: me }, { from: p, to: directory.filter(x => x.id !== ownerId)[(i + 1) % Math.max(1, directory.length - 1)] }]).filter(e => !!e.to) : [];
    const followersFor = (store: string) => [...(following.includes(store) ? [me] : []), ...previewEdges.filter(e => e.to.store === store).map(e => e.from)].filter((p, i, a) => a.findIndex(x => x.id === p.id) === i && !account.isBlocked(p.store));
    const followingFor = (store: string) => store === me.store ? following.map(store => directory.find(p => p.store === store) ?? { id: 'seller:' + store, name: store, store, handle: store.toLowerCase().replace(/\W/g, ''), avatar: avatar(store), bio: '' }) : previewEdges.filter(e => e.from.store === store).map(e => e.to).filter((p, i, a) => a.findIndex(x => x.id === p.id) === i && !account.isBlocked(p.store));
    return { ...record, me, directory, accepted, acceptTerms, assertPosting, addComment, deleteComment, toggleCommentLike, commentsFor, following, toggleFollow, followersFor, followingFor, report, track, reports: record.value.reports, activity: record.value.activity };
}
export function CommunityProvider({ children }: {
    children: ReactNode;
}) {
    return <Context.Provider value={useCommunityValue()}>{children}</Context.Provider>;
}
export function useCommunity() {
    const value = useContext(Context);
    if (!value)
        throw new Error('CommunityProvider is missing.');
    return value;
}
