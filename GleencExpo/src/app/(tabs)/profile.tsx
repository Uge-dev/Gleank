import { ProfilePage as ServerScreen } from '@/features/live/account-pages';
import { useCommunity } from '@/features/community/community-state';
import { useAccount } from '@/features/account/account-state';
import { retainMedia } from '@/features/media/retain-media';
import { useProfileMedia } from '@/features/profile/profile-media';
import { pickLibrary } from '@/features/media/picker';
import { Sheet } from '@/features/marketplace/marketplace-sheets';
import { ProfileMenu } from '@/features/marketplace/profile-menu';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { Image, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GText } from '@/components/gleenc/text';
import { Action, Panel } from '@/features/create/controls';
import { useDrafts } from '@/features/create/draft-store';
import { useFeedState } from '@/features/feed/feed-state';
import { formatPrice } from '@/features/feed/data';
import { useChat } from '@/features/chat/chat-state';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/hooks/use-auth';
import { FRONTEND_PREVIEW, PREVIEW_ACCOUNT_ID } from '@/config/preview';
const demoAccount = { name: 'Gleenc Seller', email: 'seller@gleenc.example', city: 'Warri', state: 'Delta', campus: 'FUPRE', phone: '', avatarUrl: null, role: 'seller' as const, emailVerified: false, profile: { displayName: 'Gleenc Seller', username: 'gleencseller', bio: 'Everyday finds and good things worth sharing.' } };
type Section = 'Listings' | 'Drafts' | 'Saved' | 'Reshares' | 'Menu';
function PreviewProfile() {
    const social = useCommunity();
    const router = useRouter();
    const { colors } = useAppTheme();
    const { user, store, signOut } = useAuth();
    const localAccount = useAccount();
    const rawAccount = user ?? (FRONTEND_PREVIEW ? demoAccount : null);
    const account = rawAccount ? { ...rawAccount, name: localAccount.profile.displayName, phone: localAccount.profile.phone, city: localAccount.profile.city, state: localAccount.profile.state, profile: { ...rawAccount.profile, displayName: localAccount.profile.displayName, username: localAccount.profile.username, bio: localAccount.profile.bio } } : null;
    const { drafts } = useDrafts();
    const market = useMarketplace();
    const { saved, followed, reshared, offers, catalog } = useFeedState();
    const { conversations } = useChat();
    const [section, setSection] = useState<Section>('Listings');
    const photos = useProfileMedia(user?.id ?? (FRONTEND_PREVIEW ? PREVIEW_ACCOUNT_ID : ''));
    const [photoPane, setPhotoPane] = useState<'avatar' | 'cover' | null>(null);
    const [photoBusy, setPhotoBusy] = useState(false);
    const [photoError, setPhotoError] = useState('');
    const avatar = photos.media.avatar || account?.avatarUrl;
    async function choosePhoto() {
        if (!photoPane || photoBusy)
            return;
        const kind = photoPane;
        setPhotoBusy(true);
        setPhotoError('');
        try {
            const selected = await pickLibrary('images', 1, kind === 'avatar' ? [1, 1] : [16, 9]);
            if (selected[0]) {
                await photos.update(kind, await retainMedia(selected[0].uri));
                setPhotoPane(null);
            }
        }
        catch (e) {
            setPhotoError(e instanceof Error ? e.message : 'Unable to change photo.');
        }
        finally {
            setPhotoBusy(false);
        }
    }
    function editPhoto(kind: 'avatar' | 'cover') {
        setPhotoError('');
        setPhotoPane(kind);
    }
    const displayName = account?.profile?.displayName || account?.name || 'Gleenc member';
    const username = account?.profile?.username ? `@${account.profile.username}` : `@${(account?.name ?? 'member').toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
    const place = [account?.city, account?.state].filter(Boolean).join(', ') || account?.campus || 'Location not set';
    const savedItems = catalog.filter(item => saved.includes(item.id));
    const openDraft = (id: string) => router.push({ pathname: '/create', params: { draftId: id } });
    return <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.nav}><GText weight="bold" style={styles.title}>Profile</GText><Pressable accessibilityLabel="Open settings" style={styles.tap} onPress={() => router.push('/settings')}><Ionicons name="settings-outline" size={23} color={colors.text}/></Pressable><Pressable accessibilityLabel="Share profile" onPress={() => Share.share({ message: `Find ${displayName} on Gleenc` })} style={styles.tap}><Ionicons name="share-social-outline" size={23} color={colors.text}/></Pressable></View>
      {!account ? <Animated.View entering={FadeInDown.duration(300)} style={styles.stack}>
        <View style={[styles.cover, { backgroundColor: colors.text }]}/><View style={[styles.avatar, { borderColor: colors.background, backgroundColor: colors.text }]}><Ionicons name="person" size={32} color={colors.background}/></View>
        <GText weight="bold" style={styles.title}>Your corner of Gleenc</GText><GText tone="muted">Sign in to save products, follow sellers, create listings and see your account details.</GText>
        <Action title="Sign in" onPress={() => router.push('/login')}/><Action title="Create account" secondary onPress={() => router.push('/signup')}/>
      </Animated.View> : <>
        <Animated.View entering={FadeInDown.duration(330)}>
          <Pressable accessibilityRole="button" accessibilityLabel="Change cover photo" onPress={() => editPhoto('cover')} style={[styles.cover, { backgroundColor: colors.text }]}>{photos.media.cover ? <Image source={{ uri: photos.media.cover }} style={StyleSheet.absoluteFill} resizeMode="cover"/> : <View style={styles.coverCircle}/>}<View style={{ position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, padding: 9, borderRadius: 12, backgroundColor: 'rgba(0,0,0,.65)' }}><Ionicons name="camera-outline" size={17} color="#FFFFFF"/><GText style={{ color: '#FFFFFF', fontSize: 11 }}>Edit cover</GText></View></Pressable>
          <View style={styles.identity}><Pressable accessibilityRole="button" accessibilityLabel="Change profile photo or store logo" onPress={() => editPhoto('avatar')} style={[styles.avatar, { borderColor: colors.background, backgroundColor: colors.surfaceSecondary }]}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage}/> : <GText weight="bold" style={{ fontSize: 33 }}>{displayName.slice(0, 1).toUpperCase()}</GText>}
          <View style={{ position: 'absolute', bottom: 2, right: 1, width: 26, height: 26, borderRadius: 13, backgroundColor: '#111111', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="camera" size={14} color="#FFFFFF"/></View></Pressable><View style={{ flex: 1 }}/><Pressable accessibilityRole="button" onPress={() => router.push('/create')} style={[styles.createSmall, { borderColor: colors.border }]}><Ionicons name="add" size={18} color={colors.text}/><GText weight="bold">Create</GText></Pressable></View>
          <GText weight="bold" style={styles.name}>{displayName}</GText>
          <GText tone="muted">{username} · {place}</GText>
          {account.profile?.bio ? <GText style={{ marginTop: 9 }}>{account.profile.bio}</GText> : null}
          <View style={styles.badges}><View style={[styles.badge, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name="person-circle-outline" size={15} color={colors.text}/><GText style={styles.tiny}>{account.role === 'seller' ? 'Seller' : 'Member'}</GText></View>
            {account.emailVerified ? <View style={[styles.badge, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name="checkmark-circle" size={15} color={colors.success}/><GText style={styles.tiny}>Email verified</GText></View> : null}
            {store?.verified ? <View style={[styles.badge, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name="shield-checkmark" size={15} color={colors.success}/><GText style={styles.tiny}>Verified store</GText></View> : null}</View>
          <Action title="Edit profile" secondary icon="create-outline" onPress={() => router.push('/edit-profile')}/>
          <View style={[styles.metrics, { borderColor: colors.border }]}><Metric value={String(drafts.length)} label="Drafts"/><Metric value={String(saved.length)} label="Saved"/><Metric value={String(social.followersFor(social.me.store).length)} label="Followers" onPress={() => router.push({ pathname: '/connections', params: { mode: 'followers' } })}/><Metric value={String(followed.length)} label="Following" onPress={() => router.push({ pathname: '/connections', params: { mode: 'following' } })}/><Metric value={String(reshared.length)} label="Reshares"/></View>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(100).duration(320)} style={styles.stack}>
          {store ? <Panel><View style={styles.inline}><Ionicons name="storefront" size={25} color={colors.text}/><View style={{ flex: 1 }}><GText weight="bold" style={styles.subhead}>{store.name}</GText><GText tone="muted" style={styles.small}>{store.status === 'active' ? 'Active storefront' : 'Store paused'} · {store.category || 'Your shop'}</GText></View></View><GText tone="muted" style={styles.small}>Manage your listings, quantities and incoming orders from your profile.</GText></Panel> : <Panel><GText weight="bold" style={styles.subhead}>Start selling</GText><GText tone="muted">Create listings, set reusable prices, and manage your orders here.</GText><Action title="Create your first listing" secondary onPress={() => router.push('/create')}/></Panel>}
          <View style={styles.tabs}>{(['Listings', 'Drafts', 'Saved', 'Reshares', 'Menu'] as Section[]).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: section === tab }} onPress={() => setSection(tab)} style={[styles.tab, { borderBottomColor: section === tab ? colors.text : colors.border }]}><GText weight="bold" style={{ color: section === tab ? colors.text : colors.textMuted }}>{tab}</GText></Pressable>)}</View>
          {section === 'Listings' && !catalog.some(p => p.id.startsWith('POST-') && p.sellerId === market.ownerId) ? <Empty icon="grid-outline" title="Your live listings" description="Publish your first product from Create. You can edit availability in Manage products."/> : null}
          {section === 'Listings' ? <View style={styles.grid}>{catalog.filter(p => p.id.startsWith('POST-') && p.sellerId === market.ownerId).map(p => <Pressable key={p.id} style={[styles.tile, { borderColor: colors.border }]} onPress={() => router.push({ pathname: '/product', params: { id: p.id } })}><Image source={{ uri: p.image }} style={styles.tileImage}/><View style={{ padding: 10 }}><GText weight="bold">{p.name}</GText><GText>{formatPrice(p.priceKobo)}</GText></View></Pressable>)}</View> : null}
          {section === 'Drafts' ? (drafts.length ? <View style={styles.grid}>{drafts.map(item => <Pressable key={item.id} onPress={() => openDraft(item.id)} style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {item.images[0] ? <Image source={{ uri: item.images[0].uri }} style={styles.tileImage}/> : <View style={[styles.tileImage, styles.tilePlaceholder, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name={item.presentation === 'video' ? 'videocam-outline' : 'image-outline'} size={32} color={colors.textMuted}/></View>}
            <View style={{ padding: 10, gap: 5 }}><GText numberOfLines={1} weight="bold">{item.name || 'Untitled product'}</GText><GText tone="muted" style={styles.small}>{item.state === 'ready' ? 'Ready for submission' : 'Draft'} · ₦{Number(item.basePrice || 0).toLocaleString()}</GText></View>
          </Pressable>)}</View> : <Empty icon="document-text-outline" title="No drafts yet" description="Your product designs will stay here on this device."/>) : null}
          {section === 'Saved' ? (savedItems.length ? <View style={styles.grid}>{savedItems.map(item => <Pressable key={item.id} onPress={() => router.push({ pathname: '/product', params: { id: item.id } })} style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.surface }]}><Image source={{ uri: item.image }} style={styles.tileImage}/><View style={{ padding: 10 }}><GText numberOfLines={1} weight="bold">{item.name}</GText><GText tone="muted" style={styles.small}>{item.store}</GText></View></Pressable>)}</View> : <Empty icon="bookmark-outline" title="Nothing saved yet" description="Bookmark products in the feed to find them here."/>) : null}
          {section === 'Menu' ? <ProfileMenu store={market.storeName} manage/> : null}
          {section === 'Reshares' ? (offers.length ? <View style={styles.grid}>{offers.map(item => <Pressable key={item.id} onPress={() => router.push({ pathname: '/product', params: { id: item.id } })} style={[styles.tile, { borderColor: colors.border, backgroundColor: colors.surface }]}><Image source={{ uri: item.image }} style={styles.tileImage}/><View style={{ padding: 10, gap: 5 }}><GText numberOfLines={2} weight="bold">{item.name}</GText><GText weight="bold">{formatPrice(item.priceKobo)}</GText><GText tone="muted" style={styles.small}>Original seller · {item.store}</GText><GText style={[styles.small, { color: colors.success }]}>{formatPrice(item.offer?.commissionKobo ?? 0)} commission / unit</GText></View></Pressable>)}</View> : <Empty icon="repeat" title="Your reshares" description="Share a product and set your price. Published reshares will appear here."/>) : null}
          <Menu icon="restaurant-outline" label="Menu & prices" detail="Set reusable item, pack and menu prices" onPress={() => router.push({ pathname: '/catalogue', params: { manage: '1' } })}/>
          <Menu icon="pricetag-outline" label="Price offers" detail="Review private proposals and accepted prices" onPress={() => router.push('/offers')}/>
          <GText weight="bold" style={styles.subhead}>Your activity</GText>
          <Menu icon="person-outline" label="Edit profile" detail="Name, bio, location and storefront" onPress={() => router.push('/edit-profile')}/><Menu icon="settings-outline" label="Settings" detail="Privacy, notifications and appearance" onPress={() => router.push('/settings')}/><Menu icon="grid-outline" label="Manage products" detail="Edit listings, stock and availability" onPress={() => router.push('/manage-products')}/><Menu icon="storefront-outline" label="Seller orders" detail="Prepare and fulfil your sales" onPress={() => router.push('/seller-orders')}/><Menu icon="document-outline" label="Purchased downloads" detail="Your digital files and licences" onPress={() => router.push('/digital-library')}/><Menu icon="location-outline" label="Delivery addresses" detail="Saved places for checkout" onPress={() => router.push('/addresses')}/><Menu icon="bag-handle-outline" label="Cart" detail="Review items you added" onPress={() => router.push('/cart')}/>
          <Menu icon="repeat" label="Reshare earnings" detail="Analytics, pending commission and payouts" onPress={() => router.push('/reshare-earnings')}/><Menu icon="receipt-outline" label="Payment activity" detail="Pending payments, retries and receipts" onPress={() => router.push('/payments')}/><Menu icon="wallet-outline" label="Wallet" detail="Balance and transactions" onPress={() => router.push('/wallet')}/>
          <Menu icon="receipt-outline" label="Orders" detail="Your purchases" onPress={() => router.push('/orders')}/>
          <Menu icon="notifications-outline" label="Alerts & messages" detail={`${conversations.length} local conversations`} onPress={() => router.push('/alerts')}/>
          <Menu icon="compass-outline" label="Explore" detail="Browse creators and products" onPress={() => router.push('/discover')}/>
          <GText weight="bold" style={styles.subhead}>Account details</GText>
          <Panel><Detail label="Email" value={account.email}/><Detail label="Phone" value={account.phone || 'Not set'}/><Detail label="Location" value={place}/><Detail label="Account" value={account.role}/></Panel>
          {user ? <Action title="Sign out" secondary icon="log-out-outline" onPress={() => void signOut().then(() => router.replace('/home'))}/> : <Action title="Sign in to your account" secondary icon="log-in-outline" onPress={() => router.push('/login')}/>}
        </Animated.View>
      </>}
    </ScrollView>
    <Sheet visible={!!photoPane} title={photoPane === 'cover' ? 'Change cover photo' : 'Profile photo / logo'} onClose={() => {
            if (!photoBusy)
                setPhotoPane(null);
        }}>
      {(photoPane === 'cover' ? photos.media.cover : avatar) ? <Image source={{ uri: (photoPane === 'cover' ? photos.media.cover : avatar) || undefined }} style={{ width: '100%', height: photoPane === 'cover' ? 160 : 180, borderRadius: 16 }} resizeMode="contain"/> : <GText tone="muted">Choose a photo that represents you or your store.</GText>}
      <Action title={photoBusy ? 'Saving photo…' : 'Choose from photos'} icon="images-outline" disabled={photoBusy || !photos.ready} onPress={() => void choosePhoto()}/>
      {photoPane && photos.media[photoPane] ? <Action title="Remove custom photo" secondary disabled={photoBusy} onPress={() => {
                const kind = photoPane;
                if (!kind)
                    return;
                setPhotoBusy(true);
                void photos.update(kind).then(() => setPhotoPane(null)).catch(e => setPhotoError(String(e))).finally(() => setPhotoBusy(false));
            }}/> : null}
      {photoError || photos.notice ? <GText accessibilityRole="alert" tone="red">{photoError || photos.notice}</GText> : null}
    </Sheet>
  </SafeAreaView>;
}
function Metric({ value, label, onPress }: {
    value: string;
    label: string;
    onPress?: () => void;
}) {
    return <Pressable disabled={!onPress} accessibilityRole="button" accessibilityLabel={label + ', ' + value} onPress={onPress} style={{ flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', gap: 3 }}><GText weight="bold" style={{ fontSize: 17 }}>{value}</GText><GText tone="muted" style={{ fontSize: 11 }}>{label}</GText></Pressable>;
}
function Empty({ icon, title, description }: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    description: string;
}) {
    const { colors } = useAppTheme();
    return <View style={styles.empty}><Ionicons name={icon} size={30} color={colors.textMuted}/><GText weight="bold">{title}</GText><GText tone="muted" style={{ textAlign: 'center' }}>{description}</GText></View>;
}
function Menu({ icon, label, detail, onPress }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    detail: string;
    onPress: () => void;
}) {
    const { colors } = useAppTheme();
    return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.menu, { borderColor: colors.border }]}><Ionicons name={icon} size={22} color={colors.text}/><View style={{ flex: 1 }}><GText weight="bold">{label}</GText><GText tone="muted" style={styles.small}>{detail}</GText></View><Ionicons name="chevron-forward" size={18} color={colors.textMuted}/></Pressable>;
}
function Detail({ label, value }: {
    label: string;
    value: string;
}) {
    return <View style={styles.detail}><GText tone="muted" style={styles.small}>{label}</GText><GText style={{ flex: 1, textAlign: 'right' }}>{value}</GText></View>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, content: { paddingHorizontal: 18, paddingBottom: 70, maxWidth: 720, width: '100%', alignSelf: 'center' }, nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 60 }, demoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 11, borderRadius: 12, marginBottom: 12 }, title: { fontSize: 25 }, tap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, stack: { gap: 16 }, cover: { height: 145, borderRadius: 18, overflow: 'hidden' }, coverCircle: { width: 230, height: 230, borderRadius: 115, borderWidth: 38, borderColor: 'rgba(255,255,255,0.15)', position: 'absolute', right: -40, bottom: -120 }, identity: { flexDirection: 'row', alignItems: 'center', marginTop: -41 }, avatar: { width: 83, height: 83, borderRadius: 42, borderWidth: 4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, avatarImage: { width: '100%', height: '100%' }, createSmall: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, height: 40, flexDirection: 'row', alignItems: 'center', gap: 5 }, name: { fontSize: 24, marginTop: 10 }, badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 13 }, badge: { borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }, tiny: { fontSize: 11 }, small: { fontSize: 12, lineHeight: 18 }, metrics: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, marginTop: 19, paddingVertical: 17 }, inline: { flexDirection: 'row', gap: 12, alignItems: 'center' }, subhead: { fontSize: 18 }, tabs: { flexDirection: 'row', marginTop: 4 }, tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2 }, empty: { alignItems: 'center', gap: 8, padding: 24 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, tile: { width: '48%', borderWidth: 1, borderRadius: 14, overflow: 'hidden' }, tileImage: { width: '100%', height: 132 }, tilePlaceholder: { alignItems: 'center', justifyContent: 'center' }, menu: { borderBottomWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 }, detail: { flexDirection: 'row', justifyContent: 'space-between', gap: 15 } });

export default function ConnectedRoute(){return FRONTEND_PREVIEW ? <PreviewProfile/> : <ServerScreen/>;}
