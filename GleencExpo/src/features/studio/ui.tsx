import { useExperience } from '@/features/experience/experience';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
export type Icon = ComponentProps<typeof Ionicons>['name'];
export function Page({ title, subtitle, children, right }: {
    title: string;
    subtitle?: string;
    children: ReactNode;
    right?: ReactNode;
}) {
    const { colors } = useAppTheme();
    const router = useRouter();
    return <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}><View style={s.header}><Pressable accessibilityLabel="Go back" onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} style={s.tap}><Ionicons name="arrow-back" size={23} color={colors.text}/></Pressable><GText weight="bold" style={{ fontSize: 22, flex: 1 }}>{title}</GText>{right}</View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>{subtitle ? <GText tone="muted" style={{ lineHeight: 21 }}>{subtitle}</GText> : null}{children}</ScrollView></SafeAreaView>;
}
export function Card({ children }: {
    children: ReactNode;
}) {
    const { colors } = useAppTheme();
    const experience = useExperience();
    return <Animated.View entering={experience.reducedMotion ? undefined : FadeInDown.duration(220)} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</Animated.View>;
}
export function Heading({ children }: {
    children: ReactNode;
}) {
    return <GText weight="bold" style={{ fontSize: 19, marginTop: 6 }}>{children}</GText>;
}
export function Button({ title, onPress, secondary = false, disabled = false, icon }: {
    title: string;
    onPress: () => void;
    secondary?: boolean;
    disabled?: boolean;
    icon?: Icon;
}) {
    const { colors } = useAppTheme();
    const ink = secondary ? colors.text : colors.background;
    return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, { backgroundColor: secondary ? colors.surfaceSecondary : colors.text, borderColor: colors.border, opacity: disabled ? .4 : pressed ? .78 : 1, transform: [{ scale: pressed ? .985 : 1 }] }]}>{icon ? <Ionicons name={icon} size={20} color={ink}/> : null}<GText weight="bold" style={{ color: ink, fontSize: 14 }}>{title}</GText></Pressable>;
}
export function Input({ label, value, onChange, placeholder = '', multiline = false, numeric = false, maxLength = 300, secure = false }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    multiline?: boolean;
    numeric?: boolean;
    maxLength?: number;
    secure?: boolean;
}) {
    const { colors } = useAppTheme();
    return <View style={{ gap: 7 }}><GText weight="bold" style={{ fontSize: 12 }}>{label}</GText><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.textMuted} multiline={multiline} maxLength={maxLength} secureTextEntry={secure} keyboardType={numeric ? 'decimal-pad' : 'default'} autoCapitalize="sentences" style={[s.input, { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, multiline && { height: 110, textAlignVertical: 'top' }]}/></View>;
}
export function Row({ title, detail, icon, onPress }: {
    title: string;
    detail?: string;
    icon: Icon;
    onPress: () => void;
}) {
    const { colors } = useAppTheme();
    return <Pressable accessibilityRole="button" onPress={onPress} style={[s.row, { borderColor: colors.border }]}><View style={[s.icon, { backgroundColor: colors.surfaceSecondary }]}><Ionicons name={icon} size={21} color={colors.text}/></View><View style={{ flex: 1, gap: 4 }}><GText weight="bold">{title}</GText>{detail ? <GText tone="muted" style={{ fontSize: 12 }}>{detail}</GText> : null}</View><Ionicons name="chevron-forward" size={17} color={colors.textMuted}/></Pressable>;
}
export function Toggle({ title, detail, value, onChange }: {
    title: string;
    detail?: string;
    value: boolean;
    onChange: (value: boolean) => void;
}) {
    const { colors } = useAppTheme();
    return <View style={s.row}><View style={{ flex: 1, gap: 5 }}><GText weight="bold">{title}</GText>{detail ? <GText tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>{detail}</GText> : null}</View><Switch accessibilityLabel={title} value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: '#258A65' }} thumbColor="#FFFFFF"/></View>;
}
export function Chips({ items, value, onChange }: {
    items: string[];
    value: string;
    onChange: (v: string) => void;
}) {
    const { colors } = useAppTheme();
    return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{items.map(item => <Pressable key={item} accessibilityRole="button" accessibilityState={{ selected: item === value }} onPress={() => onChange(item)} style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 20, backgroundColor: item === value ? colors.text : colors.surfaceSecondary }}><GText weight="bold" style={{ color: item === value ? colors.background : colors.text, fontSize: 12 }}>{item}</GText></Pressable>)}</View>;
}
export function Notice({ text }: {
    text: string;
}) {
    const { colors } = useAppTheme();
    return text ? <View accessibilityRole="alert" style={{ padding: 14, borderRadius: 14, backgroundColor: colors.surfaceSecondary }}><GText style={{ fontSize: 13, lineHeight: 20 }}>{text}</GText></View> : null;
}
export function Picker({ items, value, onChange }: {
    items: {
        id: string;
        title: string;
        detail?: string;
    }[];
    value: string;
    onChange: (id: string) => void;
}) {
    const { colors } = useAppTheme();
    return <View style={{ gap: 8 }}>{items.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ selected: item.id === value }} onPress={() => onChange(item.id)} style={{ minHeight: 54, borderWidth: 1, borderColor: item.id === value ? colors.text : colors.border, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Ionicons name={item.id === value ? 'radio-button-on' : 'radio-button-off'} size={21} color={colors.text}/><View style={{ flex: 1, gap: 4 }}><GText weight="bold">{item.title}</GText>{item.detail ? <GText tone="muted" style={{ fontSize: 12 }}>{item.detail}</GText> : null}</View></Pressable>)}</View>;
}
export function Empty({ title, detail, icon = 'cube-outline' }: {
    title: string;
    detail: string;
    icon?: Icon;
}) {
    const { colors } = useAppTheme();
    return <View style={{ alignItems: 'center', gap: 12, paddingVertical: 48, paddingHorizontal: 14 }}><Ionicons name={icon} size={40} color={colors.textMuted}/><GText weight="bold" style={{ fontSize: 20 }}>{title}</GText><GText tone="muted" style={{ textAlign: 'center', lineHeight: 21 }}>{detail}</GText></View>;
}
const s = StyleSheet.create({ header: { minHeight: 60, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, tap: { width: 40, height: 44, justifyContent: 'center' }, content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 18, paddingBottom: 40, gap: 16 }, card: { padding: 17, borderRadius: 21, borderWidth: 1, gap: 14 }, button: { minHeight: 48, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 }, input: { minHeight: 50, borderRadius: 13, borderWidth: 1, padding: 13, fontSize: 15, fontFamily: 'ReoSans-Medium' }, row: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }, icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' } });
