import { useEffect, useMemo, useRef,useState } from 'react';
import { Image, Platform,Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/services/api';
import { getApiErrorMessage } from '@/services/api-client';
import type { Product, Selection, Quote, Checkout } from '@/services/gleenc-api';
import { useAuth } from '@/hooks/use-auth';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useLive, useServerQuery, object, rows } from './state';
import { Page, Card, Heading, Button, Input, Chips, GText, Action, QueryState, Member, Money, Notice } from './ui';
import { pendingKey } from './pending';
import * as WebBrowser from 'expo-web-browser';
export function OrderBuilder({ productId, postId, offerId, initialQuantity = 1, initialSelection, onClose }: {
    productId: string;
    postId?: string;
    offerId?: string;
    initialQuantity?: number;
    initialSelection?: Selection;
    onClose?: () => void;
}) {
    const {user}=useAuth();const [quoteError,setQuoteError]=useState('');const live = useLive(), router = useRouter(), productQuery = useServerQuery(() => api.products.get(productId), 'ordering:' + productId), product = productQuery.data;
    const [quantity, setQuantity] = useState(initialQuantity), [variantId, setVariant] = useState(initialSelection?.variantId || ''), [components, setComponents] = useState<Record<string, number>>(Object.fromEntries((initialSelection?.components || []).map(c => [c.id, c.quantity]))), [quote, setQuote] = useState<Quote | null>(null), [added, setAdded] = useState<string | null>(null);
    useEffect(() => { if (product?.ordering?.components?.length && !initialSelection)
        setComponents(Object.fromEntries(product.ordering.components.filter(c => (c.min || 0) > 0).map(c => [c.id, c.min!]))); }, [product?.id]);
    useEffect(() => { setQuote(null); setAdded(null); }, [quantity, variantId, components, productId]);
    const variantLabel = (v: NonNullable<Product['variants']>[number]) => Object.entries(v.labels || { Size: v.size, Color: v.color }).filter(([, value]) => value).map(([name, value]) => name + ': ' + value).join(' · ') || v.id;
    const selection: Selection = { productId, quantity, ...(postId ? { postId } : {}), ...(offerId ? { offerId } : {}), ...(variantId ? { variantId } : {}), components: Object.entries(components).filter(([, quantity]) => quantity > 0).map(([id, quantity]) => ({ id, quantity })) };
    const selectionKey=JSON.stringify(selection),latestSelection=useRef(selectionKey);latestSelection.current=selectionKey;
    useEffect(()=>{let active=true;setQuoteError('');if(!product||!user||(product.variants?.length&&!variantId))return;const timer=setTimeout(()=>{void api.quote(selection).then(result=>{if(active&&latestSelection.current===selectionKey)setQuote(result);}).catch(error=>{if(active)setQuoteError(getApiErrorMessage(error));});},350);return()=>{active=false;clearTimeout(timer);};},[selectionKey,product?.id,product?.version,user?.id]);
    return <Card><Heading>{product?.name || 'Choose your order'}</Heading><QueryState query={productQuery}>{product ? <>
 <GText>{product.description}</GText><Money amount={product.priceKobo}/>
 <Input label={`Quantity (${product.ordering?.unit || 'piece'})`} value={String(quantity)} onChange={v => setQuantity(/^\d+$/.test(v) ? Math.max(1, Math.min(product.stock, Number(v))) : 1)} numeric/>
 {product.variants?.length ? <><Heading>Choose a variant</Heading><Chips items={product.variants.map(variantLabel)} value={product.variants.find(v => v.id === variantId) ? variantLabel(product.variants.find(v => v.id === variantId)!) : ''} onChange={label => setVariant(product.variants?.find(v => variantLabel(v) === label)?.id || '')}/></> : null}
 {product.ordering?.groups?.map(g=><GText key={g.name} tone="muted">{g.name}: choose {g.min}–{g.max} units</GText>)}{product.ordering?.components?.map(c => <View key={c.id} style={{ gap: 7 }}>{c.photoUrl?<Image source={{uri:c.photoUrl}} style={{height:160,borderRadius:14}}/>:null}<GText weight="bold">{c.name} · {c.unit}{c.required ? ' · Required' : ''}</GText><Money amount={c.priceKobo}/><GText tone="muted">{c.unitDescription}</GText><Input label={`How many ${c.unit} of ${c.name}?`} value={String(components[c.id] ?? c.min ?? 0)} onChange={v => setComponents(values => ({ ...values, [c.id]: /^\d+$/.test(v) ? Math.min(c.max ?? 99, Number(v)) : 0 }))} numeric/></View>)}
 <Notice text={quoteError}/><Action title="Refresh total" run={async () => { const result = await live.perform(() => api.quote(selection)); if (result&&latestSelection.current===selectionKey){setQuote(result);setQuoteError('');} }}/>
 {quote ? <><Heading>Your total</Heading><GText>Seller amount</GText><Money amount={quote.sellerKobo}/>{quote.commissionKobo > 0 ? <><GText>Reshare markup</GText><Money amount={quote.commissionKobo}/></> : null}<GText>Platform fee</GText><Money amount={quote.platformKobo}/><Money amount={quote.totalKobo}/><GText tone="muted">Delivery charges, if applicable, are confirmed at checkout.</GText></> : null}
 <Action title={added ? 'Added to cart' : 'Add to cart'} disabled={!quote || !!added} run={async () => { const result = await live.perform(() => api.cart.add(selection)); if (result)
            setAdded(result.lineId); }}/>
 {added ? <><Button title="Checkout this product" onPress={() => { onClose?.(); router.push({ pathname: '/checkout', params: { lineIds: added } }); }}/><Button title="Continue browsing" secondary onPress={() => { onClose?.(); }}/></> : null}
 </> : null}</QueryState></Card>;
}
export function CartPage() {
    const { user } = useAuth(), live = useLive(), router = useRouter(), query = useServerQuery(() => api.cart.list(), 'cart', !!user), [selected, setSelected] = useState<string[]>([]);
    const entries = rows(query.data), valid = selected.filter(id => entries.some(r => r.lineId === id && r.available));
    const total = entries.filter(r => valid.includes(r.lineId)).reduce((sum, r) => sum + (r.totalKobo || 0), 0);
    return <Page title="Your cart"><Member><QueryState query={query}>{entries.length ? entries.map(row => <Card key={row.lineId}><View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}><View style={{ flex: 1 }}><Heading>{row.product?.name || 'Product'}</Heading><GText>{row.quantity} {row.product?.ordering?.unit || 'items'}</GText><Money amount={row.totalKobo}/></View><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: valid.includes(row.lineId) }} accessibilityLabel={`Select ${row.product?.name}`} onPress={() => setSelected(ids => ids.includes(row.lineId) ? ids.filter(id => id !== row.lineId) : [...ids, row.lineId])}><Ionicons name={valid.includes(row.lineId) ? 'checkbox' : 'square-outline'} size={28} color={valid.includes(row.lineId) ? '#258A65' : '#888888'}/></Pressable></View>{!row.available ? <Notice text={row.error || 'This item is unavailable. Remove it or review its options.'}/> : null}<View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Action title="−" secondary disabled={!row.available||row.quantity <= 1} run={async () => { await live.perform(() => api.cart.update(row.lineId, { ...row.input, quantity: row.quantity - 1 })); query.refresh(); }}/></View><View style={{ flex: 1 }}><Action title="+" secondary disabled={!row.available} run={async () => { await live.perform(() => api.cart.update(row.lineId, { ...row.input, quantity: row.quantity + 1 })); query.refresh(); }}/></View></View><Action title="Remove" secondary run={async () => { await live.perform(() => api.cart.remove(row.lineId)); setSelected(ids => ids.filter(id => id !== row.lineId)); query.refresh(); }}/></Card>) : <Card><Heading>Your cart is empty</Heading><Button title="Discover products" onPress={() => router.push('/home')}/></Card>}</QueryState><Card><GText>{valid.length} selected</GText><Money amount={total}/><Button title="Checkout selected items" disabled={!valid.length} onPress={() => router.push({ pathname: '/checkout', params: { lineIds: valid.join(',') } })}/></Card></Member></Page>;
}
export function CheckoutPage() {
    const { user } = useAuth(), live = useLive(), router = useRouter(), params = useLocalSearchParams<{
        lineIds?: string;
        productId?: string;
        postId?: string;
        quantity?: string;
        offerId?: string;
    }>();
    const [method, setMethod] = useState('paystack'), [address, setAddress] = useState({ name: user?.name || '', phone: user?.phone || '', address: '', city: user?.city || '', state: user?.state || '', country: 'Nigeria' });
    const cartQuery = useServerQuery(() => api.cart.list(), 'checkout-cart', !!user), addresses = useServerQuery(() => api.account.addresses(), 'checkout-addresses', !!user);
    const lineIds = typeof params.lineIds === 'string' ? params.lineIds.split(',').filter(Boolean) : [];
    const entries = rows(cartQuery.data).filter(r => lineIds.includes(r.lineId));
    const direct = params.productId ? { productId: params.productId, quantity: Number(params.quantity || 1), ...(params.postId ? { postId: params.postId } : {}), ...(params.offerId ? { offerId: params.offerId } : {}) } : null;
    const digital = entries.some(r => r.product?.kind === 'digital'),nativeDigital=Platform.OS!=='web'&&digital&&!live.capabilities.digitalNativeBilling;
    return <Page title="Checkout"><Member><QueryState query={cartQuery}><Card><Heading>Selected products</Heading>{entries.map(row => <View key={row.lineId}><GText>{row.product?.name} × {row.quantity}</GText><Money amount={row.totalKobo}/></View>)}{direct ? <GText>Review your direct product order before payment.</GText> : null}</Card></QueryState>
 {nativeDigital ? <Notice text="Digital purchases are not currently available in this mobile app. Your existing purchases remain available in your digital library."/> : null}
 <Card><Heading>Delivery address</Heading><QueryState query={addresses}>{rows(addresses.data).map(a => <Button key={a.id} secondary title={`${a.label}: ${a.address}`} onPress={() => setAddress({ name: a.name, phone: a.phone, address: a.address, city: a.city, state: a.state, country: a.country })}/>)}</QueryState>{Object.entries(address).map(([key, value]) => <Input key={key} label={key === 'address' ? 'Street address' : key[0].toUpperCase() + key.slice(1)} value={value} onChange={v => setAddress(a => ({ ...a, [key]: v }))}/>)}</Card>
 <Card><Heading>Payment method</Heading><Chips items={['paystack', 'wallet']} value={method} onChange={setMethod}/><GText>Payment is confirmed by Gleenc’s backend. Seller proceeds stay held until fulfilment and applicable checks are complete.</GText><Action title="Review final total" disabled={nativeDigital || (!direct && !lineIds.length)} run={async () => {
            if (!(await live.ensure()) || !user)
                return;
            const input = { ...(direct ? { items: [direct] } : { cartLineIds: lineIds }), address, method: method as 'wallet' | 'paystack' };
            const pending = await pendingKey(user.id, 'checkout', input);
            const checkout = await live.perform(() => api.checkout.create(input, pending.key));
            if (checkout) {
                await pending.finish();
                router.replace({ pathname: '/payment', params: { id: checkout.id } });
            }
        }}/></Card></Member></Page>;
}
export function PaymentPage() {
    const { id } = useLocalSearchParams<{
        id?: string;
    }>(), live = useLive(), router = useRouter(), query = useServerQuery(() => api.checkout.get(id || ''), 'payment:' + id, !!id);
    const checkout = query.data;
    const after = async (value: Checkout | undefined) => { query.refresh(); if (value?.status === 'paid') {
        live.changed();
        router.replace({ pathname: '/order-success', params: { checkoutId: value.id } });
    } };
    return <Page title="Complete payment"><Member><QueryState query={query}>{checkout ? <Card><Heading>Final total</Heading><Money amount={checkout.amountKobo}/><GText>Status: {checkout.status}</GText>{checkout.items.map((q, i) => <View key={i}><GText>{q.product.name} × {q.quantity}</GText><Money amount={q.totalKobo}/></View>)}{checkout.status !== 'paid' && checkout.status !== 'cancelled' ? <>
 {checkout.method === 'wallet' ? <Action title="Pay from wallet" run={async () => after(await live.perform(() => api.checkout.payWallet(checkout.id)))}/> : <Action title="Open secure payment" run={async () => {
                        const next = await live.perform(() => api.checkout.initialize(checkout.id));
                        if (!next?.authorizationUrl)
                            return;
                        const url = new URL(next.authorizationUrl);
                        if (url.protocol !== 'https:' || !['checkout.paystack.com', 'paystack.com'].includes(url.hostname))
                            throw new Error('The payment provider returned an untrusted payment address.');
                        await WebBrowser.openBrowserAsync(next.authorizationUrl);
                        await after(await live.perform(() => api.checkout.verify(checkout.id)));
                    }}/>}<Action title="Check payment status" secondary run={async () => after(await live.perform(() => api.checkout.verify(checkout.id)))}/><Action title="Cancel checkout" secondary run={async () => { await live.perform(() => api.checkout.cancel(checkout.id)); query.refresh(); }}/>
 </> : <Button title="View orders" onPress={() => router.push('/orders')}/>}</Card> : null}</QueryState></Member></Page>;
}
export function OrderSuccessPage() { const router = useRouter(); return <Page title="Order status"><Card><Heading>Track your purchase</Heading><GText>Open your orders to see the server-confirmed payment and fulfilment status.</GText><Button title="View my orders" onPress={() => router.replace('/orders')}/><Button secondary title="Continue browsing" onPress={() => router.replace('/home')}/></Card></Page>; }
