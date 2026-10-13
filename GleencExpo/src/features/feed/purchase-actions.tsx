import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GText } from '@/components/gleenc/text';
import { useAppTheme } from '@/hooks/use-app-theme';
import { PURCHASE_API_VERSION, useFeedState } from './feed-state';
import type { FeedItem } from './data';

/** Quantity selection belongs to Add to Cart; this is only the private price offer. */
export function PurchaseActions({ item, quantity = 1, overlay = false }: { item: FeedItem; quantity?: number; overlay?: boolean }) {
  const { colors } = useAppTheme();
  const feed = useFeedState();
  const ink = overlay ? '#FFFFFF' : colors.text;
  function openOffer() {
    // An older provider must not dispatch to the wrong page or throw an
    // undefined-function error after only the component has been replaced.
    if (feed.purchaseApiVersion !== PURCHASE_API_VERSION || typeof feed.openPurchase !== 'function') {
      Alert.alert('Reload the app', 'The product controls have updated. Fully close the app and reconnect to the restarted development server.');
      return;
    }
    feed.openPurchase('offer', item, quantity);
  }
  if (item.remote && !item.remote.offersEnabled) return null;
  if (item.plan?.allowOffers === false) return null;
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" accessibilityLabel="Make a private price offer, maximum 20 percent discount" disabled={!item.stock} hitSlop={6}
      onPress={openOffer} style={({ pressed }) => [styles.button, { opacity: !item.stock ? .45 : pressed ? .8 : 1, transform: [{ scale: pressed ? .98 : 1 }] }]}>
      <Ionicons name="pricetag-outline" size={20} color={ink} /><GText weight="bold" style={{ color: ink, fontSize: 14, lineHeight: 20 }}>Make offer</GText>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center' }, button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 32, paddingHorizontal: 0, backgroundColor: 'transparent', borderWidth: 0 } });
