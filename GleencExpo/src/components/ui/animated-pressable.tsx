import type { ReactNode } from 'react';
import {
    Pressable,
    type PressableProps,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

const ReanimatedPressable =
  Animated.createAnimatedComponent(Pressable);

type AnimatedPressableProps = Omit<
  PressableProps,
  'children' | 'style'
> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  pressedOpacity?: number;
  springSpeed?: number;
};

export function AnimatedPressable({
  children,
  style,
  pressedScale = 0.96,
  pressedOpacity = 0.82,
  springSpeed = 18,
  disabled = false,
  onPressIn,
  onPressOut,
  ...pressableProps
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      {
        scale: scale.value,
      },
    ],
  }));

  return (
    <ReanimatedPressable
      {...pressableProps}
      disabled={disabled}
      onPressIn={(event) => {
        scale.value = withSpring(pressedScale, {
          damping: 15,
          stiffness: springSpeed * 10,
          mass: 0.7,
        });

        opacity.value = withTiming(pressedOpacity, {
          duration: 100,
        });

        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withSpring(1, {
          damping: 14,
          stiffness: springSpeed * 10,
          mass: 0.7,
        });

        opacity.value = withTiming(1, {
          duration: 140,
        });

        onPressOut?.(event);
      }}
      style={[
        animatedStyle,
        style,
        disabled && {
          opacity: 0.5,
        },
      ]}
    >
      {children}
    </ReanimatedPressable>
  );
}