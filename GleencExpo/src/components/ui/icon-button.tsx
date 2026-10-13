import type { ReactNode } from 'react';
import {
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppText } from '@/components/ui/app-text';
import { BorderRadius } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

type IconButtonSize = 'small' | 'medium' | 'large';

type IconButtonVariant =
  | 'plain'
  | 'surface'
  | 'outlined'
  | 'dark';

type IconButtonProps = {
  icon: ReactNode;
  onPress?: () => void;
  accessibilityLabel: string;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  disabled?: boolean;
  active?: boolean;
  badgeCount?: number;
  style?: StyleProp<ViewStyle>;
};

const BUTTON_SIZES: Record<IconButtonSize, number> = {
  small: 36,
  medium: 44,
  large: 52,
};

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  size = 'medium',
  variant = 'plain',
  disabled = false,
  active = false,
  badgeCount = 0,
  style,
}: IconButtonProps) {
  const theme = useAppTheme();
  const buttonSize = BUTTON_SIZES[size];

  const variantStyle: Record<
    IconButtonVariant,
    ViewStyle
  > = {
    plain: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
    },

    surface: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.surface,
    },

    outlined: {
      backgroundColor: theme.colors.background,
      borderColor: theme.colors.border,
    },

    dark: {
      backgroundColor: 'rgba(15, 23, 42, 0.72)',
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
  };

  const formattedBadgeCount =
    badgeCount > 99 ? '99+' : String(badgeCount);

  return (
    <View style={styles.wrapper}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{
          disabled,
          selected: active,
        }}
        onPress={onPress}
        disabled={disabled}
        pressedScale={0.88}
        pressedOpacity={0.68}
        style={[
          styles.button,
          {
            width: buttonSize,
            height: buttonSize,
            borderRadius: buttonSize / 2,
          },
          variantStyle[variant],
          active && {
            backgroundColor: theme.colors.primaryLight,
            borderColor: theme.colors.primary,
          },
          disabled && styles.disabled,
          style,
        ]}
      >
        {icon}
      </AnimatedPressable>

      {badgeCount > 0 ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: theme.colors.error,
              borderColor: theme.colors.background,
            },
          ]}
        >
          <AppText
            variant="overline"
            tone="inverse"
            style={styles.badgeText}
          >
            {formattedBadgeCount}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignSelf: 'flex-start',
  },

  button: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  disabled: {
    opacity: 0.45,
  },

  badge: {
    position: 'absolute',
    top: -3,
    right: -5,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },

  badgeText: {
    fontSize: 9,
    lineHeight: 11,
    letterSpacing: 0,
  },
});