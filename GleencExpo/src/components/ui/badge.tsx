import type { ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  ZoomIn,
} from 'react-native-reanimated';

import {
  AppText,
} from '@/components/ui/app-text';
import {
  BorderRadius,
  Spacing,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export type BadgeVariant =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'dark';

type BadgeSize = 'small' | 'medium';
type BadgeTextTone =
  | 'secondary'
  | 'brand'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'inverse';

type BadgeProps = {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: ReactNode;
  showDot?: boolean;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Badge({
  label,
  variant = 'neutral',
  size = 'medium',
  icon,
  showDot = false,
  animated = true,
  style,
}: BadgeProps) {
  const theme = useAppTheme();

  const backgroundColors: Record<BadgeVariant, string> = {
    neutral: theme.colors.surfaceSecondary,
    brand: theme.colors.primaryLight,
    success: theme.colors.successLight,
    warning: theme.colors.warningLight,
    error: theme.colors.errorLight,
    info: theme.colors.infoLight,
    dark: 'rgba(15, 23, 42, 0.78)',
  };

  const dotColors: Record<BadgeVariant, string> = {
    neutral: theme.colors.textMuted,
    brand: theme.colors.primary,
    success: theme.colors.success,
    warning: theme.colors.warning,
    error: theme.colors.error,
    info: theme.colors.info,
    dark: '#FFFFFF',
  };

  const textTones: Record<
    BadgeVariant,
    BadgeTextTone
  > = {
    neutral: 'secondary',
    brand: 'brand',
    success: 'success',
    warning: 'warning',
    error: 'error',
    info: 'info',
    dark: 'inverse',
  };

  const content = (
    <View
      style={[
        styles.badge,
        size === 'small'
          ? styles.smallBadge
          : styles.mediumBadge,
        {
          backgroundColor: backgroundColors[variant],
        },
        style,
      ]}
    >
      {showDot ? (
        <Animated.View
          entering={animated ? ZoomIn.duration(180) : undefined}
          style={[
            styles.dot,
            {
              backgroundColor: dotColors[variant],
            },
          ]}
        />
      ) : null}

      {icon ? (
        <View style={styles.icon}>
          {icon}
        </View>
      ) : null}

      <AppText
        variant={size === 'small' ? 'overline' : 'label'}
        tone={textTones[variant]}
        numberOfLines={1}
        style={
          size === 'small'
            ? styles.smallText
            : styles.mediumText
        }
      >
        {label}
      </AppText>
    </View>
  );

  if (!animated) {
    return content;
  }

  return (
    <Animated.View entering={FadeIn.duration(180)}>
      {content}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },

  smallBadge: {
    minHeight: 22,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    gap: 5,
  },

  mediumBadge: {
    minHeight: 28,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    gap: Spacing.sm,
  },

  dot: {
    width: 7,
    height: 7,
    borderRadius: BorderRadius.full,
  },

  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  smallText: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.4,
  },

  mediumText: {
    fontSize: 12,
    lineHeight: 16,
  },
});