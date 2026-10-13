import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/hooks/use-app-theme';

/** Quiet geometric wallpaper behind the message list and conversation. */
export function ConversationPattern() {
  const { isDark } = useAppTheme();
  const ink = isDark ? '#FFFFFF' : '#7B8B91';
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <View style={[styles.ring, styles.ringOne, { borderColor: ink }]} />
    <View style={[styles.ring, styles.ringTwo, { borderColor: ink }]} />
    <View style={[styles.ring, styles.ringThree, { borderColor: ink }]} />
    <Ionicons name="chatbubble-ellipses-outline" size={43} color={ink} style={[styles.symbol, { top: 112, right: 41 }]} />
    <Ionicons name="sparkles-outline" size={31} color={ink} style={[styles.symbol, { top: 345, left: 42 }]} />
    <Ionicons name="heart-outline" size={34} color={ink} style={[styles.symbol, { bottom: 155, right: 50 }]} />
  </View>;
}
const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: 1.5, opacity: 0.085 },
  ringOne: { width: 200, height: 200, borderRadius: 100, right: -95, top: 55 },
  ringTwo: { width: 125, height: 125, borderRadius: 63, left: -59, top: 285 },
  ringThree: { width: 260, height: 260, borderRadius: 130, right: -130, bottom: 25 },
  symbol: { position: 'absolute', opacity: 0.09 },
});
