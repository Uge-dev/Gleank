import { Text, type TextProps } from 'react-native';
import { useAppTheme } from '@/hooks/use-app-theme';

type Props = TextProps & {
  weight?: 'light' | 'medium' | 'bold';
  tone?: 'ink' | 'muted' | 'red' | 'white';
};

export function GText({ weight = 'medium', tone = 'ink', style, ...props }: Props) {
  const { colors } = useAppTheme();
  const color = tone === 'muted' ? colors.textMuted : tone === 'red' ? colors.primary : tone === 'white' ? '#FFFFFF' : colors.text;
  const fontFamily = weight === 'bold' ? 'ReoSans-Bold' : weight === 'light' ? 'ReoSans-Light' : 'ReoSans-Medium';
  return <Text {...props} style={[{ fontFamily, color, includeFontPadding: false }, style]} />;
}
