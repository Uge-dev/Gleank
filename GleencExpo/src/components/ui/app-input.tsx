import {
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import {
    Pressable,
    StyleSheet,
    TextInput,
    View,
    type StyleProp,
    type TextInputProps,
    type TextStyle,
    type ViewStyle,
} from 'react-native';
import Animated, {
    interpolateColor,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import {
    BorderRadius,
    Spacing,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

type AppInputProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  onRightIconPress?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  required?: boolean;
};

export function AppInput({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  onRightIconPress,
  containerStyle,
  inputStyle,
  required = false,
  editable = true,
  multiline = false,
  onFocus,
  onBlur,
  ...textInputProps
}: AppInputProps) {
  const theme = useAppTheme();
  const [isFocused, setIsFocused] = useState(false);

  const focusProgress = useSharedValue(0);

  useEffect(() => {
    focusProgress.value = withTiming(isFocused ? 1 : 0, {
      duration: 180,
    });
  }, [focusProgress, isFocused]);

  const animatedContainerStyle = useAnimatedStyle(() => {
    const normalBorderColor = error
      ? theme.colors.error
      : theme.colors.border;

    const focusedBorderColor = error
      ? theme.colors.error
      : theme.colors.primary;

    return {
      borderColor: interpolateColor(
        focusProgress.value,
        [0, 1],
        [normalBorderColor, focusedBorderColor],
      ),
      transform: [
        {
          scale: 1 + focusProgress.value * 0.005,
        },
      ],
    };
  });

 const handleFocus: NonNullable<TextInputProps['onFocus']> = (
  event,
) => {
  setIsFocused(true);
  onFocus?.(event);
};

 const handleBlur: NonNullable<TextInputProps['onBlur']> = (
  event,
) => {
  setIsFocused(false);
  onBlur?.(event);
};

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {label ? (
        <View style={styles.labelRow}>
          <AppText variant="label">
            {label}
          </AppText>

          {required ? (
            <AppText variant="label" tone="error">
              {' *'}
            </AppText>
          ) : null}
        </View>
      ) : null}

      <Animated.View
        style={[
          styles.inputContainer,
          {
            minHeight: multiline
              ? 112
              : theme.layout.inputHeight,
            backgroundColor: editable
              ? theme.colors.surface
              : theme.colors.surfaceSecondary,
          },
          multiline && styles.multilineContainer,
          animatedContainerStyle,
        ]}
      >
        {leftIcon ? (
          <View style={styles.leftIcon}>
            {leftIcon}
          </View>
        ) : null}

       <TextInput
  {...textInputProps}
  editable={editable}
  multiline={multiline}
  onFocus={handleFocus}
  onBlur={handleBlur}
  placeholderTextColor={theme.colors.placeholder}
  selectionColor={theme.colors.primary}
  underlineColorAndroid="transparent"
  style={[
    styles.input,
    {
      color: theme.colors.text,
    },
    multiline && styles.multilineInput,
    inputStyle,
  ]}
/>

        {rightIcon ? (
          <Pressable
            accessibilityRole={
              onRightIconPress ? 'button' : undefined
            }
            onPress={onRightIconPress}
            disabled={!onRightIconPress}
            hitSlop={12}
            style={({ pressed }) => [
              styles.rightIcon,
              pressed && styles.pressedIcon,
            ]}
          >
            {rightIcon}
          </Pressable>
        ) : null}
      </Animated.View>

      {error ? (
        <AppText
          variant="caption"
          tone="error"
          accessibilityLiveRegion="polite"
        >
          {error}
        </AppText>
      ) : helperText ? (
        <AppText variant="caption" tone="muted">
          {helperText}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    gap: Spacing.sm,
  },

  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  inputContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
  },

  multilineContainer: {
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
  },

  input: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontSize: 15,
    lineHeight: 21,
  },

  multilineInput: {
    minHeight: 84,
    paddingTop: 0,
    textAlignVertical: 'top',
  },

  leftIcon: {
    marginRight: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rightIcon: {
    marginLeft: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  pressedIcon: {
    opacity: 0.55,
  },
});