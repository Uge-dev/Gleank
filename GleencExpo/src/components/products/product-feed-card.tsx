import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
    Image,
    Modal,
    ScrollView,
    Share,
    StyleSheet,
    View,
} from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppButton } from '@/components/ui/app-button';
import { AppText } from '@/components/ui/app-text';
import { Avatar } from '@/components/ui/avatar';
import { Screen } from '@/components/ui/screen';
import type { DemoProduct } from '@/data/demo-products';
import { useAppTheme } from '@/hooks/use-app-theme';
import { formatKobo } from '@/utils/format-kobo';

type Props = {
  product: DemoProduct;
  compact?: boolean;
};

export function ProductFeedCard({
  product,
  compact = false,
}: Props) {
  const { colors } = useAppTheme();
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [shareError, setShareError] = useState('');

  async function shareProduct() {
    try {
      setShareError('');
      await Share.share({
        message:
          `${product.name} — ${formatKobo(product.priceKobo)}\n` +
          'Sample product from my Gleenc app preview.',
      });
    } catch {
      setShareError('Could not open sharing. Please try again.');
    }
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
        compact && styles.compact,
      ]}
    >
      {!compact && (
        <View style={styles.seller}>
          <Avatar name={product.seller} size={38} />

          <View style={styles.flex}>
            <AppText variant="bodyMedium">
              {product.seller}
            </AppText>
            <AppText variant="caption" tone="secondary">
              {product.location}
            </AppText>
          </View>

          <AppText variant="caption" tone="secondary">
            Sample
          </AppText>
        </View>
      )}

      <AnimatedPressable
        onPress={() => setDetailsOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`View ${product.name}`}
        pressedScale={0.99}
      >
        <View
          style={[
            styles.media,
            { backgroundColor: colors.surfaceSecondary },
          ]}
        >
          {imageFailed ? (
            <Ionicons
              name="image-outline"
              size={44}
              color={colors.textSecondary}
            />
          ) : (
            <Image
              source={{ uri: product.imageUrl }}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
              accessibilityLabel={product.name}
            />
          )}
        </View>
      </AnimatedPressable>

      <View style={styles.body}>
        <View style={styles.actions}>
          <AnimatedPressable
            onPress={() => setLiked((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={liked ? 'Unlike product' : 'Like product'}
            accessibilityState={{ selected: liked }}
            style={styles.action}
          >
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={25}
              color={liked ? colors.error : colors.text}
            />
          </AnimatedPressable>

          {!compact && (
            <>
              <AppText variant="label">
                {product.likes + (liked ? 1 : 0)}
              </AppText>

              <AnimatedPressable
                onPress={shareProduct}
                accessibilityRole="button"
                accessibilityLabel="Share product"
                style={styles.action}
              >
                <Ionicons
                  name="paper-plane-outline"
                  size={23}
                  color={colors.text}
                />
              </AnimatedPressable>
            </>
          )}

          <View style={styles.flex} />

          <AnimatedPressable
            onPress={() => setSaved((value) => !value)}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Unsave product' : 'Save product'}
            accessibilityState={{ selected: saved }}
            style={styles.action}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={23}
              color={saved ? colors.primary : colors.text}
            />
          </AnimatedPressable>
        </View>

        <AppText variant="bodyMedium" numberOfLines={2}>
          {product.name}
        </AppText>

        <AppText variant="price">
          {formatKobo(product.priceKobo)}
        </AppText>

        {!compact && (
          <AppText tone="secondary" numberOfLines={2}>
            {product.description}
          </AppText>
        )}

        {shareError ? (
          <AppText variant="caption" tone="error">
            {shareError}
          </AppText>
        ) : null}
      </View>

      <Modal
        visible={detailsOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailsOpen(false)}
      >
        <Screen edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.seller}>
            <AppText variant="heading3" style={styles.flex}>
              Product details
            </AppText>

            <AnimatedPressable
              onPress={() => setDetailsOpen(false)}
              accessibilityRole="button"
              accessibilityLabel="Close product details"
              style={styles.action}
            >
              <Ionicons
                name="close"
                size={26}
                color={colors.text}
              />
            </AnimatedPressable>
          </View>

          <ScrollView contentContainerStyle={styles.details}>
            <Image
              source={{ uri: product.imageUrl }}
              style={styles.detailImage}
              resizeMode="cover"
              accessibilityLabel={product.name}
            />

            <AppText variant="heading2">
              {product.name}
            </AppText>

            <AppText variant="price">
              {formatKobo(product.priceKobo)}
            </AppText>

            <AppText tone="secondary">
              {product.description}
            </AppText>

            <AppText variant="label">
              Sold by {product.seller}
            </AppText>

            <AppText variant="caption" tone="secondary">
              {product.location} · {product.category}
            </AppText>

            <AppText variant="caption" tone="secondary">
              Preview item. Ordering will be added in the checkout batch.
            </AppText>

            <AppButton
              title={saved ? 'Remove from saved' : 'Save for later'}
              variant="outline"
              onPress={() => setSaved((value) => !value)}
            />
          </ScrollView>
        </Screen>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  compact: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 0,
  },
  seller: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
  },
  media: {
    width: '100%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 16,
    gap: 6,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  action: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    padding: 20,
    gap: 16,
    paddingBottom: 32,
  },
  detailImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 24,
  },
});