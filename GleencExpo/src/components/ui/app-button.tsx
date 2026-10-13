import type { ReactNode } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import {
  AppText,
} from '@/components/ui/app-text';
import {
    BorderRadius,
    Spacing,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export type AppButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger';

export type AppButtonSize =
  | 'small'
  | 'medium'
  | 'large';

type AppButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  title,
  onPress,
  variant = 'primary',
  size = 'large',
  disabled = false,
  loading = false,
  fullWidth = true,
  leftIcon,
  rightIcon,
  accessibilityLabel,
  style,
}: AppButtonProps) {
  const theme = useAppTheme();

  const isDisabled = disabled || loading;

  const variantStyles: Record<
    AppButtonVariant,
    ViewStyle
  > = {
    primary: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },

    secondary: {
      backgroundColor: theme.colors.surfaceSecondary,
      borderColor: theme.colors.surfaceSecondary,
    },

    outline: {
      backgroundColor: 'transparent',
      borderColor: theme.colors.border,
    },

    ghost: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
    },

    danger: {
      backgroundColor: theme.colors.error,
      borderColor: theme.colors.error,
    },
  };

  const sizeStyles: Record<
    AppButtonSize,
    ViewStyle
  > = {
    small: {
      minHeight: 38,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: BorderRadius.md,
    },

    medium: {
      minHeight: 46,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
    },

    large: {
      minHeight: theme.layout.buttonHeight,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.lg,
    },
  };

  const textTone = {
    primary: 'inverse',
    secondary: 'primary',
    outline: 'primary',
    ghost: 'brand',
    danger: 'inverse',
  } as const;

  const loaderColor: Record<
    AppButtonVariant,
    string
  > = {
    primary: theme.colors.textInverse,
    secondary: theme.colors.text,
    outline: theme.colors.primary,
    ghost: theme.colors.primary,
    danger: theme.colors.textInverse,
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{
        disabled: isDisabled,
        busy: loading,
      }}
      disabled={isDisabled}
      onPress={onPress}
      pressedScale={0.97}
      style={[
        styles.button,
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={loaderColor[variant]}
        />
      ) : (
        <View style={styles.content}>
          {leftIcon ? (
            <View style={styles.icon}>
              {leftIcon}
            </View>
          ) : null}

          <AppText
            variant="button"
            tone={textTone[variant]}
            numberOfLines={1}
          >
            {title}
          </AppText>

          {rightIcon ? (
            <View style={styles.icon}>
              {rightIcon}
            </View>
          ) : null}
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  fullWidth: {
    width: '100%',
  },

  disabled: {
    opacity: 0.5,
  },

  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },

  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});