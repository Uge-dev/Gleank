import { text, uri } from '@/features/marketplace/domain';
import { list, required, timestamp } from '@/features/account/guards';
export const COMMUNITY_VERSION = '2026-10-07';
export const REPORT_REASONS = ['Harassment or bullying', 'Hate or violence', 'Sexual content', 'Scam or counterfeit', 'Spam', 'Privacy violation', 'Other'];
export type Person = {
    id: string;
    name: string;
    store: string;
    handle: string;
    avatar: string;
    bio: string;
};
export type Comment = {
    id: string;
    postId: string;
    author: Person;
    body: string;
    at: number;
    parentId?: string;
    likes: string[];
    deleted?: boolean;
};
export type Report = {
    id: string;
    ownerId: string;
    kind: 'comment' | 'review' | 'message' | 'product' | 'account';
    targetId: string;
    author: string;
    reason: string;
    detail: string;
    at: number;
    status: 'queued';
};
export type Activity = {
    id: string;
    postId: string;
    kind: 'view' | 'open' | 'share' | 'reshare';
    at: number;
    session: string;
};
export type CommunityRecord = {
    ownerId: string;
    consent?: {
        version: string;
        at: number;
    };
    comments: Comment[];
    following: string[];
    reports: Report[];
    activity: Activity[];
};
export function validPerson(p: Person) {
    required(p.id, 'an account id', 200);
    required(p.name, 'a display name', 100);
    required(p.store, 'a profile name', 100);
    text(p.handle, 100);
    uri(p.avatar);
    text(p.bio, 500);
    return p;
}
export function restoreCommunity(value: unknown, ownerId: string): CommunityRecord {
    const s = value as CommunityRecord;
    if (!s || s.ownerId !== ownerId)
        throw new Error('Community record ownership mismatch.');
    if (s.consent) {
        required(s.consent.version, 'terms version', 30);
        timestamp(s.consent.at);
    }
    const ids = new Set<string>();
    for (const c of list<Comment>(s.comments, 1000)) {
        required(c.id, 'a comment id');
        if (ids.has(c.id))
            throw new Error('Duplicate comment.');
        ids.add(c.id);
        required(c.postId, 'a post id');
        validPerson(c.author);
        text(c.body, 2000);
        timestamp(c.at);
        list<string>(c.likes, 1000).forEach(x => required(x, 'a liker id'));
        if (new Set(c.likes).size !== c.likes.length || typeof c.deleted !== 'undefined' && typeof c.deleted !== 'boolean')
            throw new Error('Invalid comment state.');
        if (c.parentId)
            required(c.parentId, 'a reply id');
    }
    for (const c of s.comments.filter(c => c.parentId)) {
        const parent = s.comments.find(p => p.id === c.parentId);
        if (!parent || parent.parentId || parent.postId !== c.postId)
            throw new Error('Replies must reference a root in the same post.');
    }
    list<string>(s.following, 1000).forEach(x => required(x, 'a following profile', 100));
    if (new Set(s.following).size !== s.following.length)
        throw new Error('Duplicate following profile.');
    const reports = new Set<string>();
    for (const r of list<Report>(s.reports, 200)) {
        if (r.ownerId !== ownerId || !['comment', 'review', 'message', 'product', 'account'].includes(r.kind) || r.status !== 'queued' || !REPORT_REASONS.includes(r.reason) || reports.has(r.id))
            throw new Error('Invalid report.');
        reports.add(required(r.id, 'a report id'));
        required(r.targetId, 'reported content');
        required(r.author, 'reported account', 100);
        text(r.detail, 1000);
        timestamp(r.at);
    }
    for (const a of list<Activity>(s.activity, 3000)) {
        required(a.id, 'an activity id');
        required(a.postId, 'a post id');
        required(a.session, 'a session id');
        timestamp(a.at);
        if (!['view', 'open', 'share', 'reshare'].includes(a.kind))
            throw new Error('Invalid activity.');
    }
    return s;
}
export function contentText(value: string) {
    const clean = required(value, 'your message', 2000);
    // Client filtering improves UX only; the service must independently moderate UGC.
    if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(clean))
        throw new Error('Remove unsupported characters.');
    if (/\b(kill yourself|child sexual abuse)\b/i.test(clean))
        throw new Error('This content violates the community rules.');
    return clean;
}
