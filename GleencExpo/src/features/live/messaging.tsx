import { PrivateVoice } from './voice';
import { useEffect, useRef, useState } from 'react';
import { AppState, PanResponder, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/hooks/use-auth';
import { useAppTheme } from '@/hooks/use-app-theme';
import { api } from '@/services/api';
import { useLive, useServerQuery, rows, object } from './state';
import { Page, Card, Heading, Input, Row, Button, Chips, GText, Action, QueryState, Member, Avatar, Notice } from './ui';
import { pickUpload, pickDocument, uploadFile, saveBlob } from './media';
import { pendingKey } from './pending';
import { VoiceRecorder } from '@/features/chat/voice';
const iconFor: Record<string, any> = { like: 'heart', comment: 'chatbubble', follow: 'person-add', reshare: 'repeat', offer: 'pricetag', order: 'bag-check', payment: 'card', delivery: 'cube', message: 'chatbubbles', review: 'star', refund: 'arrow-undo', verification: 'shield-checkmark',sale:'bag-check',wallet:'wallet','delivery-confirmed':'checkmark-done-circle',issue:'alert-circle','issue-reply':'chatbubble-ellipses','offer-answer':'pricetag' };
const tintFor: Record<string, string> = { like: '#E54761', comment: '#4983CE', follow: '#8864CC', reshare: '#D1912D', offer: '#208B69', order: '#208B69', payment: '#367FC4', delivery: '#A56C37', review: '#D4A22E', refund: '#986AC2' };
export function AlertsPage() {
    const { user } = useAuth(), live = useLive(), router = useRouter(), [tab, setTab] = useState('Notifications'), [offset, setOffset] = useState(0), [showArchived, setShowArchived] = useState(false);
    const notices = useServerQuery(() => api.notifications.list({ limit: 50, offset }), 'notifications:' + offset, !!user), threads = useServerQuery(() => api.chat.list({ limit: 50, offset, archived: showArchived ? 'true' : 'false' }), 'threads:' + offset + showArchived, !!user);
    const swipe = useRef(PanResponder.create({ onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 30 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5, onPanResponderRelease: (_, g) => { if (g.dx < -40) {
            setTab('Messages');
            setOffset(0);
        }
        else if (g.dx > 40) {
            setTab('Notifications');
            setOffset(0);
        } } })).current;
    function openNotification(n:any){const data=object(n.data),kind=String(n.kind),legacy=String(n.actionPath||'');
      if(kind.startsWith('offer'))router.push({pathname:'/offer',params:{id:n.targetId}});
      else if(kind==='message')router.push({pathname:'/chat',params:{id:n.targetId,userId:n.actors?.[0]?.id||''}});
      else if(kind.startsWith('issue')||kind==='refund')router.push('/issues');
      else if(kind==='wallet')router.push('/wallet');
      else if(kind==='verification')router.push('/verification');
      else if(['order','sale','delivery','delivery-confirmed'].includes(kind))router.push({pathname:'/order-details',params:{id:data.orderId||n.targetId}});
      else if(kind==='payment')router.push('/payments');
      else if(['like','comment','reshare','review'].includes(kind))router.push({pathname:'/product',params:{productId:data.productId||n.targetId}});
      else if(kind==='follow'&&n.actors?.[0])router.push({pathname:'/store',params:{userId:n.actors[0].id}});
      else if(/^\/products\/[A-Za-z0-9_-]+$/.test(legacy))router.push({pathname:'/product',params:{productId:legacy.split('/').pop()!}});
      else router.push('/orders');
    }
    useEffect(() => { if (!user)
        return; const timer = setInterval(() => { if (AppState.currentState === 'active') {
        notices.refresh();
        threads.refresh();
    } }, 15000); return () => clearInterval(timer); }, [user?.id]);
    return <Page title="Your Activity"><Member><View {...swipe.panHandlers} style={{ gap: 14 }}><Chips items={['Notifications', 'Messages']} value={tab} onChange={value => { setTab(value); setOffset(0); }}/>
 {tab === 'Notifications' ? <><Action title="Mark all as read" secondary run={async () => { await live.perform(() => api.notifications.readAll(), { verified: false, terms: false }); notices.refresh(); }}/><QueryState query={notices}>{rows(notices.data?.notifications).map(n => <Pressable key={n.id} onPress={() => { void live.perform(() => api.notifications.read([n.id]), { verified: false, terms: false }).then(() => { notices.refresh(); openNotification(n); }).catch(() => undefined); }}><Card><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Ionicons name={iconFor[n.kind] || 'notifications'} size={25} color={tintFor[n.kind] || '#D1912D'}/><View style={{ flex: 1, gap: 7 }}><View style={{ flexDirection: 'row' }}>{rows(n.actors).slice(0, 3).map(p => <View key={p.id} style={{ marginRight: -8 }}><Avatar uri={p.avatarUrl} name={p.name} size={32}/></View>)}</View><GText weight={n.unread ? 'bold' : 'medium'}>{rows(n.actors).map(p => p.name).join(', ')}{n.othersCount > 0 ? ` and ${n.othersCount} others` : ''} {activityText(n)}</GText>{n.body ? <GText tone="muted">{n.body}</GText> : null}<GText tone="muted" style={{ fontSize: 11 }}>{new Date(n.updatedAt || n.createdAt).toLocaleString()}</GText></View>{n.unread ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#E54761' }}/> : null}</View></Card></Pressable>)}</QueryState></> : <><Button title={showArchived ? 'Show inbox' : 'Show archived conversations'} secondary onPress={() => { setShowArchived(v => !v); setOffset(0); }}/><QueryState query={threads}>{rows(threads.data).map(t => <Pressable key={t.id} onPress={() => router.push({ pathname: '/chat', params: { id: t.id, userId: t.participant.id } })}><Card><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Avatar uri={t.participant.avatarUrl} name={t.participant.name} size={52}/><View style={{ flex: 1, gap: 5 }}><Heading>{t.participant.name}</Heading><GText numberOfLines={1}>{t.lastMessage?.body || (t.lastMessage?.attachment ? 'Attachment' : 'Start a conversation')}</GText><GText tone="muted" style={{ fontSize: 11 }}>{t.online ? 'Online' : 'Offline'}</GText></View>{t.unreadCount > 0 ? <View style={{ backgroundColor: '#E54761', padding: 7, borderRadius: 20 }}><GText tone="white">{t.unreadCount}</GText></View> : null}</View></Card></Pressable>)}</QueryState></>}
 <Button title="More activity" secondary onPress={() => setOffset(v => v + 50)}/></View></Member></Page>;
}
export function ChatPage() {
    const { id, userId } = useLocalSearchParams<{
        id?: string;
        userId?: string;
    }>(), { user } = useAuth(), live = useLive(), router = useRouter(), { colors } = useAppTheme();
    const [conversationId, setConversationId] = useState(id || ''), [body, setBody] = useState(''), [voice, setVoice] = useState(false), [replyId, setReply] = useState<string>(), [notice, setNotice] = useState(''), [offset, setOffset] = useState(0), [editing, setEditing] = useState<string>(), [muted, setMuted] = useState(false), [archived, setArchived] = useState(false);
    const query = useServerQuery(() => api.chat.messages(conversationId, { limit: 50, offset }), 'messages:' + conversationId + offset, !!user && !!conversationId), person = useServerQuery(() => api.people.get(userId || ''), 'chat-person:' + userId, !!userId);
    useEffect(() => { if (!id && userId && user)
        void live.perform(() => api.chat.open(userId)).then(chat => { if (chat)
            setConversationId(chat.id); }).catch(() => undefined); }, [id, userId, user?.id]);
    useEffect(() => { if (!user || !conversationId)
        return; const timer = setInterval(() => { if (AppState.currentState === 'active')
        query.refresh(); }, 8000); return () => clearInterval(timer); }, [user?.id, conversationId]);
    useEffect(() => { const unread = rows(query.data?.messages).filter(m => m.sender?.id !== user?.id && m.status !== 'read').map(m => m.id); if (unread.length && AppState.currentState === 'active')
        void api.chat.ack(conversationId, unread, 'read').then(() => live.reload()).catch(() => undefined); }, [query.data]);
    async function changeMessage(messageId: string, input: object) { await live.perform(() => api.chat.messageAction(conversationId, messageId, input as any)); query.refresh(); }
    async function send(attachmentId?: string) { if (!user || !conversationId)
        return; if (!(await live.ensure()))
        return; if (editing && !attachmentId) {
        await changeMessage(editing, { action: 'edit', body: body.trim() });
        setEditing(undefined);
        setBody('');
        return;
    } const input = { ...(body.trim() ? { body: body.trim() } : {}), ...(attachmentId ? { attachmentId } : {}), ...(replyId ? { replyId } : {}) }; const pending = await pendingKey(user.id, 'message:' + conversationId, input); const result = await live.perform(() => api.chat.send(conversationId, input, pending.key)); if (result) {
        await pending.finish();
        setBody('');
        setReply(undefined);
        setOffset(0);
        query.refresh();
    } }
    return <Page title={person.data?.name || 'Conversation'}><Member><Card><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Avatar uri={person.data?.avatarUrl} name={person.data?.name || ''}/><View style={{ flex: 1 }}><Heading>{person.data?.name || 'Your conversation'}</Heading><GText tone="muted">Messages are private to this conversation.</GText></View></View><View style={{ flexDirection: 'row', gap: 10 }}><Action secondary title={muted ? "Unmute" : "Mute"} run={async () => { const result = await live.perform(() => api.chat.settings(conversationId, { muted: !muted }), { terms: false }); if (result)
        setMuted(!!result.muted); }}/><Action secondary title={archived ? "Unarchive" : "Archive"} run={async () => { const result = await live.perform(() => api.chat.settings(conversationId, { archived: !archived }), { terms: false }); if (result)
        setArchived(!!result.archived); }}/><Action secondary title="Clear" run={async () => { await live.perform(() => api.chat.settings(conversationId, { clear: true }), { terms: false }); query.refresh(); }}/></View></Card><Notice text={notice}/>
 <QueryState query={query}>{rows(query.data?.messages).map(m => <Pressable key={m.id} onLongPress={() => setReply(m.id)} style={{ alignSelf: m.sender?.id === user?.id ? 'flex-end' : 'flex-start', maxWidth: '86%', padding: 14, borderRadius: 18, backgroundColor: m.sender?.id === user?.id ? '#DCEFE2' : colors.surfaceSecondary, gap: 5 }}><GText style={{ color: m.sender?.id === user?.id ? '#142B1C' : colors.text }}>{m.body || (m.deleted ? 'Message deleted' : '')}</GText>{m.context?.kind ? <Pressable onPress={() => m.context.kind === 'offer' ? router.push({ pathname: '/offer', params: { id: m.context.offerId } }) : router.push({ pathname: '/product', params: { productId: m.context.productId, postId: m.context.postId || '' } })}><GText style={{ color: m.sender?.id === user?.id ? '#142B1C' : colors.text }}>{m.context.product?.name || m.context.name || (m.context.kind === 'offer' ? `Price offer · ${m.context.status}` : 'Shared product')}</GText></Pressable> : null}{m.attachment?.kind === 'voice' ? <PrivateVoice file={m.attachment}/> : m.attachment ? <Action title="Open attachment" secondary run={async () => { const blob = await api.media.private(m.attachment.id); await saveBlob(blob, m.attachment.name || 'attachment'); }}/> : null}<View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}><GText style={{ fontSize: 10, color: m.sender?.id === user?.id ? '#355B42' : colors.textMuted }}>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</GText>{m.sender?.id === user?.id ? <Ionicons name={m.status === 'sent' ? 'checkmark' : 'checkmark-done'} size={16} color={m.status === 'read' ? '#247FC1' : '#728278'}/> : null}</View>{rows(m.reactions).length ? <GText>{rows(m.reactions).map(r => r.emoji).join(' ')}</GText> : null}{!m.deleted ? <Chips items={['❤️', '👍', '😂', '😮', '😢', '🙏']} value="" onChange={emoji => void changeMessage(m.id, { action: 'react', emoji }).catch(() => undefined)}/> : null}<Action title="Hide for me" secondary run={() => changeMessage(m.id, { action: 'hide' })}/>{m.sender?.id === user?.id && !m.deleted && Date.now() - Date.parse(m.createdAt) < 15 * 60000 ? <Button title="Edit" secondary onPress={() => { setEditing(m.id); setBody(m.body || ''); }}/> : null}{m.sender?.id === user?.id && !m.deleted ? <Action secondary title="Delete" run={async () => { await live.perform(() => api.chat.messageAction(conversationId, m.id, { action: 'delete' })); query.refresh(); }}/> : null}</Pressable>)}</QueryState>
 {query.data?.nextOffset !== null && query.data?.nextOffset !== undefined ? <Button secondary title="Older messages" onPress={() => setOffset(query.data!.nextOffset!)}/> : null}
 <Card>{replyId ? <><GText>Replying to a message</GText><Button secondary title="Cancel reply" onPress={() => setReply(undefined)}/></> : null}<Input label={editing ? "Edit message" : "Message"} value={body} onChange={setBody} multiline maxLength={1600}/>{editing ? <Button title="Cancel editing" secondary onPress={() => { setEditing(undefined); setBody(''); }}/> : null}<Action title={editing ? "Save changes" : "Send message"} disabled={!body.trim()} run={() => send()}/><View style={{ gap: 8 }}><Action secondary title="Attach photo" run={async () => { if (!(await live.ensure()))
        return; const file = await pickUpload('chat_image'); if (file)
        await send(file.id); }}/><Action secondary title="Attach document" run={async () => { if (!(await live.ensure()))
        return; const file = await pickDocument('document'); if (file)
        await send(file.id); }}/><Button secondary title="Record voice message" onPress={() => setVoice(true)}/></View></Card>
 <VoiceRecorder open={voice} close={() => setVoice(false)} onSend={attachment => { void (async () => { if (!(await live.ensure()))
        return; const file = await uploadFile(attachment.uri, attachment.name, attachment.mime, 'voice'); await send(file.id); setVoice(false); })().catch(e => setNotice(e instanceof Error ? e.message : 'Could not send voice note.')); }}/>
 </Member></Page>;
}

function activityText(n:any){const d=object(n.data);const text:Record<string,string>={like:'liked your post',comment:'commented on your post',follow:'started following you',reshare:'reshared your product',offer:'sent you a price offer','offer-answer':d.status==='accepted'?'accepted your price offer':'responded to your price offer',sale:'placed an order',order:'Your order payment is confirmed',payment:'Your payment status has changed',wallet:'Your wallet has been updated',delivery:'Your package has been dispatched','delivery-confirmed':'confirmed receipt of a package',message:'sent you a message',review:'reviewed your product',issue:'reported an order issue','issue-reply':'responded to your order issue',refund:'Your refund status has changed',verification:'Seller verification: '+(d.decision==='approve'?'approved':d.decision==='needs_changes'?'changes needed':d.decision==='reject'?'not approved':'updated')};return n.title||text[n.kind]||'Your account activity has been updated';}
