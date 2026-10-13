import { useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
export function Button({ title, onPress, disabled = false, secondary = false }: {
    title: string;
    onPress: () => void;
    disabled?: boolean;
    secondary?: boolean;
}) { const { colors } = useAppTheme(); return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, { backgroundColor: secondary ? colors.surfaceSecondary : colors.text, opacity: disabled ? .4 : pressed ? .8 : 1, transform: [{ scale: pressed && !disabled ? .985 : 1 }] }]}><GText weight="bold" style={{ color: secondary ? colors.text : colors.background, textAlign: 'center' }}>{title}</GText></Pressable>; }
export function Box({ children }: {
    children: ReactNode;
}) { const { colors } = useAppTheme(); return <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>; }
export function Stepper({ value, onChange, max = 1000, min = 0 }: {
    value: number;
    onChange: (value: number) => void;
    max?: number;
    min?: number;
}) { const { colors } = useAppTheme(); return <View style={[styles.stepper, { borderColor: colors.border }]}><Pressable accessibilityLabel="Decrease quantity" onPress={() => onChange(Math.max(min, value - 1))} style={styles.step}><Ionicons name="remove" size={19} color={colors.text}/></Pressable><GText weight="bold" style={{ minWidth: 24, textAlign: 'center' }}>{value}</GText><Pressable accessibilityLabel="Increase quantity" onPress={() => onChange(Math.min(max, value + 1))} style={styles.step}><Ionicons name="add" size={19} color={colors.text}/></Pressable></View>; }
export function PercentSlider({ value, onChange, min = 1, max = 100 }: {
    value: number;
    onChange: (n: number) => void;
    min?: number;
    max?: number;
}) { const { colors } = useAppTheme(); const [width, setWidth] = useState(1); const start = useRef(0); const move = (x: number) => onChange(Math.max(min, Math.min(max, Math.round(min + Math.max(0, Math.min(width, x)) / width * (max - min))))); const ratio = (value - min) / Math.max(1, max - min); return <View style={{ gap: 8 }}><View accessibilityRole="adjustable" accessibilityLabel="Percentage of listed price" accessibilityValue={{ min, max, now: value }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={e => onChange(Math.max(min, Math.min(max, value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))} onLayout={e => setWidth(e.nativeEvent.layout.width)} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderGrant={e => { start.current = e.nativeEvent.pageX - e.nativeEvent.locationX; move(e.nativeEvent.locationX); }} onResponderMove={e => move(e.nativeEvent.pageX - start.current)} style={{ height: 48, justifyContent: 'center' }}><View pointerEvents="none" style={{ height: 6, borderRadius: 4, backgroundColor: colors.border }}/><View pointerEvents="none" style={{ position: 'absolute', height: 6, width: Math.max(0, ratio * width), backgroundColor: colors.text, borderRadius: 4 }}/><View pointerEvents="none" style={{ position: 'absolute', left: Math.max(0, Math.min(width - 24, ratio * width - 12)), width: 24, height: 24, borderRadius: 12, backgroundColor: colors.text, borderWidth: 3, borderColor: colors.background }}/></View><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><GText tone="muted">{min}%</GText><GText weight="bold">{value}%</GText><GText tone="muted">{max}%</GText></View></View>; }
export const styles = StyleSheet.create({ button: { minHeight: 49, borderRadius: 14, justifyContent: 'center', paddingHorizontal: 15 }, box: { borderWidth: 1, borderRadius: 19, padding: 16, gap: 13 }, stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12 }, step: { minWidth: 38, minHeight: 42, alignItems: 'center', justifyContent: 'center' } });
