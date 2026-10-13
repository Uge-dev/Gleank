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

import { AppButton } from '@/components/ui/app-button';
import { AppText } from '@/components/ui/app-text';
import { Spacing } from '@/constants/theme';

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  style,
}: EmptyStateProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={[styles.container, style]}
    >
      {icon ? (
        <Animated.View
          entering={ZoomIn
            .duration(350)
            .springify()}
          style={styles.icon}
        >
          {icon}
        </Animated.View>
      ) : null}

      <View style={styles.textContainer}>
        <AppText
          variant="heading3"
          align="center"
        >
          {title}
        </AppText>

        {description ? (
          <AppText
            variant="body"
            tone="secondary"
            align="center"
          >
            {description}
          </AppText>
        ) : null}
      </View>

      {actionLabel && onAction ? (
        <View style={styles.actions}>
          <AppButton
            title={actionLabel}
            onPress={onAction}
          />

          {secondaryActionLabel &&
          onSecondaryAction ? (
            <AppButton
              title={secondaryActionLabel}
              onPress={onSecondaryAction}
              variant="ghost"
            />
          ) : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.xxxl,
    gap: Spacing.xl,
  },

  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  textContainer: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.sm,
  },

  actions: {
    width: '100%',
    gap: Spacing.sm,
  },
});