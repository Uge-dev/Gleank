import {
    StyleSheet,
    type StyleProp,
    type ViewStyle
} from 'react-native';
import Animated, {
    FadeIn,
    ZoomIn,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';

type AppLogoProps = {
  size?: number;
  showName?: boolean;
  light?: boolean;
  animated?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function AppLogo({
  size = 44,
  showName = true,
  light = false,
  animated = true,
  style,
}: AppLogoProps) {
  const theme = useAppTheme();

  return (
    <Animated.View
      entering={
        animated
          ? FadeIn.duration(300)
          : undefined
      }
      style={[styles.container, style]}
    >
      <Animated.View
        entering={
          animated
            ? ZoomIn.duration(350).springify()
            : undefined
        }
        style={[
          styles.mark,
          {
            width: size,
            height: size,
            borderRadius: size * 0.3,
            backgroundColor: light
              ? '#FFFFFF'
              : theme.colors.primary,
          },
        ]}
      >
        <AppText
          tone={light ? 'brand' : 'inverse'}
          style={{
            fontSize: size * 0.54,
            lineHeight: size * 0.62,
            fontWeight: '800',
          }}
        >
          G
        </AppText>
      </Animated.View>

      {showName ? (
        <AppText
          variant="heading2"
          tone={light ? 'inverse' : 'primary'}
          style={styles.name}
        >
          Gleenc
        </AppText>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  mark: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  name: {
    letterSpacing: -0.8,
  },
});