import {
    useEffect,
    useMemo,
    useState,
} from 'react';
import {
    StyleSheet,
    View,
    type ImageStyle,
    type StyleProp,
    type ViewStyle
} from 'react-native';
import Animated, {
    FadeIn,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppText } from '@/components/ui/app-text';
import { useAppTheme } from '@/hooks/use-app-theme';

type AvatarProps = {
  name: string;
  imageUri?: string | null;
  size?: number;
  onPress?: () => void;
  showRing?: boolean;
  ringSeen?: boolean;
  online?: boolean;
  verified?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

export function Avatar({
  name,
  imageUri,
  size = 48,
  onPress,
  showRing = false,
  ringSeen = false,
  online = false,
  verified = false,
  accessibilityLabel,
  style,
  imageStyle,
}: AvatarProps) {
  const theme = useAppTheme();

  const [imageFailed, setImageFailed] = useState(false);
  const imageOpacity = useSharedValue(0);

  useEffect(() => {
    setImageFailed(false);
    imageOpacity.value = 0;
  }, [imageOpacity, imageUri]);

  const animatedImageStyle = useAnimatedStyle(() => ({
    opacity: imageOpacity.value,
  }));

  const initials = useMemo(() => {
    const cleanedName = name.trim();

    if (!cleanedName) {
      return 'G';
    }

    return cleanedName
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join('');
  }, [name]);

  const ringPadding = showRing ? 3 : 0;
  const ringGap = showRing ? 2 : 0;

  const outerSize =
    size + (ringPadding + ringGap) * 2;

  const statusSize = Math.max(12, size * 0.28);
  const verifiedSize = Math.max(16, size * 0.34);

  const hasValidImage =
    Boolean(imageUri?.trim()) && !imageFailed;

  const avatarContent = (
    <View
      style={[
        styles.outerContainer,
        {
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          borderWidth: showRing ? ringPadding : 0,
          borderColor: ringSeen
            ? theme.colors.border
            : theme.colors.primary,
          padding: ringGap,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.avatarContainer,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.colors.primaryLight,
          },
        ]}
      >
        <AppText
          variant="button"
          tone="brand"
          style={{
            fontSize: Math.max(12, size * 0.34),
            lineHeight: Math.max(16, size * 0.4),
          }}
        >
          {initials}
        </AppText>

        {hasValidImage ? (
          <Animated.Image
            entering={FadeIn.duration(180)}
            source={{ uri: imageUri! }}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
            onLoad={() => {
              imageOpacity.value = withTiming(1, {
                duration: 220,
              });
            }}
            onError={() => {
              setImageFailed(true);
            }}
            style={[
              styles.image,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
              },
              animatedImageStyle,
              imageStyle,
            ]}
          />
        ) : null}
      </View>

      {online ? (
        <View
          style={[
            styles.onlineIndicator,
            {
              width: statusSize,
              height: statusSize,
              borderRadius: statusSize / 2,
              backgroundColor: theme.colors.success,
              borderColor: theme.colors.background,
            },
          ]}
        />
      ) : null}

      {verified ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={[
            styles.verifiedBadge,
            {
              width: verifiedSize,
              height: verifiedSize,
              borderRadius: verifiedSize / 2,
              backgroundColor: theme.colors.info,
              borderColor: theme.colors.background,
            },
          ]}
        >
          <AppText
            tone="inverse"
            style={{
              fontSize: verifiedSize * 0.58,
              lineHeight: verifiedSize * 0.68,
              fontWeight: '800',
            }}
          >
            ✓
          </AppText>
        </Animated.View>
      ) : null}
    </View>
  );

  if (!onPress) {
    return avatarContent;
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? `Open ${name}'s profile`
      }
      onPress={onPress}
      pressedScale={0.9}
      pressedOpacity={0.75}
    >
      {avatarContent}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarContainer: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },

  image: {
    position: 'absolute',
    top: 0,
    left: 0,
  },

  onlineIndicator: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    borderWidth: 2,
  },

  verifiedBadge: {
    position: 'absolute',
    left: -2,
    bottom: -2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});