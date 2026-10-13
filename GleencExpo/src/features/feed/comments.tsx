import { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useCommunity } from '@/features/community/community-state';
import { CommunityConsent } from '@/features/community/terms';
import { Button, Empty, Notice } from '@/features/studio/ui';
import { explain } from '@/features/account/guards';
import type { Comment } from '@/features/community/domain';
export function Comments({ open, close, title, postId }: {
    open: boolean;
    close: () => void;
    title: string;
    postId: string;
}) {
    const { colors } = useAppTheme();
    const social = useCommunity();
    const router = useRouter();
    const [body, setBody] = useState('');
    const [reply, setReply] = useState<Comment | null>(null);
    const [limit, setLimit] = useState(15);
    const [sort, setSort] = useState<'Newest' | 'Popular'>('Newest');
    useEffect(() => {
        setBody('');
        setReply(null);
        setLimit(15);
    }, [postId, open]);
    const comments = social.commentsFor(postId);
    const roots = comments.filter(c => !c.parentId).sort((a, b) => sort === 'Popular' ? b.likes.length - a.likes.length || b.at - a.at : b.at - a.at);
    const run = (f: () => void) => {
        try {
            f();
        }
        catch (e) {
            Alert.alert('Comment unavailable', explain(e));
        }
    };
    const render = (c: Comment, nested = false) => <View key={c.id} style={{ marginLeft: nested ? 34 : 0, paddingVertical: 13, gap: 7, borderBottomWidth: 1, borderColor: colors.border }}>
    <View style={{ flexDirection: 'row', gap: 10 }}><Pressable accessibilityLabel={`Open ${c.author.name} profile`} onPress={() => {
            close();
            router.push({ pathname: '/store', params: { seller: c.author.store } });
        }}><Image source={{ uri: c.author.avatar }} style={{ width: 34, height: 34, borderRadius: 17 }}/></Pressable>
      <View style={{ flex: 1, gap: 5 }}><GText weight="bold">{c.author.name}</GText><GText style={{ fontSize: 14, lineHeight: 21 }}>{c.deleted ? 'Comment deleted' : c.body}</GText><GText tone="muted" style={{ fontSize: 11 }}>{new Date(c.at).toLocaleString()}</GText></View>
      {!c.deleted ? <Pressable accessibilityLabel="Comment options" style={{ minWidth: 44, minHeight: 44, alignItems: 'center' }} onPress={() => Alert.alert('Comment', '', [{ text: 'Report', onPress: () => {
                        close();
                        router.push({ pathname: '/report', params: { kind: 'comment', id: c.id, author: c.author.store } });
                    } }, ...(c.author.id === social.me.id ? [{ text: 'Delete', style: 'destructive' as const, onPress: () => run(() => social.deleteComment(c.id)) }] : []), { text: 'Cancel', style: 'cancel' }])}><Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted}/></Pressable> : null}
    </View>
    {!c.deleted ? <View style={{ flexDirection: 'row', paddingLeft: 44, gap: 16 }}><Pressable accessibilityRole="button" accessibilityLabel={`Like comment, ${c.likes.length} likes`} accessibilityState={{ selected: c.likes.includes(social.me.id) }} onPress={() => run(() => social.toggleCommentLike(c.id))} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name={c.likes.includes(social.me.id) ? 'heart' : 'heart-outline'} size={20} color={c.likes.includes(social.me.id) ? colors.primary : colors.textMuted}/><GText tone="muted">{c.likes.length}</GText></Pressable><Pressable accessibilityRole="button" onPress={() => setReply(nested ? comments.find(p => p.id === c.parentId) ?? null : c)} style={{ minHeight: 44, justifyContent: 'center' }}><GText weight="bold" style={{ fontSize: 13 }}>Reply</GText></Pressable></View> : null}
  </View>;
    return <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}><SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1 }}><GText weight="bold" style={{ fontSize: 21 }}>Comments · {comments.filter(c => !c.deleted).length}</GText><GText tone="muted" numberOfLines={1}>{title}</GText></View><Pressable onPress={close} accessibilityLabel="Close comments" style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={26} color={colors.text}/></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 24 }}><Notice text={social.notice}/>{!social.accepted ? <CommunityConsent /> : null}{!social.ready ? <GText>Loading comments…</GText> : null}<View style={{ flexDirection: 'row', gap: 16 }}>{(['Newest', 'Popular'] as const).map(value => <Pressable key={value} onPress={() => setSort(value)} style={{ minHeight: 44, justifyContent: 'center' }}><GText weight={sort === value ? 'bold' : 'medium'} tone={sort === value ? undefined : 'muted'}>{value}</GText></Pressable>)}</View>
      {!roots.length && social.ready ? <Empty title="Start the conversation" detail="Ask a question, share an idea or reply to someone." icon="chatbubble-outline"/> : null}
      {roots.slice(0, limit).map(root => <View key={root.id}>{render(root)}{comments.filter(c => c.parentId === root.id).map(c => render(c, true))}</View>)}
      {roots.length > limit ? <Button title="Load more comments" secondary onPress={() => setLimit(v => v + 15)}/> : null}
    </ScrollView>
    {social.accepted ? <View style={{ padding: 14, borderTopWidth: 1, borderColor: colors.border, gap: 8 }}>
      {reply ? <Pressable onPress={() => setReply(null)} accessibilityLabel="Cancel reply"><GText tone="muted">Replying to {reply.author.name} · Cancel ×</GText></Pressable> : null}
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}><TextInput accessibilityLabel="Comment" multiline maxLength={2000} value={body} onChangeText={setBody} placeholder="Add a comment…" placeholderTextColor={colors.textMuted} style={{ flex: 1, minHeight: 48, maxHeight: 120, padding: 13, borderRadius: 22, backgroundColor: colors.surfaceSecondary, color: colors.text, fontFamily: 'ReoSans-Medium' }}/><Pressable disabled={!body.trim() || !social.ready} accessibilityLabel="Post comment" onPress={() => run(() => {
                social.addComment(postId, body, reply?.id);
                setBody('');
                setReply(null);
            })} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', opacity: body.trim() ? 1 : .4 }}><Ionicons name="arrow-up" size={24} color={colors.background}/></Pressable></View>
    </View> : null}
  </KeyboardAvoidingView></SafeAreaView></Modal>;
}
