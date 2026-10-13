import { Pressable, StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import type { ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';

export function Field({ label, value, onChange, placeholder = '', multiline = false, keyboardType = 'default', note }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string;
  multiline?: boolean; keyboardType?: KeyboardTypeOptions; note?: string;
}) {
  const { colors } = useAppTheme();
  return <View style={{ gap: 7, flex: 1, minWidth: 110 }}>
    <GText weight="bold" style={styles.label}>{label}</GText>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder}
      placeholderTextColor={colors.placeholder} keyboardType={keyboardType} multiline={multiline}
      style={[styles.input, multiline && { minHeight: 98, textAlignVertical: 'top' }, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, color: colors.text }]}/>
    {note ? <GText tone="muted" style={styles.note}>{note}</GText> : null}
  </View>;
}

export function Choice({ title, active, onPress, icon }: { title: string; active: boolean; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const { colors } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress}
    style={[styles.choice, { borderColor: active ? colors.text : colors.border, backgroundColor: active ? colors.surfaceSecondary : colors.surface }]}>
    {icon ? <Ionicons name={icon} size={18} color={colors.text} /> : null}
    <GText weight={active ? 'bold' : 'medium'} style={{ color: colors.text }}>{title}</GText>
  </Pressable>;
}

const APressable = Animated.createAnimatedComponent(Pressable);
export function Action({ title, onPress, secondary = false, disabled = false, icon }: {
  title: string; onPress: () => void; secondary?: boolean; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useAppTheme();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <APressable accessibilityRole="button" disabled={disabled} onPress={onPress}
    onPressIn={() => { scale.value = withSpring(0.97); }} onPressOut={() => { scale.value = withSpring(1); }}
    style={[styles.action, animated, { backgroundColor: secondary ? colors.surface : colors.text, borderColor: secondary ? colors.border : colors.text, opacity: disabled ? 0.55 : 1 }]}>
    {icon ? <Ionicons name={icon} size={19} color={secondary ? colors.text : colors.background} /> : null}
    <GText weight="bold" style={{ color: secondary ? colors.text : colors.background }}>{title}</GText>
  </APressable>;
}

export function Panel({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>;
}

const styles = StyleSheet.create({
  label: { fontSize: 13 }, note: { fontSize: 11, lineHeight: 16 },
  input: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 12, fontFamily: 'ReoSans-Medium', fontSize: 15, minHeight: 48 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 99, minHeight: 40, paddingHorizontal: 13, paddingVertical: 8 },
  action: { minHeight: 49, borderWidth: 1, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 16 },
  panel: { borderWidth: 1, borderRadius: 19, padding: 17, gap: 14 },
});
