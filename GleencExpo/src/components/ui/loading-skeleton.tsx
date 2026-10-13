import { useEffect } from 'react';
import {
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

import { BorderRadius } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

type LoadingSkeletonProps = {
  width?: ViewStyle['width'];
  height?: ViewStyle['height'];
  borderRadius?: number;
  circle?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function LoadingSkeleton({
  width = '100%',
  height = 16,
  borderRadius = BorderRadius.sm,
  circle = false,
  style,
}: LoadingSkeletonProps) {
  const theme = useAppTheme();
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 700 }),
        withTiming(0.4, { duration: 700 }),
      ),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius: circle
            ? typeof height === 'number'
              ? height / 2
              : BorderRadius.full
            : borderRadius,
          backgroundColor: theme.colors.disabled,
        },
        animatedStyle,
        style,
      ]}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <View style={styles.productCard}>
      <LoadingSkeleton
        width="100%"
        height={190}
        borderRadius={BorderRadius.lg}
      />

      <View style={styles.productDetails}>
        <LoadingSkeleton width="82%" height={14} />
        <LoadingSkeleton width="55%" height={18} />
        <LoadingSkeleton width="68%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    overflow: 'hidden',
  },

  productCard: {
    width: '48%',
    gap: 10,
  },

  productDetails: {
    gap: 8,
  },
});