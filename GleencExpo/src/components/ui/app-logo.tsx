import { Image, StyleSheet, View } from 'react-native';
import { GText } from '@/components/gleenc/text';
import { Colors } from '@/constants/theme';
type Props = { size?: number; showName?: boolean; light?: boolean };
export function AppLogo({ size = 44, showName = true, light = false }: Props) {
  return <View style={styles.root}><Image source={require('../../assets/images/gleenc-logo.png')} resizeMode="contain" style={{ width: size, height: size, borderRadius: size * 0.2 }} />{showName && <GText weight="bold" style={{ fontSize: size * 0.54, color: light ? '#FFFFFF' : Colors.light.text }}>gleenc</GText>}</View>;
}
const styles = StyleSheet.create({ root: { flexDirection: 'row', alignItems: 'center', gap: 9 } });
