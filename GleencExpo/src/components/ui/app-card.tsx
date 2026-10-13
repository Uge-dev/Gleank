import type { ReactNode } from 'react';
import {
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Animated, {
    FadeInDown,
} from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import {
    BorderRadius,
    Spacing,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

type CardVariant =
  | 'elevated'
  | 'outlined'
  | 'filled'
  | 'transparent';

type CardPadding =
  | 'none'
  | 'small'
  | 'medium'
  | 'large';

type AppCardProps = {
  children: ReactNode;
  variant?: CardVariant;
  padding?: CardPadding;
  onPress?: () => void;
  selected?: boolean;
  animated?: boolean;
  animationDelay?: number;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function AppCard({
  children,
  variant = 'elevated',
  padding = 'medium',
  onPress,
  selected = false,
  animated = true,
  animationDelay = 0,
  accessibilityLabel,
  style,
  contentStyle,
}: AppCardProps) {
  const theme = useAppTheme();

  const variantStyles: Record<CardVariant, ViewStyle> = {
    elevated: {
      backgroundColor: theme.colors.surface,
      borderColor: 'transparent',
      ...(theme.shadows.small ?? {}),
    },

    outlined: {
      backgroundColor: theme.colors.background,
      borderColor: theme.colors.border,
    },

    filled: {
      backgroundColor: theme.colors.surfaceSecondary,
      borderColor: theme.colors.surfaceSecondary,
    },

    transparent: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
    },
  };

  const paddingStyles: Record<CardPadding, ViewStyle> = {
    none: {
      padding: 0,
    },
    small: {
      padding: Spacing.sm,
    },
    medium: {
      padding: Spacing.lg,
    },
    large: {
      padding: Spacing.xl,
    },
  };

  const cardStyle: StyleProp<ViewStyle> = [
    styles.card,
    variantStyles[variant],
    selected && {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primaryLight,
    },
    paddingStyles[padding],
    style,
  ];

  const cardContent = onPress ? (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      pressedScale={0.975}
      pressedOpacity={0.88}
      style={cardStyle}
    >
      <View style={contentStyle}>
        {children}
      </View>
    </AnimatedPressable>
  ) : (
    <View style={cardStyle}>
      <View style={contentStyle}>
        {children}
      </View>
    </View>
  );

  if (!animated) {
    return cardContent;
  }

  return (
    <Animated.View
      entering={FadeInDown
        .duration(320)
        .delay(animationDelay)
        .springify()}
    >
      {cardContent}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },
});