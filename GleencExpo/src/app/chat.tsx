import { ChatPage as ServerScreen } from '@/features/live/messaging';
import { useExperience } from '@/features/experience/experience';
import { CommunityConsent } from '@/features/community/terms';
import { useCommunity } from '@/features/community/community-state';
import { pickChatAttachment, shareAttachment } from '@/features/chat/attachments';
import { VoiceNote, VoiceRecorder } from '@/features/chat/voice';
import { ChatVideo } from '@/features/chat/video';
import { REACTIONS } from '@/features/chat/chat-state';
import { pickLibrary } from '@/features/media/picker';
import { retainMedia } from '@/features/media/retain-media';
import { explain } from '@/features/account/guards';
import { useAccount } from '@/features/account/account-state';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/hooks/use-auth';
import { useChat, sellerAvatar, type ChatMessage } from '@/features/chat/chat-state';
import { FEED, formatPrice } from '@/features/feed/data';
import { FRONTEND_PREVIEW } from '@/config/preview';
const suggestions = ['Is it still available?', 'Can you deliver?', 'Can I see more photos?'];
function time(time: number) {
    return new Date(time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function day(time: number) {
    const value = new Date(time);
    if (value.toDateString() === new Date().toDateString())
        return 'Today';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (value.toDateString() === yesterday.toDateString())
        return 'Yesterday';
    return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function PreviewChat() {
    const { seller: param } = useLocalSearchParams<{
        seller?: string;
    }>();
    const seller = typeof param === 'string' ? param.trim() : '';
    const router = useRouter();
    const { colors, isDark } = useAppTheme();
    const { user } = useAuth();
    const account = useAccount();
    const chat = useChat();
    const { conversations, startConversation, sendMessage, markRead, togglePin, clearConversation } = chat;
    const social = useCommunity();
    const experience = useExperience();
    const [messageLimit, setMessageLimit] = useState(60);
    const pagingEarlier = useRef(false);
    const [selected, setSelected] = useState<ChatMessage | null>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [search, setSearch] = useState(false);
    const [query, setQuery] = useState('');
    const [recording, setRecording] = useState(false);
    const [rulesOpen, setRulesOpen] = useState(false);
    const [video, setVideo] = useState('');
    const [draft, setDraft] = useState('');
    const [reply, setReply] = useState<ChatMessage | null>(null);
    const [imageOpen, setImageOpen] = useState('');
    const scroll = useRef<ScrollView>(null);
    const conversation = conversations.find(item => item.seller === seller);
    const blocked = account.isBlocked(seller);
    const matching = (conversation?.messages ?? []).filter(m => !query || (m.text + (m.attachment?.name ?? '')).toLowerCase().includes(query.toLowerCase()));
    const messages = matching.slice(-messageLimit);
    const featured = useMemo(() => FEED.find(item => item.store === seller), [seller]);
    useEffect(() => {
        if (!user && !FRONTEND_PREVIEW) {
            router.replace('/login');
            return;
        }
        if (seller && !blocked && chat.ready && !chat.notice) {
            run(() => {
                startConversation(seller);
                markRead(seller);
            });
        }
    }, [seller, user?.id, blocked, chat.ready]);
    function submit() {
        if (!draft.trim() || !seller)
            return;
        try {
            if (editing)
                chat.editMessage(seller, editing, draft);
            else
                sendMessage(seller, draft, undefined, reply?.text);
            setEditing(null);
            setDraft('');
            setReply(null);
        }
        catch (e) {
            Alert.alert('Message unavailable', explain(e));
        }
    }
    async function attach(kind: 'image' | 'video' | 'document') {
        try {
            const media = await pickChatAttachment(kind);
            if (media)
                chat.sendAttachment(seller, media, draft, reply?.text);
            setReply(null);
            setDraft('');
        }
        catch (e) {
            Alert.alert('Attachment unavailable', explain(e));
        }
    }
    function run(f: () => void) {
        try {
            f();
        }
        catch (e) {
            Alert.alert('Message unavailable', explain(e));
        }
    }
    function messageMenu(message: ChatMessage) {
        if (!message.offerId && !message.deleted)
            setSelected(message);
    }
    if (blocked)
        return <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: colors.background }]}><View style={{ padding: 24, gap: 20 }}><Pressable accessibilityRole="button" onPress={() => router.back()} style={{ minHeight: 44 }}><GText weight="bold">Back to messages</GText></Pressable><GText weight="bold" style={{ fontSize: 24 }}>This account is blocked</GText><GText tone="muted">Unblock {seller} in Settings to continue this conversation.</GText><Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={{ minHeight: 44 }}><GText weight="bold">Open Settings →</GText></Pressable></View></SafeAreaView>;
    return <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: colors.background }]}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Back to messages"><Ionicons name="arrow-back" size={23} color={colors.text}/></Pressable>
        <Pressable onPress={() => router.push({ pathname: '/store', params: { seller } })} style={styles.identity} accessibilityLabel={`Open ${seller} profile`}>
          <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary, overflow: 'hidden' }]}><Image source={{ uri: conversation?.avatarUrl || sellerAvatar(seller) }} style={{ width: 42, height: 42 }}/></View>
          <View style={{ flex: 1 }}><GText weight="bold" numberOfLines={1} style={{ fontSize: 16 }}>{seller || 'Conversation'}</GText><GText tone="muted" style={styles.small}>{account.preferences.showOnline && conversation?.online ? 'Online' : 'Offline'}</GText></View>
        </Pressable>
        <Pressable accessibilityLabel="Conversation options" onPress={() => Alert.alert(seller, 'Conversation options', [
            { text: conversation?.pinned ? 'Unpin chat' : 'Pin chat', onPress: () => togglePin(seller) },
            { text: 'Search this chat', onPress: () => setSearch(v => !v) },
            { text: conversation?.muted ? 'Unmute' : 'Mute', onPress: () => run(() => chat.toggleMute(seller)) },
            { text: conversation?.archived ? 'Unarchive' : 'Archive', onPress: () => run(() => chat.toggleArchive(seller)) },
            { text: 'Report account', onPress: () => router.push({ pathname: '/report', params: { kind: 'account', id: seller, author: seller } }) },
            { text: 'Block account', style: 'destructive', onPress: () => run(() => account.toggleBlock(seller)) },
            { text: 'Clear messages', style: 'destructive', onPress: () => Alert.alert('Clear messages?', 'Clears this conversation on this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: () => run(() => clearConversation(seller)) }]) },
            { text: 'Cancel', style: 'cancel' },
        ])} style={styles.headerAction}><Ionicons name="ellipsis-vertical" size={21} color={colors.text}/></Pressable>
      </View>
      {search ? <View style={{ padding: 12, gap: 6 }}><TextInput accessibilityLabel="Search this conversation" value={query} onChangeText={setQuery} maxLength={100} placeholder="Search messages and attachments" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceSecondary }]}/><GText tone="muted">{messages.length} results</GText></View> : null}
      {chat.notice ? <Pressable onPress={() => void chat.retrySave()} style={{ padding: 14 }}><GText tone="red">{chat.notice} Tap to retry saving.</GText></Pressable> : null}
      <ScrollView ref={scroll} style={[styles.messages, { backgroundColor: isDark ? '#111111' : '#F6F9F7' }]} contentContainerStyle={styles.content} onContentSizeChange={() => {
            if (pagingEarlier.current) {
                pagingEarlier.current = false;
                return;
            }
            if (!query)
                scroll.current?.scrollToEnd({ animated: !experience.reducedMotion });
        }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {matching.length > messageLimit ? <Pressable accessibilityRole="button" onPress={() => {
                pagingEarlier.current = true;
                setMessageLimit(n => n + 60);
            }} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><GText weight="bold">Load earlier messages</GText></Pressable> : null}
        {featured ? <Pressable onPress={() => router.push({ pathname: '/product', params: { id: featured.id } })} style={[styles.product, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Image source={{ uri: featured.image }} style={styles.productImage}/><View style={{ flex: 1, gap: 3 }}><GText tone="muted" style={styles.tiny}>PRODUCT IN THIS CONVERSATION</GText><GText weight="bold" numberOfLines={1}>{featured.name}</GText><GText weight="bold" style={{ fontSize: 12 }}>{formatPrice(featured.priceKobo)}</GText></View><Ionicons name="chevron-forward" size={17} color={colors.textMuted}/></Pressable> : null}
        {messages.length ? messages.map((message, index) => <View key={message.id}>
          {(index === 0 || day(messages[index - 1].createdAt) !== day(message.createdAt)) ? <View style={[styles.dayPill, { backgroundColor: colors.surface }]}><GText tone="muted" style={styles.tiny}>{day(message.createdAt)}</GText></View> : null}
          <Animated.View entering={experience.reducedMotion ? undefined : FadeInDown.duration(180)} style={{ alignItems: message.sender === 'me' ? 'flex-end' : 'flex-start' }}>
            <Pressable onLongPress={() => messageMenu(message)} onPress={() => message.imageUri ? setImageOpen(message.imageUri) : undefined} style={[styles.bubble, message.sender === 'me' ? styles.mine : styles.theirs, { backgroundColor: message.sender === 'me' ? (isDark ? '#21483B' : '#DCF5E8') : (isDark ? '#242424' : '#F0F0F0'), borderColor: isDark ? '#ffffff16' : '#0000000a' }]}>
              {message.replyTo ? <View style={[styles.quoted, { borderLeftColor: colors.text, backgroundColor: colors.surfaceSecondary }]}><GText tone="muted" numberOfLines={2} style={styles.small}>{message.replyTo}</GText></View> : null}
              {message.imageUri ? <Image source={{ uri: message.imageUri }} style={styles.attachedImage}/> : null}
              {message.attachment?.kind === 'image' ? <Pressable accessibilityLabel="Open photo" onPress={() => setImageOpen(message.attachment!.uri)}><Image source={{ uri: message.attachment.uri }} style={styles.attachedImage}/></Pressable> : null}
              {message.attachment?.kind === 'voice' ? <VoiceNote attachment={message.attachment}/> : null}
              {message.attachment?.kind === 'video' ? <Pressable accessibilityLabel="Play attached video" onPress={() => setVideo(message.attachment!.uri)} style={{ padding: 18, minHeight: 70, gap: 8, flexDirection: 'row', alignItems: 'center' }}><Ionicons name="play-circle" size={36} color={colors.text}/><GText style={{ flex: 1 }}>Video · {(message.attachment.bytes / 1048576).toFixed(1)} MB</GText></Pressable> : null}
              {message.attachment?.kind === 'document' ? <Pressable accessibilityLabel="Open document" onPress={() => void shareAttachment(message.attachment!).catch(e => Alert.alert('File unavailable', explain(e)))} style={{ minHeight: 64, flexDirection: 'row', gap: 10, alignItems: 'center' }}><Ionicons name="document-text-outline" color={colors.text} size={31}/><View style={{ flex: 1 }}><GText weight="bold">{message.attachment.name}</GText><GText tone="muted">{Math.ceil(message.attachment.bytes / 1024)} KB · Open / share</GText></View></Pressable> : null}
              {message.reactions?.length ? <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{message.reactions.map(r => <Pressable key={r.ownerId} accessibilityLabel={'React ' + r.emoji} onPress={() => run(() => chat.react(seller, message.id, r.emoji))} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: 20 }}><GText>{r.emoji}</GText></Pressable>)}</View> : null}
              {message.product ? <Pressable onPress={() => router.push({ pathname: '/product', params: { id: message.product!.id } })} style={{ gap: 6 }}><Image source={{ uri: message.product.image }} style={{ width: 195, height: 125, borderRadius: 10 }}/><GText weight="bold">{message.product.name}</GText><GText>{formatPrice(message.product.priceKobo)}</GText><GText tone="muted">{message.product.store} · Open product</GText></Pressable> : null}
              {message.offerId ? <Pressable onPress={() => router.push({ pathname: '/offer', params: { id: message.offerId! } })} style={{ minHeight: 44, justifyContent: 'center' }}><GText weight="bold">Review price offer →</GText></Pressable> : null}
              {message.text ? <GText style={{ fontSize: 14, lineHeight: 20 }}>{message.text}</GText> : null}
              <View style={styles.meta}><GText tone="muted" style={styles.tiny}>{message.editedAt ? 'edited · ' : ''}{time(message.createdAt)}</GText>{message.sender === 'me' ? <Ionicons name={message.status === 'sent' || conversation?.online ? 'checkmark-done' : 'checkmark'} size={16} color={message.status === 'sent' ? '#2585E6' : colors.textMuted}/> : null}</View>
            </Pressable>
          </Animated.View>
        </View>) : <View style={styles.empty}><Ionicons name="chatbubble-ellipses-outline" size={34} color={colors.textMuted}/><GText weight="bold">Start a conversation</GText><GText tone="muted" style={{ textAlign: 'center' }}>Ask {seller || 'this seller'} about availability, colors, delivery or pickup.</GText></View>}
        {messages.length === 0 ? <View style={styles.suggestions}>{suggestions.map(value => <Pressable key={value} onPress={() => setDraft(value)} style={[styles.suggestion, { borderColor: colors.border, backgroundColor: colors.surface }]}><GText style={styles.small}>{value}</GText></Pressable>)}</View> : null}
      </ScrollView>
      {reply ? <View style={[styles.replyBar, { backgroundColor: colors.surface, borderLeftColor: colors.text }]}><View style={{ flex: 1 }}><GText weight="bold" style={styles.small}>Replying to {reply.sender === 'me' ? 'yourself' : seller}</GText><GText tone="muted" numberOfLines={1} style={styles.small}>{reply.text || 'Photo'}</GText></View><Pressable onPress={() => setReply(null)} accessibilityLabel="Cancel reply"><Ionicons name="close" size={20} color={colors.textMuted}/></Pressable></View> : null}
      {editing ? <Pressable onPress={() => {
                setEditing(null);
                setDraft('');
            }} style={{ padding: 12 }}><GText>Editing message · Cancel ×</GText></Pressable> : null}
      {!social.accepted ? <Pressable accessibilityRole="button" onPress={() => setRulesOpen(true)} style={{ minHeight: 54, padding: 14, justifyContent: 'center', backgroundColor: colors.surface }}><GText weight="bold">Review community rules to start messaging →</GText></Pressable> : <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => Alert.alert('Attach', '', [{ text: 'Photo', onPress: () => void attach('image') }, { text: 'Video', onPress: () => void attach('video') }, { text: 'Document', onPress: () => void attach('document') }, { text: 'Cancel', style: 'cancel' }])} accessibilityLabel="Attach photo, video or document" style={styles.attach}><Ionicons name="add" size={26} color={colors.primary}/></Pressable>
        <TextInput value={draft} onChangeText={setDraft} placeholder="Message..." placeholderTextColor={colors.placeholder} multiline maxLength={2000} style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text }]} accessibilityLabel="Write a message"/>
        <Pressable accessibilityLabel="Record voice message" disabled={!chat.ready || !!chat.notice} style={styles.attach} onPress={() => setRecording(true)}><Ionicons name="mic-outline" size={24} color={colors.text}/></Pressable>
        <Pressable onPress={submit} disabled={!draft.trim() || !chat.ready || !!chat.notice} accessibilityLabel="Send message" style={[styles.send, { backgroundColor: draft.trim() ? colors.primary : colors.border }]}><Ionicons name="send" size={19} color="#FFFFFF"/></Pressable>
      </View>}
    </KeyboardAvoidingView>
    <Modal visible={rulesOpen && !social.accepted} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setRulesOpen(false)}><SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}><ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}><Pressable accessibilityLabel="Close community rules" onPress={() => setRulesOpen(false)} style={{ minHeight: 48, justifyContent: 'center' }}><GText weight="bold">Close ×</GText></Pressable><CommunityConsent /></ScrollView></SafeAreaView></Modal>
    <VoiceRecorder open={recording} close={() => setRecording(false)} onSend={a => run(() => chat.sendAttachment(seller, a, '', reply?.text))}/>
    <ChatVideo uri={video} close={() => setVideo('')}/>
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}><View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}><View style={{ backgroundColor: colors.surface, padding: 20, paddingBottom: 32, gap: 10, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{REACTIONS.map(emoji => <Pressable key={emoji} accessibilityLabel={'React ' + emoji} onPress={() => run(() => {
                chat.react(seller, selected!.id, emoji);
                setSelected(null);
            })} style={{ minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center' }}><GText style={{ fontSize: 27 }}>{emoji}</GText></Pressable>)}</View>{[
            { title: 'Reply', action: () => {
                    setReply(selected);
                    setSelected(null);
                } },
            ...(selected?.sender === 'me' && !selected.product && Date.now() - selected.createdAt < 15 * 60000 ? [{ title: 'Edit', action: () => {
                        setEditing(selected!.id);
                        setDraft(selected!.text);
                        setSelected(null);
                    } }] : []),
            { title: 'Delete for me', action: () => {
                    chat.deleteMessage(seller, selected!.id, false);
                    setSelected(null);
                } },
            ...(selected?.sender === 'me' ? [{ title: 'Delete for everyone', action: () => {
                        chat.deleteMessage(seller, selected!.id, true);
                        setSelected(null);
                    } }] : []),
            { title: 'Report', action: () => {
                    router.push({ pathname: '/report', params: { kind: 'message', id: selected!.id, author: seller } });
                    setSelected(null);
                } },
            { title: 'Close', action: () => setSelected(null) }
        ].map(action => <Pressable key={action.title} accessibilityRole="button" onPress={() => run(action.action)} style={{ minHeight: 48, justifyContent: 'center' }}><GText weight="bold">{action.title}</GText></Pressable>)}</View></View></Modal>
    <Modal visible={Boolean(imageOpen)} transparent animationType="fade" onRequestClose={() => setImageOpen('')}><View style={styles.imageModal}><Pressable onPress={() => setImageOpen('')} style={styles.imageClose} accessibilityLabel="Close photo"><Ionicons name="close" size={27} color="#FFFFFF"/></Pressable>{imageOpen ? <Image source={{ uri: imageOpen }} resizeMode="contain" style={styles.imageFull}/> : null}</View></Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, header: { minHeight: 62, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1 }, back: { width: 37, height: 44, alignItems: 'center', justifyContent: 'center' }, identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }, headerAction: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' }, small: { fontSize: 12 }, tiny: { fontSize: 10 }, previewStrip: { flexDirection: 'row', gap: 7, alignItems: 'center', paddingHorizontal: 16, minHeight: 29 }, messages: { flex: 1 }, content: { padding: 14, paddingBottom: 26, gap: 9 }, product: { borderWidth: 1, borderRadius: 15, padding: 9, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }, productImage: { height: 51, width: 51, borderRadius: 10 }, dayPill: { alignSelf: 'center', paddingHorizontal: 13, paddingVertical: 6, borderRadius: 13, marginVertical: 10 }, bubble: { maxWidth: '84%', minWidth: 85, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 4 }, mine: { borderRadius: 16, borderBottomRightRadius: 4 }, theirs: { borderRadius: 16, borderBottomLeftRadius: 4 }, quoted: { borderLeftWidth: 3, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 5, marginBottom: 4 }, attachedImage: { width: 210, height: 210, borderRadius: 9 }, meta: { flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 3, marginTop: 2 }, empty: { minHeight: 200, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 25 }, suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center' }, suggestion: { borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9, borderRadius: 18 }, replyBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 13, paddingHorizontal: 12, paddingVertical: 8, borderLeftWidth: 3, borderTopLeftRadius: 8, borderTopRightRadius: 8 }, composer: { borderTopWidth: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 7, paddingHorizontal: 8, paddingVertical: 8 }, attach: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' }, input: { flex: 1, minHeight: 43, maxHeight: 118, borderRadius: 21, paddingHorizontal: 14, paddingVertical: 10, fontFamily: 'ReoSans-Medium', fontSize: 14 }, send: { width: 48, height: 48, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, imageModal: { flex: 1, backgroundColor: '#050505', justifyContent: 'center' }, imageClose: { position: 'absolute', top: 55, right: 22, zIndex: 2 }, imageFull: { width: '100%', height: '78%' } });

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewChat/> : <ServerScreen/>;}
