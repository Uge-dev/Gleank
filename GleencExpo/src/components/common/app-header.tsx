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

import { AppText } from '@/components/ui/app-text';
import { Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
  centered?: boolean;
  large?: boolean;
  showBorder?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppHeader({
  title,
  subtitle,
  leftAction,
  rightAction,
  centered = false,
  large = false,
  showBorder = false,
  style,
}: AppHeaderProps) {
  const theme = useAppTheme();

  return (
    <Animated.View
      entering={FadeInDown.duration(280)}
      style={[
        styles.container,
        showBorder && {
          borderBottomWidth:
            StyleSheet.hairlineWidth,
          borderBottomColor:
            theme.colors.divider,
        },
        style,
      ]}
    >
      <View style={styles.side}>
        {leftAction}
      </View>

      <View
        style={[
          styles.titleContainer,
          centered && styles.centered,
        ]}
      >
        <AppText
          variant={
            large ? 'heading1' : 'heading3'
          }
          align={centered ? 'center' : 'left'}
          numberOfLines={1}
        >
          {title}
        </AppText>

        {subtitle ? (
          <AppText
            variant="caption"
            tone="secondary"
            align={centered ? 'center' : 'left'}
            numberOfLines={2}
          >
            {subtitle}
          </AppText>
        ) : null}
      </View>

      <View
        style={[
          styles.side,
          styles.rightSide,
        ]}
      >
        {rightAction}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },

  side: {
    minWidth: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },

  rightSide: {
    alignItems: 'flex-end',
  },

  titleContainer: {
    flex: 1,
    gap: 2,
  },

  centered: {
    alignItems: 'center',
  },
});