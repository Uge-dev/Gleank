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
import {
    BorderRadius,
    Spacing,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

type ErrorStateProps = {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ErrorState({
  title = 'Something went wrong',
  message,
  retryLabel = 'Try again',
  onRetry,
  style,
}: ErrorStateProps) {
  const theme = useAppTheme();

  return (
    <Animated.View
      entering={FadeIn.duration(280)}
      style={[styles.container, style]}
    >
      <Animated.View
        entering={ZoomIn
          .duration(320)
          .springify()}
        style={[
          styles.icon,
          {
            backgroundColor:
              theme.colors.errorLight,
          },
        ]}
      >
        <AppText
          tone="error"
          style={styles.iconText}
        >
          !
        </AppText>
      </Animated.View>

      <View style={styles.textContainer}>
        <AppText
          variant="heading3"
          align="center"
        >
          {title}
        </AppText>

        <AppText
          variant="body"
          tone="secondary"
          align="center"
        >
          {message}
        </AppText>
      </View>

      {onRetry ? (
        <AppButton
          title={retryLabel}
          onPress={onRetry}
          fullWidth={false}
          style={styles.button}
        />
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
    padding: Spacing.xxl,
    gap: Spacing.xl,
  },

  icon: {
    width: 68,
    height: 68,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconText: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
  },

  textContainer: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.sm,
  },

  button: {
    minWidth: 150,
  },
});