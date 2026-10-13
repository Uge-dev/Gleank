import { FRONTEND_PREVIEW } from '@/config/preview';
import { AlertsPage as ServerScreen } from '@/features/live/messaging';
import { useExperience } from '@/features/experience/experience';
import { useAccount } from '@/features/account/account-state';
import { useMemo, useRef, useState } from 'react';
import { Alert, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useChat, sellerAvatar, type Conversation } from '@/features/chat/chat-state';
import { type NotificationCategory, type NotificationItem } from '@/features/notifications/demo-notifications';
import { useNotifications } from '@/features/notifications/notification-state';
type Section = 'notifications' | 'messages';
type Filter = 'All' | NotificationCategory;
const FILTERS: Filter[] = ['All', 'Orders', 'Social', 'Selling', 'Account'];
function eventColor(item: NotificationItem) {
    if (item.social?.kind === 'like')
        return '#ED4772';
    if (item.social?.kind === 'comment')
        return '#8052CC';
    if (item.icon.startsWith('person'))
        return '#269B72';
    if (item.icon.includes('shield') || item.icon.includes('wallet') || item.icon.includes('checkmark'))
        return '#23946D';
    if (item.icon.includes('alert') || item.icon.includes('create'))
        return '#D48A24';
    if (item.category === 'Account')
        return '#3B84C8';
    if (item.category === 'Selling')
        return '#8A61BB';
    return '#C88424';
}
function timeLabel(time: number) {
    const minutes = Math.floor((Date.now() - time) / 60000);
    if (minutes < 60)
        return `${Math.max(1, minutes)}m`;
    if (minutes < 1440)
        return `${Math.floor(minutes / 60)}h`;
    if (minutes < 10080)
        return `${Math.floor(minutes / 1440)}d`;
    return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function PreviewAlerts() {
    const experience = useExperience();
    const { colors, isDark } = useAppTheme();
    const router = useRouter();
    const chat = useChat();
    const { conversations, markRead, togglePin } = chat;
    const [inbox, setInbox] = useState('Recent');
    const [section, setSection] = useState<Section>('notifications');
    const [filter, setFilter] = useState<Filter>('All');
    const [query, setQuery] = useState('');
    const account = useAccount();
    const { notifications, unreadCount, markRead: markNotificationRead, markAllRead, toggleRead, remove } = useNotifications();
    const [detail, setDetail] = useState<NotificationItem | null>(null);
    const pan = useRef(PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_, gesture) => {
            if (gesture.dx < -60)
                setSection('messages');
            if (gesture.dx > 60)
                setSection('notifications');
        },
    })).current;
    const unread = unreadCount;
    const messageUnread = conversations.filter(c => !c.muted && !c.archived).reduce((sum, item) => sum + item.unread, 0);
    const filtered = notifications.filter(item => filter === 'All' || item.category === filter);
    const sorted = useMemo(() => [...conversations].filter(item => Boolean(item.archived) === (inbox === 'Archived') && (item.seller + ' ' + item.messages.map(m => m.text + ' ' + (m.attachment?.name ?? '')).join(' ')).toLowerCase().includes(query.toLowerCase())).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.messages[b.messages.length - 1]?.createdAt ?? b.createdAt) - (a.messages[a.messages.length - 1]?.createdAt ?? a.createdAt)), [conversations, query, inbox]);
    function openNotification(item: NotificationItem) {
        markNotificationRead(item.id);
        if (!item.destination) {
            setDetail(item);
            return;
        }
        const { kind, value } = item.destination;
        if (kind === 'order')
            router.push({ pathname: '/order-details', params: { id: value } });
        if (kind === 'issue')
            router.push({ pathname: '/issue', params: { id: value } });
        if (kind === 'offer')
            router.push({ pathname: '/offer', params: { id: value } });
        if (kind === 'product')
            router.push({ pathname: '/product', params: { id: value } });
        if (kind === 'store')
            router.push({ pathname: '/store', params: { seller: value } });
        if (kind === 'chat') {
            markRead(value);
            router.push({ pathname: '/chat', params: { seller: value } });
        }
    }
    function notificationMenu(item: NotificationItem) {
        Alert.alert(item.title, 'Manage notification', [
            { text: item.read ? 'Mark unread' : 'Mark read', onPress: () => toggleRead(item.id) },
            { text: 'Remove', style: 'destructive', onPress: () => remove(item.id) },
            { text: 'Cancel', style: 'cancel' },
        ]);
    }
    function threadMenu(item: Conversation) {
        Alert.alert(item.seller, 'Conversation options', [
            { text: item.pinned ? 'Unpin' : 'Pin', onPress: () => togglePin(item.seller) },
            { text: item.muted ? 'Unmute' : 'Mute', onPress: () => chat.toggleMute(item.seller) },
            { text: item.archived ? 'Unarchive' : 'Archive', onPress: () => chat.toggleArchive(item.seller) },
            { text: 'Mark read', onPress: () => markRead(item.seller) },
            { text: 'Cancel', style: 'cancel' },
        ]);
    }
    return <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
    <View style={styles.heading}><View><GText weight="bold" style={styles.title}>Your Activity</GText><GText tone="muted" style={styles.subtitle}>What matters, all in one place</GText></View>
      {section === 'notifications' && unread > 0 ? <Pressable accessibilityRole="button" onPress={markAllRead} style={[styles.markRead, { borderColor: colors.border }]}><GText weight="bold" style={styles.small}>Mark all read</GText></Pressable> : null}
    </View>
    <View style={[styles.switcher, { borderBottomColor: colors.border }]}>
      {(['notifications', 'messages'] as Section[]).map(value => <Pressable key={value} onPress={() => setSection(value)} accessibilityRole="tab" accessibilityState={{ selected: section === value }} style={styles.segment}>
        <Ionicons name={value === 'notifications' ? 'notifications-outline' : 'chatbubbles-outline'} size={18} color={section === value ? colors.text : colors.textMuted}/>
        <GText weight="bold" style={{ color: section === value ? colors.text : colors.textMuted, fontSize: 13 }}>{value === 'notifications' ? 'Notifications' : 'Messages'}</GText>
        {(value === 'notifications' ? unread : messageUnread) > 0 ? <View style={[styles.badge, { backgroundColor: colors.primary }]}><GText tone="white" weight="bold" style={{ fontSize: 10 }}>{value === 'notifications' ? unread : messageUnread}</GText></View> : null}
        {section === value ? <View style={[styles.activeLine, { backgroundColor: colors.text }]}/> : null}
      </Pressable>)}
    </View>
    <View style={styles.body}>
      <Animated.View key={section} entering={experience.reducedMotion ? undefined : section === 'messages' ? FadeInRight.duration(240) : FadeInLeft.duration(240)} style={styles.root}>
        {section === 'notifications' ? <>
          <View style={{ height: 48 }}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {FILTERS.map(value => <Pressable key={value} onPress={() => setFilter(value)} style={[styles.chip, { backgroundColor: filter === value ? colors.text : colors.surfaceSecondary }]}><GText weight="bold" style={{ fontSize: 12, color: filter === value ? colors.background : colors.text }}>{value}</GText></Pressable>)}
          </ScrollView></View>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} {...pan.panHandlers}>
            {filtered.length ? filtered.map((item, index) => <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 30).duration(200)} key={item.id}>
              {index === 0 || (new Date(filtered[index - 1].time).toDateString() !== new Date(item.time).toDateString()) ? <GText tone="muted" weight="bold" style={styles.groupLabel}>{new Date(item.time).toDateString() === new Date().toDateString() ? 'Today' : new Date(item.time).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</GText> : null}
              <Pressable onPress={() => openNotification(item)} onLongPress={() => notificationMenu(item)} accessibilityRole="button" style={[styles.notification, { backgroundColor: item.read ? colors.surface : colors.surfaceSecondary, borderColor: colors.border }]}>
                <View style={[styles.eventIcon, { backgroundColor: isDark ? '#292929' : eventColor(item) + '19' }]}><Ionicons name={item.icon} size={23} color={eventColor(item)}/></View>
                <View style={{ flex: 1, gap: 5 }}>
                  <View style={styles.row}><GText weight="bold" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>{item.title}</GText><GText tone="muted" style={styles.tiny}>{timeLabel(item.time)}</GText></View>
                  {item.social ? <><View style={styles.people}>{item.social.people.slice(0, 3).map((person, i) => <Image key={person.name} source={{ uri: person.avatar }} style={[styles.personImage, { marginLeft: i ? -9 : 0, borderColor: item.read ? colors.surface : colors.surfaceSecondary }]}/>)}<GText weight="bold" style={[styles.socialTotal, { color: eventColor(item) }]}>{item.social.people.length + item.social.others} {item.social.kind === 'like' ? 'likes' : 'comments'}</GText></View>
                    <GText style={styles.bodyText}><GText weight="bold">{item.social.people.slice(0, 3).map(person => person.name).join(', ')}</GText> and {item.social.others} others {item.social.kind === 'like' ? 'liked' : 'commented on'} your post</GText>
                    <GText tone="muted" style={styles.productHint}>{item.social.productName} · Tap to view</GText>
                  </> : <><GText tone="muted" style={styles.bodyText}>{item.body}</GText><GText tone="muted" style={styles.tiny}>{item.actor} · {item.category}</GText></>}</View>
                {!item.read ? <View style={[styles.dot, { backgroundColor: colors.primary }]}/> : null}
              </Pressable></Animated.View>) : <Empty icon="notifications-off-outline" title="You're all caught up" detail="Updates from your orders, community, selling activity and account appear here."/>}
          </ScrollView>
        </> : <>
          <View style={{ flexDirection: 'row', gap: 22, paddingHorizontal: 20 }}>{['Recent', 'Archived'].map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: inbox === value }} onPress={() => setInbox(value)} style={{ minHeight: 44, justifyContent: 'center' }}><GText weight={inbox === value ? 'bold' : 'medium'}>{value}</GText></Pressable>)}</View>
          <View style={[styles.search, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name="search-outline" size={20} color={colors.textMuted}/><TextInput value={query} onChangeText={setQuery} placeholder="Search messages" placeholderTextColor={colors.placeholder} style={[styles.searchInput, { color: colors.text }]}/></View>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} {...pan.panHandlers}>
            <GText tone="muted" style={[styles.small, { paddingHorizontal: 5, paddingBottom: 10 }]}>Recent conversations</GText>
            {sorted.length ? sorted.map(item => <Pressable key={item.seller} onPress={() => {
                    markRead(item.seller);
                    router.push({ pathname: '/chat', params: { seller: item.seller } });
                }} onLongPress={() => threadMenu(item)} accessibilityRole="button" style={[styles.thread, { borderColor: colors.border }]}>
              <View style={styles.avatarWrap}><View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}><Image source={{ uri: item.avatarUrl || sellerAvatar(item.seller) }} style={styles.avatarImage}/></View>{item.online ? <View style={[styles.onlineDot, { borderColor: colors.background }]}/> : null}</View>
              <View style={{ flex: 1, gap: 5 }}><View style={styles.row}><GText weight="bold" style={{ flex: 1, fontSize: 16 }}>{item.seller}</GText><GText tone="muted" style={styles.tiny}>{timeLabel(item.messages[item.messages.length - 1]?.createdAt ?? item.createdAt)}</GText></View>
                <View style={styles.row}><GText tone="muted" style={{ flex: 1, fontSize: 13 }} numberOfLines={1}>{item.messages[item.messages.length - 1]?.attachment ? item.messages[item.messages.length - 1]?.attachment?.kind === 'voice' ? 'Voice message' : item.messages[item.messages.length - 1]?.attachment?.name : item.messages[item.messages.length - 1]?.imageUri ? 'Photo' : item.messages[item.messages.length - 1]?.text || 'Start a conversation'}</GText>{item.muted ? <Ionicons name="notifications-off-outline" size={15} color={colors.textMuted}/> : null}{item.pinned ? <Ionicons name="pin-outline" size={15} color={colors.textMuted}/> : null}{item.unread ? <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}><GText tone="white" weight="bold" style={styles.tiny}>{item.unread}</GText></View> : null}<Ionicons name={item.messages[item.messages.length - 1]?.sender === 'me' && item.messages[item.messages.length - 1]?.status === 'sent' || item.online ? 'checkmark-done' : 'checkmark'} size={19} color={item.messages[item.messages.length - 1]?.sender === 'me' && item.messages[item.messages.length - 1]?.status === 'sent' ? '#2585E6' : colors.textMuted}/></View>
              </View></Pressable>) : <Empty icon="chatbubbles-outline" title="No conversations" detail="Open a product or seller and tap Message Seller to start chatting."/>}
          </ScrollView>
        </>}
      </Animated.View>
    </View>
    <Modal visible={Boolean(detail)} transparent animationType="fade" onRequestClose={() => setDetail(null)}><Pressable style={styles.scrim} onPress={() => setDetail(null)}><Pressable style={[styles.modal, { backgroundColor: colors.surface }]} onPress={() => {
        }}><View style={[styles.eventIcon, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name={detail?.icon ?? 'notifications-outline'} size={28} color={colors.text}/></View><GText weight="bold" style={{ fontSize: 20 }}>{detail?.title}</GText><GText tone="muted" style={{ lineHeight: 22 }}>{detail?.body}</GText><GText tone="muted" style={styles.small}>{detail?.actor}</GText><Pressable onPress={() => setDetail(null)} style={[styles.done, { backgroundColor: colors.text }]}><GText weight="bold" style={{ color: colors.background }}>Done</GText></Pressable></Pressable></Pressable></Modal>
  </SafeAreaView>;
}
function Empty({ icon, title, detail }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    detail: string;
}) {
    const { colors } = useAppTheme();
    return <View style={styles.empty}><Ionicons name={icon} size={40} color={colors.textMuted}/><GText weight="bold" style={{ fontSize: 17 }}>{title}</GText><GText tone="muted" style={{ textAlign: 'center' }}>{detail}</GText></View>;
}
const styles = StyleSheet.create({
    root: { flex: 1 }, heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 17 },
    title: { fontSize: 28, letterSpacing: -0.5 }, subtitle: { fontSize: 12, marginTop: 3 }, small: { fontSize: 12 }, tiny: { fontSize: 11 }, bodyText: { fontSize: 12, lineHeight: 18 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, markRead: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9 },
    switcher: { flexDirection: 'row', marginHorizontal: 18, borderBottomWidth: 1, marginBottom: 9 }, segment: { flex: 1, height: 55, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }, activeLine: { height: 3, position: 'absolute', left: 17, right: 17, bottom: -1, borderRadius: 3 },
    badge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }, unreadBadge: { minWidth: 19, height: 19, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }, body: { flex: 1 },
    filters: { paddingHorizontal: 18, gap: 7, alignItems: 'center' }, chip: { borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 }, scroll: { paddingHorizontal: 18, paddingBottom: 48 }, groupLabel: { paddingTop: 13, paddingBottom: 10, fontSize: 12 },
    notification: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderRadius: 15, borderWidth: 1, padding: 12, marginBottom: 9 }, eventIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, dot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 }, people: { flexDirection: 'row', alignItems: 'center', marginTop: 3, marginBottom: 3 }, personImage: { width: 31, height: 31, borderRadius: 16, borderWidth: 2 }, socialTotal: { fontSize: 12, marginLeft: 9 }, productHint: { fontSize: 11, marginTop: 2 },
    search: { marginHorizontal: 18, marginTop: 12, marginBottom: 8, borderRadius: 14, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 }, searchInput: { flex: 1, height: 46, marginLeft: 8, fontFamily: 'ReoSans-Medium' },
    thread: { borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76 }, avatarWrap: { width: 52, height: 52 }, avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, avatarImage: { width: 52, height: 52 }, onlineDot: { position: 'absolute', right: 1, bottom: 1, height: 13, width: 13, borderRadius: 7, backgroundColor: '#2DBB76', borderWidth: 2 },
    empty: { minHeight: 250, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 }, scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'flex-end' }, modal: { padding: 25, paddingBottom: 38, borderTopLeftRadius: 23, borderTopRightRadius: 23, gap: 13 }, done: { minHeight: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
});

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewAlerts/> : <ServerScreen/>;}
