import { SymbolView } from 'expo-symbols';
import { type PropsWithChildren, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { BorderRadius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

type CollapsibleProps = PropsWithChildren<{
  title: string;
  initiallyOpen?: boolean;
}>;

export function Collapsible({
  children,
  title,
  initiallyOpen = false,
}: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const theme = useAppTheme();

  return (
    <Animated.View
      layout={LinearTransition.springify()}
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        accessibilityLabel={`${isOpen ? 'Collapse' : 'Expand'} ${title}`}
        onPress={() => setIsOpen((currentValue) => !currentValue)}
        style={({ pressed }) => [
          styles.heading,
          pressed && styles.pressedHeading,
        ]}
      >
        <View
          style={[
            styles.iconContainer,
            {
              backgroundColor: theme.colors.surfaceSecondary,
            },
          ]}
        >
          <SymbolView
            name={{
              ios: 'chevron.right',
              android: 'chevron_right',
              web: 'chevron_right',
            }}
            size={16}
            weight="bold"
            tintColor={theme.colors.text}
            style={{
              transform: [
                {
                  rotate: isOpen ? '90deg' : '0deg',
                },
              ],
            }}
          />
        </View>

        <AppText
          variant="bodyMedium"
          style={styles.title}
        >
          {title}
        </AppText>
      </Pressable>

      {isOpen && (
        <Animated.View
          entering={FadeIn.duration(220)}
          exiting={FadeOut.duration(160)}
          style={[
            styles.content,
            {
              borderTopColor: theme.colors.divider,
            },
          ]}
        >
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
  },

  heading: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },

  pressedHeading: {
    opacity: 0.7,
  },

  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },

  title: {
    flex: 1,
  },

  content: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
});