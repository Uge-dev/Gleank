import { FRONTEND_PREVIEW } from '@/config/preview';
import { useLive } from '@/features/live/state';
import { pickUpload } from '@/features/live/media';
import { useEffect, useState, type ComponentProps } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { GText } from '@/components/gleenc/text';
import { Field, Choice } from '@/features/create/controls';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Box, Button } from './ui';
import { localId } from './marketplace-state';
import { offerMinimumPercent, type Plan, type Component } from './domain';
function EditableField(props: ComponentProps<typeof Field>) {
    const [input, setInput] = useState(props.value);
    useEffect(() => { if (props.value !== input && !(Number(props.value) === Number(input)) && !(props.value === 'NaN' && Number.isNaN(Number(input))))
        setInput(props.value); }, [props.value, input]);
    return <Field {...props} value={input} onChange={raw => { setInput(raw); props.onChange(raw); }}/>;
}
export const FORMATS = { item: 'Single item', pack: 'Fixed pack', menu: 'Build from menu', extras: 'Pack with extras' } as const;
export function PlanEditor({ value, onChange }: {
    value: Plan;
    onChange: (plan: Plan) => void;
}) {
    const { colors } = useAppTheme();
    const live=useLive();
    const patch = (p: Partial<Plan>) => onChange({ ...value, minimumPercent: offerMinimumPercent(value), ...p });
    const component = (id: string, p: Partial<Component>) => patch({ components: value.components.map(c => c.id === id ? { ...c, ...p } : c) });
    return <View style={{ gap: 15 }}><GText weight="bold">Ordering format</GText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{(Object.keys(FORMATS) as (keyof typeof FORMATS)[]).map(mode => <Choice key={mode} title={FORMATS[mode]} active={mode === value.mode} onPress={() => patch({ mode, baseKobo: mode === 'menu' ? 0 : value.baseKobo })}/>)}</View>
 <EditableField label="Selling unit" value={value.unit} onChange={unit => patch({ unit })} placeholder="piece, serving spoon, pack or set"/>
 <View style={{ flexDirection: 'row', gap: 9 }}><EditableField label={value.mode === 'menu' ? 'Starting/base amount ₦' : 'Item or pack price ₦'} value={String(value.baseKobo / 100)} onChange={n => patch({ baseKobo: Math.round(Number(n) * 100) })} keyboardType="decimal-pad"/><EditableField label="Available packs/items" value={String(value.stock)} onChange={n => patch({ stock: Number(n) })} keyboardType="number-pad"/></View>
 <EditableField label="Packaging charge ₦" value={String(value.packagingKobo / 100)} onChange={n => patch({ packagingKobo: Math.round(Number(n) * 100) })} keyboardType="decimal-pad"/>
 {value.groups.map((g, index) => <Box key={index}><EditableField label="Group name" value={g.name} onChange={name => patch({ groups: value.groups.map((v, i) => i === index ? { ...v, name } : v), components: value.components.map(c => c.group === g.name ? { ...c, group: name } : c) })}/><View style={{ flexDirection: 'row', gap: 9 }}><EditableField label="Minimum selections" value={String(g.min)} onChange={n => patch({ groups: value.groups.map((v, i) => i === index ? { ...v, min: Number(n) } : v) })} keyboardType="number-pad"/><EditableField label="Maximum selections" value={String(g.max)} onChange={n => patch({ groups: value.groups.map((v, i) => i === index ? { ...v, max: Number(n) } : v) })} keyboardType="number-pad"/></View></Box>)}
 <Button secondary title="Add group" onPress={() => patch({ groups: [...value.groups, { name: 'Group ' + (value.groups.length + 1), min: value.mode === 'menu' && value.groups.length === 0 ? 1 : 0, max: 10 }] })}/>
 {value.components.map((c, index) => <Box key={c.id}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><GText weight="bold">Item {index + 1}</GText><Pressable onPress={() => Alert.alert('Remove item?', 'Existing paid orders keep their contents.', [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => patch({ components: value.components.filter(v => v.id !== c.id) }) }])}><GText tone="red">Remove</GText></Pressable></View><EditableField label="Item name" value={c.name} onChange={name => component(c.id, { name })}/><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{value.groups.map(g => <Choice key={g.name} title={g.name} active={c.group === g.name} onPress={() => component(c.id, { group: g.name })}/>)}</View><EditableField label="Unit" value={c.unit} onChange={unit => component(c.id, { unit })}/><EditableField label="Portion description" value={c.description} onChange={description => component(c.id, { description })}/><View style={{ flexDirection: 'row', gap: 9 }}><EditableField label="Price per unit ₦" value={String(c.priceKobo / 100)} onChange={n => component(c.id, { priceKobo: Math.round(Number(n) * 100) })} keyboardType="decimal-pad"/><EditableField label="Stock" value={String(c.stock)} onChange={n => component(c.id, { stock: Number(n) })} keyboardType="number-pad"/></View><View style={{ flexDirection: 'row', gap: 9 }}><EditableField label="Minimum" value={String(c.min)} onChange={n => component(c.id, { min: Number(n) })} keyboardType="number-pad"/><EditableField label="Maximum" value={String(c.max)} onChange={n => component(c.id, { max: Number(n) })} keyboardType="number-pad"/></View>{FRONTEND_PREVIEW?<EditableField label="Optional HTTPS image" value={c.image??''} onChange={image=>component(c.id,{image})}/>:<Button secondary title={c.photoId?'Change item photo':'Add item photo'} onPress={()=>{void (async()=>{if(!(await live.ensure()))return;const file=await pickUpload('image');if(file)component(c.id,{photoId:file.id,image:file.url||''});})().catch(e=>Alert.alert('Photo unavailable',e instanceof Error?e.message:'Try again.'));}}/>}<View style={{ flexDirection: 'row', gap: 8 }}><Button secondary title={c.available ? 'Available ✓' : 'Unavailable'} onPress={() => component(c.id, { available: !c.available })}/><Button secondary title="Move up" disabled={!index} onPress={() => { const list = [...value.components]; [list[index - 1], list[index]] = [list[index], list[index - 1]]; patch({ components: list }); }}/></View></Box>)}
 <Button secondary title="Add priced item / extra / variant" onPress={() => { const groups = value.groups.length ? value.groups : [{ name: 'Items', min: value.mode === 'menu' ? 1 : 0, max: 10 }]; patch({ groups, components: [...value.components, { id: localId(), name: '', group: groups[0].name, unit: 'piece', description: '', priceKobo: 100000, stock: 20, min: 0, max: 10, available: true }] }); }}/>
 <EditableField label="Preparation time" value={value.preparation} onChange={preparation => patch({ preparation })}/><EditableField label="Ordering hours" value={value.hours} onChange={hours => patch({ hours })}/><EditableField label="Ingredients / pack contents" value={value.ingredients} onChange={ingredients => patch({ ingredients })}/><EditableField label="Allergens" value={value.allergens} onChange={allergens => patch({ allergens })}/>
 <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Choice title={value.takingOrders ? 'Taking orders' : 'Orders paused'} active={value.takingOrders} onPress={() => patch({ takingOrders: !value.takingOrders })}/><Choice title={value.allowOffers ? 'Offers enabled' : 'Fixed prices'} active={value.allowOffers} onPress={() => patch({ allowOffers: !value.allowOffers })}/></View>
 {value.allowOffers ? <EditableField label="Minimum offer: % of asking price" value={String(offerMinimumPercent(value))} onChange={n => patch({ minimumPercent: Number(n) })} keyboardType="number-pad" note="80–100 only. Buyers cannot request more than 20% off. Increase this minimum to allow a smaller discount."/> : null}
 <GText tone="muted" style={{ color: colors.textMuted }}>Delivery and pickup stay in the product's Delivery step.</GText>
 </View>;
}
