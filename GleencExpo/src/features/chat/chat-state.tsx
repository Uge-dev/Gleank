import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAccount } from '@/features/account/account-state';
import { useCommunity } from '@/features/community/community-state';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { useLocalRecord } from '@/features/experience/local-record';
import { required, list, secureId, timestamp } from '@/features/account/guards';
import { uri, text as validText, integer, money } from '@/features/marketplace/domain';
import { contentText } from '@/features/community/domain';
import { FRONTEND_PREVIEW } from '@/config/preview';
import type { FeedItem } from '@/features/feed/data';
export type Attachment = {
    kind: 'image' | 'video' | 'document' | 'voice';
    uri: string;
    name: string;
    mime: string;
    bytes: number;
    durationMs?: number;
};
export type ChatMessage = {
    id: string;
    text: string;
    createdAt: number;
    sender: 'me' | 'seller';
    product?: {
        id: string;
        name: string;
        image: string;
        priceKobo: number;
        store: string;
    };
    offerId?: string;
    imageUri?: string;
    attachment?: Attachment;
    replyTo?: string;
    status?: 'sent' | 'delivered' | 'read';
    editedAt?: number;
    deleted?: boolean;
    reactions?: {
        emoji: string;
        ownerId: string;
    }[];
};
export type Conversation = {
    seller: string;
    messages: ChatMessage[];
    createdAt: number;
    unread: number;
    pinned: boolean;
    online: boolean;
    avatarUrl?: string;
    muted?: boolean;
    archived?: boolean;
};
export const REACTIONS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
export const sellerAvatar = (seller: string) => `https://i.pravatar.cc/160?u=${encodeURIComponent(seller || 'gleenc')}`;
const types: Record<string, string[]> = { image: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'], video: ['video/mp4', 'video/quicktime'], voice: ['audio/mp4', 'audio/m4a', 'audio/aac', 'audio/mpeg'], document: ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'] };
export function validateAttachment(a: Attachment) {
    if (!a || !types[a.kind]?.includes(a.mime))
        throw new Error('This attachment type is not supported.');
    required(a.uri, 'an attachment');
    uri(a.uri);
    required(a.name, 'a file name', 140);
    if (/[\\/\u0000]/.test(a.name))
        throw new Error('Invalid file name.');
    integer(a.bytes, 1, (a.kind === 'video' ? 50 : 15) * 1024 * 1024, 'attachment size');
    if (a.kind === 'voice')
        integer(a.durationMs ?? 0, 1, 120000, 'voice duration');
    const ext = a.name.split('.').pop()?.toLowerCase();
    const exact: Record<string, string[]> = { jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'], webp: ['image/webp'], heic: ['image/heic'], heif: ['image/heif'], mp4: ['video/mp4', 'audio/mp4'], mov: ['video/quicktime'], m4a: ['audio/mp4', 'audio/m4a'], aac: ['audio/aac'], mp3: ['audio/mpeg'], pdf: ['application/pdf'], txt: ['text/plain'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'] };
    if (!ext || !exact[ext]?.includes(a.mime))
        throw new Error('The file name and MIME type do not match.');
    const allowed: Record<string, string[]> = { image: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'], video: ['mp4', 'mov'], voice: ['m4a', 'mp4', 'aac', 'mp3'], document: ['pdf', 'txt', 'docx', 'xlsx', 'pptx'] };
    if (!ext || !allowed[a.kind].includes(ext))
        throw new Error('The file extension does not match this attachment.');
    return a;
}
type ChatRecord = {
    ownerId: string;
    conversations: Conversation[];
    quoteReads: Record<string, number>;
};
export function restoreChat(v: unknown, ownerId: string): ChatRecord {
    const s = v as ChatRecord;
    if (!s || s.ownerId !== ownerId)
        throw new Error('Chat record ownership mismatch.');
    const names = new Set<string>(), ids = new Set<string>();
    for (const c of list<Conversation>(s.conversations, 100)) {
        required(c.seller, 'a recipient', 100);
        if (names.has(c.seller))
            throw new Error('Duplicate conversation.');
        names.add(c.seller);
        timestamp(c.createdAt);
        integer(c.unread, 0, 10000, 'unread count');
        for (const flag of [c.pinned, c.online, c.muted ?? false, c.archived ?? false])
            if (typeof flag !== 'boolean')
                throw new Error('Invalid conversation flags.');
        if (c.avatarUrl)
            uri(c.avatarUrl);
        for (const m of list<ChatMessage>(c.messages, 500)) {
            if (ids.has(m.id))
                throw new Error('Duplicate message.');
            ids.add(required(m.id, 'a message id'));
            validText(m.text, 4000);
            timestamp(m.createdAt);
            if (!['me', 'seller'].includes(m.sender) || m.status && !['sent', 'delivered', 'read'].includes(m.status))
                throw new Error('Invalid message state.');
            if (m.attachment)
                validateAttachment(m.attachment);
            if (m.imageUri)
                uri(m.imageUri);
            if (m.replyTo)
                validText(m.replyTo, 4000);
            if (m.editedAt)
                timestamp(m.editedAt);
            if (m.product) {
                required(m.product.id, 'a product');
                required(m.product.name, 'a product name');
                uri(m.product.image);
                money(m.product.priceKobo);
                required(m.product.store, 'a seller', 100);
            }
            if (m.offerId)
                required(m.offerId, 'an offer');
            const owners = new Set<string>();
            for (const r of list<{
                emoji: string;
                ownerId: string;
            }>(m.reactions ?? [], 100)) {
                if (!REACTIONS.includes(r.emoji) || owners.has(r.ownerId))
                    throw new Error('Invalid reaction.');
                owners.add(required(r.ownerId, 'an account'));
            }
        }
    }
    if (!s.quoteReads || typeof s.quoteReads !== 'object' || Object.keys(s.quoteReads).length > 100)
        throw new Error('Invalid message read state.');
    Object.entries(s.quoteReads).forEach(([name, at]) => {
        required(name, 'a recipient', 100);
        timestamp(at);
    });
    return s;
}
const now = Date.now();
const ago = (minutes: number) => now - minutes * 60000;
const samples = (): Conversation[] => [
    { seller: 'Movers', createdAt: ago(180), unread: 2, pinned: true, online: true, avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&h=160&fit=crop&crop=faces', messages: [
            { id: 'm-1', sender: 'me', text: 'Hi! Is the Belleful noodles combo available today?', createdAt: ago(180), status: 'read' },
            { id: 'm-2', sender: 'seller', text: 'Yes, it is! We can prepare it fresh and have it ready for pickup in 25 minutes.', createdAt: ago(176) },
            { id: 'm-3', sender: 'seller', text: 'Would you like extra chicken?', createdAt: ago(15) },
        ] },
    { seller: 'Campus Wears', createdAt: ago(1440), unread: 1, pinned: false, online: false, avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&h=160&fit=crop&crop=faces', messages: [
            { id: 'c-1', sender: 'seller', text: 'Welcome to Campus Wears 👋 The sneakers come in sizes 39–45.', createdAt: ago(1440) },
            { id: 'c-2', sender: 'me', text: 'Great! Do you have size 43 in red?', createdAt: ago(1420), status: 'read' },
            { id: 'c-3', sender: 'seller', text: 'Yes, I do. I can send more photos if you want.', createdAt: ago(70) },
        ] },
    { seller: 'Snack Spot', createdAt: ago(3000), unread: 0, pinned: false, online: true, avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=160&h=160&fit=crop&crop=faces', messages: [
            { id: 's-1', sender: 'seller', text: 'Thanks for your interest! Our shawarma is made to order.', createdAt: ago(3000) },
        ] },
];
const Context = createContext<ReturnType<typeof useChatValue> | null>(null);
function useChatValue() {
    const { user } = useAuth();
    const ownerId = user?.id ?? 'demo-buyer';
    const account = useAccount();
    const social = useCommunity();
    const { quotes, buyerId } = useMarketplace();
    const store = useLocalRecord('gleenc:chat:v13:' + ownerId, () => ({ ownerId, conversations: FRONTEND_PREVIEW ? samples() : [], quoteReads: {} } as ChatRecord), v => restoreChat(v, ownerId));
    function canContact(seller: string) {
        seller = required(seller, 'the recipient', 100);
        if (account.isBlocked(seller))
            throw new Error('Unblock this account before messaging.');
        if (!FRONTEND_PREVIEW)
            throw new Error('Messages require the connected messaging service.');
        return seller;
    }
    function newConversation(seller: string): Conversation {
        return { seller, createdAt: Date.now(), unread: 0, pinned: false, online: false, avatarUrl: sellerAvatar(seller), messages: [] };
    }
    function startConversation(seller: string) {
        seller = canContact(seller);
        if (store.current.current.conversations.some(c => c.seller === seller))
            return;
        store.commit(s => ({ ...s, conversations: [newConversation(seller), ...s.conversations] }));
    }
    function append(seller: string, message: ChatMessage) {
        seller = canContact(seller);
        social.assertPosting();
        store.commit(s => {
            const base = s.conversations.find(c => c.seller === seller) ?? newConversation(seller);
            if (base.messages.length >= 500)
                throw new Error('This local conversation is full. Clear older messages to continue.');
            const next = { ...base, archived: false, messages: [...base.messages, message] };
            return { ...s, conversations: [next, ...s.conversations.filter(c => c.seller !== seller)] };
        });
    }
    function sendMessage(seller: string, text: string, imageUri?: string, replyTo?: string) {
        validText(text, 4000);
        if (!text.trim() && !imageUri)
            return;
        if (text.trim())
            contentText(text);
        if (imageUri)
            uri(imageUri);
        if (replyTo)
            validText(replyTo, 4000);
        append(seller, { id: secureId('MSG'), text: text.trim(), imageUri, replyTo, createdAt: Date.now(), sender: 'me', status: 'sent' });
    }
    function sendAttachment(seller: string, attachment: Attachment, caption = '', replyTo?: string) {
        validateAttachment(attachment);
        validText(caption, 2000);
        if (caption.trim())
            contentText(caption);
        append(seller, { id: secureId('MSG'), text: caption.trim(), attachment, replyTo, createdAt: Date.now(), sender: 'me', status: 'sent' });
    }
    function shareProduct(seller: string, item: FeedItem, note: string) {
        required(item.id, 'a product id');
        money(item.priceKobo);
        validText(note, 2000);
        uri(item.image);
        append(seller, { id: secureId('FWD'), text: note.trim(), sender: 'me', createdAt: Date.now(), status: 'sent', product: { id: item.config?.postId ?? item.id, name: item.name, image: item.image, priceKobo: item.priceKobo, store: item.store } });
    }
    function shareProducts(recipients: string[], item: FeedItem, note: string) {
        social.assertPosting();
        list<string>(recipients, 20);
        if (!recipients.length || new Set(recipients).size !== recipients.length)
            throw new Error('Select valid recipients.');
        recipients.forEach(canContact);
        validText(note, 2000);
        required(item.id, 'a product id');
        required(item.name, 'a product name');
        uri(item.image);
        money(item.priceKobo);
        const messages = recipients.map(seller => ({ seller, message: { id: secureId('FWD'), text: note.trim(), sender: 'me' as const, createdAt: Date.now(), status: 'sent' as const, product: { id: item.config?.postId ?? item.id, name: item.name, image: item.image, priceKobo: item.priceKobo, store: item.store } } }));
        store.commit(s => {
            let conversations = [...s.conversations];
            for (const { seller, message } of messages) {
                const base = conversations.find(c => c.seller === seller) ?? newConversation(seller);
                if (base.messages.length >= 500)
                    throw new Error('One conversation is full. Clear it before forwarding.');
                conversations = [{ ...base, archived: false, messages: [...base.messages, message] }, ...conversations.filter(c => c.seller !== seller)];
            }
            return { ...s, conversations };
        });
    }
    function updateConversation(seller: string, fn: (c: Conversation) => Conversation) {
        store.commit(s => ({ ...s, conversations: s.conversations.map(c => c.seller === seller ? fn(c) : c) }));
    }
    function editMessage(seller: string, id: string, text: string) {
        canContact(seller);
        social.assertPosting();
        text = contentText(text);
        updateConversation(seller, c => ({ ...c, messages: c.messages.map(m => {
                if (m.id !== id)
                    return m;
                if (m.sender !== 'me' || m.deleted || m.product || m.offerId || Date.now() - m.createdAt > 15 * 60000)
                    throw new Error('Only your own recent messages can be edited (15 minutes).');
                return { ...m, text, editedAt: Date.now() };
            }) }));
    }
    function deleteMessage(seller: string, id: string, everyone: boolean) {
        updateConversation(seller, c => ({ ...c, messages: everyone ? c.messages.map(m => {
                if (m.id !== id)
                    return m;
                if (m.sender !== 'me')
                    throw new Error('Only your own messages can be removed for everyone.');
                return { id: m.id, text: 'Message deleted', createdAt: m.createdAt, sender: m.sender, deleted: true, reactions: [] };
            }) : c.messages.filter(m => m.id !== id) }));
    }
    function react(seller: string, id: string, emoji: string) {
        canContact(seller);
        social.assertPosting();
        if (!REACTIONS.includes(emoji))
            throw new Error('Choose a supported reaction.');
        updateConversation(seller, c => ({ ...c, messages: c.messages.map(m => {
                if (m.id !== id || m.deleted)
                    return m;
                const previous = m.reactions?.find(r => r.ownerId === ownerId);
                return { ...m, reactions: [...(m.reactions ?? []).filter(r => r.ownerId !== ownerId), ...(previous?.emoji === emoji ? [] : [{ emoji, ownerId }])] };
            }) }));
    }
    function markRead(seller: string) {
        if (!store.ready)
            return;
        store.commit(s => ({ ...s, quoteReads: { ...s.quoteReads, [seller]: Date.now() }, conversations: s.conversations.map(c => c.seller === seller ? { ...c, unread: 0 } : c) }));
    }
    const togglePin = (seller: string) => updateConversation(seller, c => ({ ...c, pinned: !c.pinned }));
    const toggleMute = (seller: string) => updateConversation(seller, c => ({ ...c, muted: !c.muted }));
    const toggleArchive = (seller: string) => updateConversation(seller, c => ({ ...c, archived: !c.archived }));
    const clearConversation = (seller: string) => updateConversation(seller, c => ({ ...c, messages: [], unread: 0 }));
    const names = [...new Set([...store.value.conversations.map(c => c.seller), ...quotes.filter(q => q.buyerId === buyerId || q.sellerId === buyerId).map(q => q.item.store)])];
    const conversations = names.map(name => {
        const base = store.value.conversations.find(c => c.seller === name) ?? newConversation(name);
        const own = quotes.filter(q => q.item.store === name && (q.buyerId === buyerId || q.sellerId === buyerId));
        const messages: ChatMessage[] = own.map(q => ({ id: q.id + ':' + q.updatedAt, offerId: q.id, text: 'Price offer · ' + q.item.name + ' · ' + q.state, createdAt: q.updatedAt, sender: q.updatedBy === buyerId || q.state === 'pending' ? 'me' : 'seller' }));
        return { ...base, unread: base.unread + own.filter(q => q.updatedBy !== buyerId && q.state !== 'pending' && q.updatedAt > (store.value.quoteReads[name] ?? 0)).length, messages: [...base.messages, ...messages].sort((a, b) => a.createdAt - b.createdAt) };
    }).filter(c => !account.isBlocked(c.seller));
    return { ...store, conversations, startConversation, sendMessage, sendAttachment, shareProduct, shareProducts, markRead, togglePin, toggleMute, toggleArchive, clearConversation, editMessage, deleteMessage, react };
}
export function ChatProvider({ children }: {
    children: ReactNode;
}) {
    return <Context.Provider value={useChatValue()}>{children}</Context.Provider>;
}
export function useChat() {
    const v = useContext(Context);
    if (!v)
        throw new Error('ChatProvider is missing.');
    return v;
}
