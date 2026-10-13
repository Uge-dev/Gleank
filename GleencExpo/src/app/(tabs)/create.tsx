import { useLive,useServerQuery,object } from '@/features/live/state';
import { api } from '@/services/api';
import { publishDraft, productDraft } from '@/features/live/publishing';
import { CommunityConsent } from '@/features/community/terms';
import { useCommunity } from '@/features/community/community-state';
import { DigitalEditor } from '@/features/digital/editor';
import { retainMedia } from '@/features/media/retain-media';
import { ScheduleControl } from '@/features/create/schedule-control';
import { scheduleLabel } from '@/features/create/scheduling';
import { pickLibrary } from '@/features/media/picker';
import { CreateOrdering } from '@/features/marketplace/create-ordering';
import { useMarketplace } from '@/features/marketplace/marketplace-state';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useAuth } from '@/hooks/use-auth';
import { Action, Choice, Field, Panel } from '@/features/create/controls';
import { CATEGORIES, categoryById } from '@/features/create/catalog';
import { blankDraft, combinations, draftErrors, type OptionName, type ProductDraft, type ProductImage, type ProductVariant } from '@/features/create/model';
import { useDrafts } from '@/features/create/draft-store';
import { FRONTEND_PREVIEW, PREVIEW_ACCOUNT_ID } from '@/config/preview';
import { FEED } from '@/features/feed/data';
const STEPS = ['Details', 'Options', 'Ordering', 'Media', 'Delivery', 'Preview'] as const;
type Step = typeof STEPS[number];
const SWATCH: Record<string, string> = { black: '#111111', white: '#FFFFFF', red: '#D82D28', yellow: '#FBE703', green: '#2BA35C', blue: '#3869C8', pink: '#E67EA7', brown: '#825039', grey: '#8C8C8C', gray: '#8C8C8C', orange: '#F28132', purple: '#8455B6' };
function OptionValues({ name, values, onChange }: {
    name: string;
    values: string[];
    onChange: (text: string) => void;
}) {
    const [input, setInput] = useState(values.join(', '));
    return <Field label={`${name} values`} value={input} onChange={value => {
            setInput(value);
            onChange(value);
        }} placeholder={name === 'Size' ? 'S, M, L, XL' : name === 'Color' ? 'Black, Cream, Red' : 'Small, Large'} note="Separate values with commas. Up to 3 option types and 60 combinations."/>;
}
export default function Create() {
    const community = useCommunity();
    const live = useLive();
    const { user } = useAuth();
    const verification = useServerQuery(()=>api.request('/me/verification'),'create-verification',!FRONTEND_PREVIEW&&!!user);
    const market = useMarketplace();
    const { colors } = useAppTheme();
    const router = useRouter();
    const { draftId, editId } = useLocalSearchParams<{
        draftId?: string;
        editId?: string;
    }>();
    const { drafts, loading, save, remove, storageAvailable } = useDrafts();
    const [draft, setDraft] = useState<ProductDraft | null>(null);
    const [step, setStep] = useState<Step>('Details');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [mediaBusy, setMediaBusy] = useState(false);
    const currentDraft = useRef(draft);
    currentDraft.current = draft;
    const [usedDraftId, setUsedDraftId] = useState('');
    const ownerId = user?.id ?? (FRONTEND_PREVIEW ? PREVIEW_ACCOUNT_ID : '');
    useEffect(() => {
        setDraft(null);
        setUsedDraftId('');
        setNotice('');
    }, [ownerId]);
    useEffect(() => {
        if (loading || !draftId || usedDraftId === draftId)
            return;
        const existing = drafts.find(item => item.id === draftId);
        if (existing) {
            setDraft(existing);
            setStep('Details');
            setNotice('');
        }
        else
            setNotice('That draft is no longer available on this device.');
        setUsedDraftId(draftId);
    }, [draftId, loading, drafts, usedDraftId]);
    useEffect(() => {
        let active=true;
        if (editId && !FRONTEND_PREVIEW && ownerId && usedDraftId !== editId) {
            void api.products.editable(editId).then(product => {if(active){setDraft(productDraft(product,ownerId));setStep('Details');setUsedDraftId(editId);}}).catch(e => {if(active)setNotice(e instanceof Error?e.message:'Unable to load product.');});
            return ()=>{active=false;};
        }
        if (FRONTEND_PREVIEW && editId && market.ready && usedDraftId !== editId) {
            try {
                setDraft(market.editDraft(editId));
                setStep('Details');
                setUsedDraftId(editId);
            }
            catch (e) {
                setNotice(e instanceof Error ? e.message : 'Listing unavailable.');
            }
        }
        return ()=>{active=false;};
    }, [editId, market.ready, usedDraftId,ownerId]);
    const category = categoryById(draft?.categoryId ?? '');
    const errors = useMemo(() => draft ? draftErrors(draft) : [], [draft]);
    const change = (patch: Partial<ProductDraft>) => setDraft(old => old ? { ...old, ...patch, state: 'draft' } : old);
    const updateVariant = (key: string, patch: Partial<ProductVariant>) => change({ variants: draft?.variants.map(row => row.key === key ? { ...row, ...patch } : row) });
    function toggleOption(name: string) {
        if (!draft)
            return;
        const exists = draft.options.some(option => option.name === name);
        const next = exists ? draft.options.filter(option => option.name !== name) : [...draft.options, { name: name as OptionName, values: [] }];
        change({ options: next, variants: combinations(next, draft.variants) });
    }
    function setOptionValues(name: string, text: string) {
        if (!draft)
            return;
        const values = [...new Set(text.split(',').map(value => value.trim()).filter(Boolean))].slice(0, 12);
        const next = draft.options.map(option => option.name === name ? { ...option, values } : option);
        change({ options: next, variants: combinations(next, draft.variants) });
    }
    async function pickMedia(kind: 'images' | 'videos') {
        if (!draft || mediaBusy)
            return;
        const draftIdentity = draft.id + ':' + draft.ownerId;
        setMediaBusy(true);
        const stillEditing = () => currentDraft.current && currentDraft.current.id + ':' + currentDraft.current.ownerId === draftIdentity;
        try {
            // Load after the button is tapped, so existing development builds can still display this screen.
            if (kind === 'images' && draft.images.length >= 8) {
                setNotice('You already have eight photos. Remove one before choosing more.');
                return;
            }
            const assets = await pickLibrary(kind, kind === 'images' ? 8 - draft.images.length : 1);
            if (!assets.length)
                return;
            if (kind === 'videos') {
                const videoUri = await retainMedia(assets[0].uri);
                if (stillEditing())
                    change({ videoUri, videoAsset: undefined });
            }
            else {
                const selected: ProductImage[] = await Promise.all(assets.map(async (asset: {
                    uri: string;
                }, index: number) => ({ id: `${Date.now()}-${index}`, uri: await retainMedia(asset.uri), color: '' })));
                if (stillEditing())
                    change({ images: [...draft.images, ...selected].slice(0, 8) });
            }
        }
        catch (error) {
            if (stillEditing())
                setNotice(error instanceof Error ? error.message : 'Unable to choose media. Try again.');
        }
        finally {
            setMediaBusy(false);
        }
    }
    async function persist(ready = false) {
        if (!draft)
            return;
        if (ready && errors.length) {
            setStep('Preview');
            setNotice(`Please fix: ${errors[0]}`);
            return;
        }
        setBusy(true);
        try {
            const next: ProductDraft = { ...draft, state: ready ? 'ready' : 'draft' };
            await save(next);
            setDraft(next);
            if(!FRONTEND_PREVIEW && next.name.trim().length>=2 && next.description.trim() && next.categoryId && await live.ensure()) {
                const record=await publishDraft(next,'draft');
                const synced={...next,publishedId:record.id};await save(synced);setDraft(synced);live.changed();setNotice('Draft saved to your account. It is not published.');
            } else setNotice(ready ? 'Draft saved. Review it before publishing.' : 'Draft saved on this device.');
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : 'Could not save the draft.');
        }
        finally {
            setBusy(false);
        }
    }
    if (!ownerId)
        return <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}><View style={styles.center}>
    <Ionicons name="create-outline" size={55} color={colors.primary}/><GText weight="bold" style={styles.large}>Share something worth discovering</GText>
    <GText tone="muted" style={styles.centerText}>Explore the feed freely. Sign in to create and save listings.</GText>
    <Action title="Sign in" onPress={() => router.push('/login')}/><Action title="Create account" secondary onPress={() => router.push('/signup')}/>
  </View></SafeAreaView>;
    return <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.header}><View><GText tone="red" weight="bold" style={styles.eyebrow}>GLEENC STUDIO</GText><GText weight="bold" style={styles.large}>Create</GText></View>
        {draft ? <Pressable accessibilityRole="button" accessibilityLabel="Close editor" onPress={() => {
                setDraft(null);
                setNotice('');
            }} style={styles.close}><Ionicons name="close" size={24} color={colors.text}/></Pressable> : null}</View>
      {!FRONTEND_PREVIEW ? <Panel><GText weight="bold">Seller verification · Tier {object(verification.data).tier || 0}</GText><GText>Current limit: ₦{Number(object(verification.data).limitKobo || 0)/100}</GText><Action title="View verification / Upgrade" secondary onPress={()=>router.push('/verification' as any)}/></Panel> : null}
      {!draft ? <Animated.View entering={FadeInDown.duration(300)} style={styles.stack}>
        <GText tone="muted">Show your product your way. Start a listing, then come back to your drafts any time.</GText>
        <Panel><Ionicons name="images-outline" color={colors.primary} size={29}/><GText weight="bold" style={styles.h2}>Original product</GText><GText tone="muted">List a physical or digital product with photos or a short video.</GText>
          <Action title="Create a product" icon="arrow-forward" onPress={() => {
                setDraft(blankDraft(ownerId));
                setStep('Details');
                setNotice('');
            }}/></Panel>
        <Panel><Ionicons name="repeat-outline" color={colors.primary} size={25}/><GText weight="bold" style={styles.h2}>Reshare to earn</GText><GText tone="muted">Choose an eligible listing from Explore. Choose an eligible seller listing and set a markup of up to 20%.</GText><Action title="Browse listings" secondary onPress={() => router.push('/discover')}/></Panel>
        <Panel><Ionicons name="megaphone-outline" color={colors.primary} size={25}/><GText weight="bold" style={styles.h2}>Promote a listing</GText><GText tone="muted">Share your eligible listings through posts and messages. Paid placement is not currently available.</GText></Panel>
        {notice ? <GText accessibilityRole="alert" tone="red">{notice}</GText> : null}
        {market.scheduled.filter(p => p.ownerId === ownerId).length ? <><GText weight="bold" style={styles.h2}>Scheduled posts</GText>{market.scheduled.filter(p => p.ownerId === ownerId).sort((a, b) => a.publishAt - b.publishAt).map(p => <Panel key={p.id}><GText weight="bold">{p.item.name}</GText><GText tone="muted">{scheduleLabel(p.publishAt)}</GText><View style={styles.wrap}><Action title="Edit schedule" secondary onPress={() => {
                        const source = drafts.find(d => 'POST-' + d.id === p.id);
                        if (source) {
                            setDraft({ ...source, scheduledAt: p.publishAt });
                            setStep('Preview');
                            setNotice('');
                        }
                        else
                            setNotice('The draft is unavailable. Cancel this schedule to replace it.');
                    }}/><Action title="Cancel" secondary onPress={() => {
                        try {
                            market.cancelSchedule(p.id);
                            setNotice('Schedule cancelled. Your draft is kept.');
                        }
                        catch (e) {
                            setNotice(String(e));
                        }
                    }}/></View></Panel>)}</> : null}
        <GText weight="bold" style={styles.h2}>Your drafts</GText>
        {loading ? <GText tone="muted">Loading drafts…</GText> : !drafts.length ? <GText tone="muted">Your product drafts will appear here.</GText> : drafts.map(item => <Pressable key={item.id} onPress={() => {
                    setDraft(item);
                    setStep('Details');
                }} style={[styles.draftRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {item.images[0] ? <Image source={{ uri: item.images[0].uri }} style={styles.draftImage}/> : <Ionicons name="cube-outline" color={colors.primary} size={25}/>}
          <View style={{ flex: 1 }}><GText weight="bold" numberOfLines={1}>{item.name || 'Untitled product'}</GText><GText tone="muted" style={styles.small}>{item.state === 'ready' ? 'Ready to submit' : 'Draft'} · {new Date(item.updatedAt).toLocaleDateString()}</GText></View>
          <Ionicons name="chevron-forward" size={19} color={colors.textMuted}/></Pressable>)}
        {!storageAvailable ? <GText tone="muted" style={styles.small}>Drafts work for this session. Install AsyncStorage and rebuild to keep them after restarting.</GText> : null}
      </Animated.View> : <>
        <View style={styles.steps}>{STEPS.map((label, index) => <Pressable key={label} onPress={() => {
                    setStep(label);
                    setNotice('');
                }} style={{ alignItems: 'center', flex: 1 }} accessibilityRole="button"><View style={[styles.stepDot, { backgroundColor: label === step || STEPS.indexOf(step) > index ? colors.text : colors.surfaceSecondary, borderWidth: label === step ? 2 : 0, borderColor: colors.primary }]}><GText weight="bold" style={{ color: label === step || STEPS.indexOf(step) > index ? colors.background : colors.textMuted, fontSize: 12 }}>{index + 1}</GText></View><GText weight="bold" style={{ color: label === step ? colors.text : colors.textMuted, fontSize: 10, marginTop: 5 }} numberOfLines={1}>{label}</GText></Pressable>)}</View>
        <Animated.View key={step} entering={FadeInRight.duration(220)} style={styles.stack}>
          {step === 'Details' ? <>
            <GText weight="bold" style={styles.h2}>What are you listing?</GText>
            <GText tone="muted">Select the media format first. Every listing needs a cover image.</GText>
            <View style={styles.wrap}><Choice title="Images" icon="images-outline" active={draft.presentation === 'image'} onPress={() => change({ presentation: 'image' })}/><Choice title="Short video" icon="videocam-outline" active={draft.presentation === 'video'} onPress={() => change({ presentation: 'video' })}/></View>
            <GText weight="bold">What are you selling?</GText><View style={styles.wrap}><Choice title="Physical product" active={draft.productType !== 'digital'} onPress={() => change({ productType: 'physical', categoryId: '', subcategory: '', digital: undefined, digitalFiles: [] })}/><Choice title="Digital download" active={draft.productType === 'digital'} onPress={() => change({ productType: 'digital', categoryId: 'digital', subcategory: '', options: [], variants: [], catalogueId: undefined, orderingPlan: undefined, pickup: false, localDelivery: false, interstate: false, baseStock: '1000' })}/></View>
            <GText weight="bold">Category</GText><View style={styles.wrap}>{CATEGORIES.filter(c => draft.productType === 'digital' ? c.id === 'digital' : c.id !== 'digital').map(item => <Choice key={item.id} title={item.name} icon={item.icon as keyof typeof Ionicons.glyphMap} active={item.id === draft.categoryId} onPress={() => change({ categoryId: item.id, subcategory: '', attributes: {}, options: [], variants: [], colorHex: {} })}/>)}</View>
            {category ? <><GText weight="bold">Subcategory</GText><View style={styles.wrap}>{category.subcategories.map(item => <Choice key={item} title={item} active={draft.subcategory === item} onPress={() => change({ subcategory: item })}/>)}</View></> : null}
            <Field label="Product name *" value={draft.name} onChange={name => change({ name })} placeholder="What do you call it?"/>
            <Field label="Short feed caption *" value={draft.shortDescription} onChange={shortDescription => change({ shortDescription })} placeholder="A quick reason to stop scrolling"/>
            <Field label="Full description *" multiline value={draft.description} onChange={description => change({ description })} placeholder="Condition, what is included, features, care or ingredients"/>
            {category?.attributes.map(field => <Field key={field.key} label={`${field.label}${field.required ? ' *' : ''}`} value={draft.attributes[field.key] ?? ''} onChange={value => change({ attributes: { ...draft.attributes, [field.key]: value } })} placeholder={field.hint}/>)}
          </> : null}
          {step === 'Options' ? <>
            <GText weight="bold" style={styles.h2}>Pricing and choices</GText><GText tone="muted">Buyers will choose an available combination before adding to cart. Enter prices in naira (₦).</GText>
            <View style={styles.row}><Field label="Base price ₦ *" value={draft.basePrice} onChange={basePrice => change({ basePrice })} keyboardType="decimal-pad" placeholder="3500"/><Field label="Stock *" value={draft.baseStock} onChange={baseStock => change({ baseStock })} keyboardType="number-pad" placeholder="12" note="Used when there are no options"/></View>
            <Field label="Seller SKU (optional)" value={draft.sellerSku} onChange={sellerSku => change({ sellerSku })} placeholder="Your internal item code"/>
            <GText weight="bold">Available options</GText><View style={styles.wrap}>{(category?.options ?? ['Size', 'Color', 'Style']).map(item => <Choice key={item} title={item} active={draft.options.some(option => option.name === item)} onPress={() => toggleOption(item)}/>)}</View>
            {draft.options.map(option => <View key={option.name} style={styles.stack}><OptionValues name={option.name} values={option.values} onChange={value => setOptionValues(option.name, value)}/>
              {option.name === 'Color' ? option.values.map(value => <View key={value} style={styles.colorRow}><View style={[styles.swatch, { backgroundColor: /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(draft.colorHex[value] ?? '') ? draft.colorHex[value] : SWATCH[value.toLowerCase()] || '#999999', borderColor: colors.border }]}/><Field label={`${value} swatch (hex)`} value={draft.colorHex[value] ?? ''} onChange={hex => change({ colorHex: { ...draft.colorHex, [value]: hex } })} placeholder="#F2E4C9"/></View>) : null}
            </View>)}
            {draft.variants.length ? <><GText weight="bold">Stock by combination</GText><GText tone="muted" style={styles.small}>Variant price can be empty to use the base price. A zero-stock choice is unavailable to buy.</GText>{draft.variants.map(row => <Panel key={row.key}><GText weight="bold">{Object.values(row.labels).join(' / ')}</GText><View style={styles.row}><Field label="Stock *" value={row.stock} onChange={stock => updateVariant(row.key, { stock })} keyboardType="number-pad"/><Field label="Price ₦" value={row.price} onChange={price => updateVariant(row.key, { price })} keyboardType="decimal-pad"/></View><Field label="SKU" value={row.sku} onChange={sku => updateVariant(row.key, { sku })}/></Panel>)}</> : null}
          </> : null}
          {step === 'Ordering' ? draft.productType === 'digital' ? <DigitalEditor draft={draft} onChange={change}/> : <CreateOrdering draft={draft} onChange={change}/> : null}
          {step === 'Media' ? <>
            <GText weight="bold" style={styles.h2}>Show the product</GText><GText tone="muted">Add up to eight photos. The first photo is the cover. Attach a video for a video post; preview its cover here.</GText>
            <Action title={mediaBusy ? "Choosing media…" : "Choose photos"} icon="images-outline" disabled={mediaBusy} secondary onPress={() => void pickMedia('images')}/>
            {draft.presentation === 'video' ? <Action title={draft.videoUri ? 'Change video' : 'Choose short video'} icon="videocam-outline" disabled={mediaBusy} secondary onPress={() => void pickMedia('videos')}/> : null}
            {FRONTEND_PREVIEW ? <Action title="Try sample media" secondary icon="sparkles-outline" onPress={() => {
                        const example = FEED.find(item => draft.presentation === 'video' ? item.kind === 'video' : item.kind === 'product');
                        if (!example)
                            return;
                        change({ images: (example.images?.length ? example.images : [example.image]).map((uri, index) => ({ id: `sample-${index}`, uri, color: '' })), videoUri: draft.presentation === 'video' ? example.videoUrl ?? '' : '', videoAsset: draft.presentation === 'video' ? example.videoAsset : undefined });
                        setNotice('Sample media added for design testing.');
                    }}/> : null}
            {draft.videoUri ? <GText tone="muted" numberOfLines={1}>Video selected: {draft.videoUri.split('/').pop()}</GText> : null}
            {draft.images.map((item, index) => <Panel key={item.id}><View style={styles.mediaRow}><Image source={{ uri: item.uri }} style={styles.thumbnail}/><View style={{ flex: 1, gap: 8 }}><GText weight="bold">{index === 0 ? 'Cover image' : `Photo ${index + 1}`}</GText><View style={styles.wrap}><Pressable onPress={() => {
                        const images = [...draft.images];
                        if (index > 0) {
                            [images[index - 1], images[index]] = [images[index], images[index - 1]];
                            change({ images });
                        }
                    }} accessibilityLabel="Move photo earlier"><Ionicons name="arrow-back-circle-outline" size={27} color={colors.text}/></Pressable><Pressable onPress={() => {
                        const images = [...draft.images];
                        if (index < images.length - 1) {
                            [images[index + 1], images[index]] = [images[index], images[index + 1]];
                            change({ images });
                        }
                    }} accessibilityLabel="Move photo later"><Ionicons name="arrow-forward-circle-outline" size={27} color={colors.text}/></Pressable><Pressable onPress={() => change({ images: draft.images.filter(x => x.id !== item.id) })} accessibilityLabel="Remove photo"><Ionicons name="trash-outline" size={24} color={colors.primary}/></Pressable></View></View></View>
              {draft.options.find(option => option.name === 'Color')?.values.length ? <><GText tone="muted" style={styles.small}>Which color does this photo show?</GText><View style={styles.wrap}><Choice title="All colors" active={!item.color} onPress={() => change({ images: draft.images.map(x => x.id === item.id ? { ...x, color: '' } : x) })}/>{draft.options.find(option => option.name === 'Color')?.values.map(color => <Choice key={color} title={color} active={item.color === color} onPress={() => change({ images: draft.images.map(x => x.id === item.id ? { ...x, color } : x) })}/>)}</View></> : null}
            </Panel>)}
            <GText tone="muted" style={styles.small}>Selected media is kept in app storage for drafts and scheduled posts. Production publication will upload it to the seller service.</GText>
          </> : null}
          {step === 'Delivery' ? draft.productType === 'digital' ? <Panel><GText weight="bold">Instant digital access</GText><GText tone="muted">Buyers open their purchased files from the library after payment. No address or delivery QR is required.</GText></Panel> : <>
            <GText weight="bold" style={styles.h2}>Where and how?</GText><GText tone="muted">Choose at least one fulfillment method. Enter the exact area buyers can expect.</GText>
            <View style={styles.wrap}><Choice title="Pickup" active={draft.pickup} onPress={() => change({ pickup: !draft.pickup })}/><Choice title="Local delivery" active={draft.localDelivery} onPress={() => change({ localDelivery: !draft.localDelivery })}/><Choice title="Interstate shipping" active={draft.interstate} onPress={() => change({ interstate: !draft.interstate })}/></View>
            {draft.pickup ? <Field label="Pickup area *" value={draft.pickupArea} onChange={pickupArea => change({ pickupArea })} placeholder="Campus gate, Lagos"/> : null}
            {(draft.localDelivery || draft.interstate) ? <Field label="Dispatch area *" value={draft.dispatchArea} onChange={dispatchArea => change({ dispatchArea })} placeholder="Where does it ship from?"/> : null}
            {draft.localDelivery ? <Field label="Local delivery fee ₦" value={draft.localFee} onChange={localFee => change({ localFee })} keyboardType="decimal-pad" placeholder="Leave empty if calculated later"/> : null}
            <Field label="Preparation or dispatch time" value={draft.deliveryTime} onChange={deliveryTime => change({ deliveryTime })} placeholder="E.g. ready within 24 hours"/>
            <Field label="Handling notes" multiline value={draft.handling} onChange={handling => change({ handling })} placeholder="Packaging, fragility or special instructions"/>
          </> : null}
          {step === 'Preview' ? <>
            <GText weight="bold" style={styles.h2}>Listing preview</GText><GText tone="muted">Review the post, then publish now or choose a scheduled time.</GText>
            <View style={[styles.preview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {draft.images[0] ? <Image source={{ uri: draft.images[0].uri }} style={styles.hero} resizeMode="cover"/> : <View style={[styles.hero, styles.placeholder, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name="image-outline" size={40} color={colors.textMuted}/></View>}
              {draft.presentation === 'video' ? <View style={styles.videoBadge}><Ionicons name="play" size={15} color="#FFFFFF"/><GText tone="white">Video post</GText></View> : null}
              <View style={{ padding: 16, gap: 9 }}><GText weight="bold" style={styles.h2}>{draft.name || 'Product name'}</GText><GText tone="red" weight="bold" style={{ fontSize: 18 }}>₦{Number(draft.basePrice || 0).toLocaleString()}</GText><GText tone="muted">{draft.shortDescription || 'Short feed description goes here.'}</GText><GText>{draft.description || 'Full product description goes here.'}</GText>
                {category ? <GText tone="muted">{category.name} · {draft.subcategory || 'Select a subcategory'}</GText> : null}
                {draft.options.map(option => <View key={option.name} style={styles.wrap}><GText weight="bold">{option.name}:</GText><GText>{option.values.join(' · ') || 'Add values'}</GText></View>)}
                <GText tone="muted">{draft.pickup ? `Pickup: ${draft.pickupArea || 'area needed'}  ` : ''}{draft.localDelivery ? 'Local delivery  ' : ''}{draft.interstate ? 'Shipping' : ''}</GText></View>
            </View>
            {errors.length ? <Panel><GText weight="bold" style={{ color: colors.primary }}>Complete before submission</GText>{errors.map((error, i) => <GText key={`${i}-${error}`} tone="muted">• {error}</GText>)}</Panel> : <Panel><Ionicons name="checkmark-circle" size={28} color={colors.success}/><GText weight="bold">Looks ready</GText><GText tone="muted">You can mark this draft ready for the future backend review flow.</GText></Panel>}
          </> : null}
          {notice ? <GText accessibilityRole="alert" style={{ color: colors.primary }}>{notice}</GText> : null}
          <View style={styles.row}>
            {step !== 'Details' ? <View style={{ flex: 1 }}><Action title="Back" secondary onPress={() => {
                    setStep(STEPS[STEPS.indexOf(step) - 1]);
                    setNotice('');
                }}/></View> : null}
            <View style={{ flex: 1 }}><Action title={step === 'Preview' ? 'Mark ready' : 'Next'} disabled={busy} onPress={() => step === 'Preview' ? void persist(true) : (setStep(STEPS[STEPS.indexOf(step) + 1]), setNotice(''))}/></View>
          </View>
          {step === 'Preview' ? <><CommunityConsent /><ScheduleControl value={draft.scheduledAt} onChange={scheduledAt => change({ scheduledAt })}/><Action title={draft.publishedId ? 'Save published changes' : draft.scheduledAt ? 'Schedule post' : 'Publish now'} icon={draft.scheduledAt ? 'calendar-outline' : 'paper-plane-outline'} disabled={busy || (FRONTEND_PREVIEW ? !community.accepted : live.account?.termsVersion !== live.capabilities.termsVersion)} onPress={() => {
                    if (busy)
                        return;
                    setBusy(true);
                    void (async () => {
                        try {
                            if (errors.length)
                                throw new Error(errors.join(' '));
                            await save(draft);
                            if (!FRONTEND_PREVIEW) {
                                if (!(await live.ensure())) return;
                                const product=await publishDraft(draft,draft.scheduledAt?'schedule':'publish');
                                live.changed(); await remove(draft.id);setDraft(null);
                                router.push({pathname:'/product',params:{productId:product.id}});return;
                            }
                            if (draft.scheduledAt) {
                                community.assertPosting();
                                const queued = market.schedule(draft, draft.scheduledAt);
                                setNotice('Scheduled for ' + scheduleLabel(queued.publishAt));
                                setDraft(null);
                            }
                            else {
                                community.assertPosting();
                                const post = market.publish(draft);
                                setDraft(null);
                                router.push({ pathname: '/product', params: { id: post.id } });
                            }
                        }
                        catch (e) {
                            setNotice(e instanceof Error ? e.message : 'Unable to publish.');
                        }
                        finally {
                            setBusy(false);
                        }
                    })();
                }}/></> : null}
          <Action title={busy ? 'Saving…' : 'Save draft'} icon="bookmark-outline" secondary disabled={busy} onPress={() => void persist(false)}/>
          <Pressable accessibilityRole="button" onPress={() => Alert.alert('Delete draft?', 'This removes the draft from this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => {
                        void remove(draft.id).then(() => {
                            setDraft(null);
                            setNotice('');
                        }).catch(error => setNotice(String(error)));
                    } }])} style={styles.delete}><GText tone="muted">Delete this draft</GText></Pressable>
        </Animated.View>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, content: { padding: 18, paddingBottom: 90, gap: 20, maxWidth: 720, width: '100%', alignSelf: 'center' }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, previewBanner: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 12, borderRadius: 13 }, eyebrow: { fontSize: 10, letterSpacing: 2 }, large: { fontSize: 27, lineHeight: 35 }, h2: { fontSize: 20 }, small: { fontSize: 12, lineHeight: 18 }, stack: { gap: 17 }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, row: { flexDirection: 'row', gap: 10 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 25 }, centerText: { textAlign: 'center' }, close: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }, steps: { flexDirection: 'row', gap: 2 }, stepDot: { height: 27, width: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, draftRow: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, draftImage: { width: 48, height: 48, borderRadius: 9 }, mediaRow: { flexDirection: 'row', gap: 15 }, thumbnail: { width: 110, height: 110, borderRadius: 12 }, colorRow: { flexDirection: 'row', gap: 10, alignItems: 'center' }, swatch: { height: 30, width: 30, borderRadius: 15, borderWidth: 1 }, preview: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' }, hero: { height: 275, width: '100%' }, placeholder: { justifyContent: 'center', alignItems: 'center' }, videoBadge: { position: 'absolute', top: 12, left: 12, paddingVertical: 5, paddingHorizontal: 9, flexDirection: 'row', gap: 5, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.7)' }, delete: { alignItems: 'center', padding: 12 } });
