import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  ZoomIn,
} from 'react-native-reanimated';

import { AppLogo } from '@/components/common/app-logo';
import { AppButton } from '@/components/ui/app-button';
import { AppCard } from '@/components/ui/app-card';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import {
  BorderRadius,
  Spacing,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

const features = [
  {
    icon: '🛍️',
    title: 'Discover',
    description:
      'Explore products through a social shopping experience.',
  },
  {
    icon: '🏪',
    title: 'Sell',
    description:
      'Create your storefront and reach new buyers.',
  },
  {
    icon: '💸',
    title: 'Earn',
    description:
      'Build income through commerce and future opportunities.',
  },
];

export default function WelcomeScreen() {
  const theme = useAppTheme();

  return (
    <Screen
      scrollable
      edges={['top', 'bottom', 'left', 'right']}
      contentContainerStyle={styles.screen}
    >
      <Animated.View
        entering={FadeInUp.duration(500)}
        style={[
          styles.hero,
          {
            backgroundColor:
              theme.colors.primary,
          },
        ]}
      >
        <View style={styles.circleOne} />
        <View style={styles.circleTwo} />

        <AppLogo
          light
          size={52}
          style={styles.logo}
        />

        <View style={styles.heroText}>
          <AppText
            variant="display"
            tone="inverse"
          >
            Shop. Sell. Earn.
          </AppText>

          <AppText
            variant="body"
            tone="inverse"
            style={styles.heroDescription}
          >
            One social-commerce account for
            everything you do on Gleenc.
          </AppText>
        </View>

        <Animated.View
          entering={ZoomIn
            .delay(250)
            .springify()}
          style={styles.heroIcon}
        >
          <AppText style={styles.heroEmoji}>
            ✨
          </AppText>
        </Animated.View>
      </Animated.View>

      <View style={styles.content}>
        <Animated.View
          entering={FadeInDown
            .delay(150)
            .duration(400)}
          style={styles.featureList}
        >
          {features.map((feature, index) => (
            <AppCard
              key={feature.title}
              variant="outlined"
              animationDelay={index * 90}
              contentStyle={styles.feature}
            >
              <View
                style={[
                  styles.featureIcon,
                  {
                    backgroundColor:
                      theme.colors.primaryLight,
                  },
                ]}
              >
                <AppText style={styles.emoji}>
                  {feature.icon}
                </AppText>
              </View>

              <View style={styles.featureText}>
                <AppText variant="bodyMedium">
                  {feature.title}
                </AppText>

                <AppText
                  variant="caption"
                  tone="secondary"
                >
                  {feature.description}
                </AppText>
              </View>
            </AppCard>
          ))}
        </Animated.View>

        <Animated.View
          entering={FadeInDown
            .delay(400)
            .duration(400)}
          style={styles.actions}
        >
          <AppButton
            title="Create an account"
            onPress={() =>
              router.push('/signup')
            }
          />

          <AppButton
            title="I already have an account"
            variant="outline"
            onPress={() =>
              router.push('/login')
            }
          />
        </Animated.View>

        <AppText
          variant="caption"
          tone="muted"
          align="center"
        >
          By continuing, you agree to Gleenc’s
          Terms and Privacy Policy.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: Spacing.xxl,
  },

  hero: {
    minHeight: 340,
    overflow: 'hidden',
    padding: Spacing.xxl,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    justifyContent: 'space-between',
  },

  circleOne: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor:
      'rgba(255,255,255,0.09)',
    top: -80,
    right: -70,
  },

  circleTwo: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor:
      'rgba(255,255,255,0.07)',
    bottom: -70,
    left: -60,
  },

  logo: {
    zIndex: 1,
  },

  heroText: {
    maxWidth: 300,
    gap: Spacing.md,
    zIndex: 1,
  },

  heroDescription: {
    opacity: 0.9,
  },

  heroIcon: {
    position: 'absolute',
    right: 30,
    bottom: 24,
  },

  heroEmoji: {
    fontSize: 52,
    lineHeight: 60,
  },

  content: {
    padding: Spacing.xl,
    gap: Spacing.xxl,
  },

  featureList: {
    gap: Spacing.md,
  },

  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },

  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emoji: {
    fontSize: 22,
    lineHeight: 28,
  },

  featureText: {
    flex: 1,
    gap: 2,
  },

  actions: {
    gap: Spacing.md,
  },
});