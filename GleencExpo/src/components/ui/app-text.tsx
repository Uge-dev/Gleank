import { Text, type TextProps, type TextStyle, type StyleProp } from 'react-native';
import { useAppTheme } from '@/hooks/use-app-theme';

type Variant = 'display' | 'heading1' | 'heading2' | 'heading3' | 'body' | 'bodyMedium' | 'label' | 'button' | 'caption' | 'overline' | 'price';
type Tone = 'primary' | 'secondary' | 'muted' | 'inverse' | 'brand' | 'success' | 'warning' | 'error' | 'info';
type Props = TextProps & { variant?: Variant; tone?: Tone; align?: TextStyle['textAlign']; style?: StyleProp<TextStyle> };
const family: Record<Variant, string> = {
  display: 'ReoSans-Bold', heading1: 'ReoSans-Bold', heading2: 'ReoSans-Bold', heading3: 'ReoSans-Bold',
  body: 'ReoSans-Medium', bodyMedium: 'ReoSans-Medium', label: 'ReoSans-Medium', button: 'ReoSans-Bold',
  caption: 'ReoSans-Light', overline: 'ReoSans-Bold', price: 'ReoSans-Bold',
};
const size: Record<Variant, number> = { display: 34, heading1: 28, heading2: 24, heading3: 20, body: 15, bodyMedium: 16, label: 14, button: 15, caption: 12, overline: 11, price: 20 };
export function AppText({ variant = 'body', tone = 'primary', align, style, ...props }: Props) {
  const { colors } = useAppTheme();
  const map: Record<Tone, string> = { primary: colors.text, secondary: colors.textSecondary, muted: colors.textMuted,
    inverse: colors.textInverse, brand: colors.primary, success: colors.success, warning: colors.warning,
    error: colors.error, info: colors.info };
  return <Text {...props} style={[{ fontFamily: family[variant], fontSize: size[variant], color: map[tone], textAlign: align, includeFontPadding: false }, style]} />;
}
