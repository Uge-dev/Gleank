import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
} from 'react-native-reanimated';

import { AppHeader } from '@/components/common/app-header';
import { AppLogo } from '@/components/common/app-logo';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppButton } from '@/components/ui/app-button';
import { AppInput } from '@/components/ui/app-input';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { AppleButton } from '@/components/gleenc/apple-button';
import { GoogleButton } from '@/components/gleenc/google-button';
import { getApiErrorMessage } from '@/services/api-client';
import {
  validateEmail,
  validateRequired,
} from '@/utils/validation';

export default function LoginScreen() {
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] =
    useState('');
  const [showPassword, setShowPassword] =
    useState(false);
  const [isSubmitting, setIsSubmitting] =
    useState(false);
  const [formError, setFormError] =
    useState('');

  const [errors, setErrors] = useState({
    email: '',
    password: '',
  });

  async function handleLogin() {
    if (isSubmitting) return;
    const emailResult = validateEmail(email);
    const passwordResult = validateRequired(
      password,
      'Password',
    );

    setErrors({
      email: emailResult.message ?? '',
      password: passwordResult.message ?? '',
    });

    if (
      !emailResult.valid ||
      !passwordResult.valid
    ) {
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const session=await signIn({ email, password });
      router.replace(!session.user.emailVerified?'/verify-email':session.user.profile?.username?'/home':'/edit-profile');
    } catch (error) {
      setFormError(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Screen
      scrollable
      contentContainerStyle={styles.screen}
    >
      <AppHeader
        title=""
        leftAction={
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <AppText variant="heading3">
              ‹
            </AppText>
          </AnimatedPressable>
        }
      />

      <Animated.View
        entering={FadeInDown.duration(400)}
        style={styles.content}
      >
        <AppLogo size={48} />

        <View style={styles.heading}>
          <AppText variant="heading1">
            Welcome back
          </AppText>

          <AppText
            variant="body"
            tone="secondary"
          >
            Sign in to continue shopping,
            selling and earning.
          </AppText>
        </View>

        <View style={styles.form}>
          <AppInput
            label="Email address"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={errors.email}
            required
          />

          <AppInput
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            error={errors.password}
            rightIcon={
              <AppText
                variant="label"
                tone="brand"
              >
                {showPassword ? 'Hide' : 'Show'}
              </AppText>
            }
            onRightIconPress={() =>
              setShowPassword((value) => !value)
            }
            required
          />

          <AnimatedPressable
            onPress={() =>
              router.push(
                '/forgot-password',
              )
            }
            style={styles.forgotPassword}
          >
            <AppText
              variant="label"
              tone="brand"
            >
              Forgot password?
            </AppText>
          </AnimatedPressable>

          {formError ? (
            <AppText
              variant="caption"
              tone="error"
            >
              {formError}
            </AppText>
          ) : null}

          <AppButton
            title="Sign in"
            onPress={handleLogin}
            loading={isSubmitting}
          />
          <GoogleButton onError={setFormError} /><AppleButton onError={setFormError} />
        </View>

        <View style={styles.footer}>
          <AppText
            variant="body"
            tone="secondary"
          >
            New to Gleenc?
          </AppText>

          <AnimatedPressable
            onPress={() =>
              router.replace('/signup')
            }
          >
            <AppText
              variant="bodyMedium"
              tone="brand"
            >
              Create an account
            </AppText>
          </AnimatedPressable>
        </View>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: Spacing.xxxl,
  },

  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  content: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.xxl,
  },

  heading: {
    gap: Spacing.sm,
  },

  form: {
    gap: Spacing.lg,
  },

  forgotPassword: {
    alignSelf: 'flex-end',
    paddingVertical: Spacing.xs,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
});
