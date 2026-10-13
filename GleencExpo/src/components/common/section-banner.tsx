import {
    StyleSheet,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppText } from '@/components/ui/app-text';
import { Spacing } from '@/constants/theme';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function SectionHeader({
  title,
  subtitle,
  actionLabel,
  onAction,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.text}>
        <AppText variant="heading3">
          {title}
        </AppText>

        {subtitle ? (
          <AppText
            variant="caption"
            tone="secondary"
          >
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {actionLabel && onAction ? (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          pressedScale={0.92}
          style={styles.action}
        >
          <AppText
            variant="label"
            tone="brand"
          >
            {actionLabel}
          </AppText>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.lg,
  },

  text: {
    flex: 1,
    gap: 3,
  },

  action: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
});