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
  validatePassword,
  validateRequired,
} from '@/utils/validation';

export default function SignupScreen() {
  const { signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] =
    useState('');
  const [confirmPassword, setConfirmPassword] =
    useState('');
  const [showPassword, setShowPassword] =
    useState(false);
  const [isSubmitting, setIsSubmitting] =
    useState(false);
  const [formError, setFormError] =
    useState('');

  const [errors, setErrors] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  async function handleSignup() {
    if (isSubmitting) return;
    const nameResult = validateRequired(
      name,
      'Full name',
    );
    const emailResult = validateEmail(email);
    const passwordResult =
      validatePassword(password);

    const confirmError =
      password !== confirmPassword
        ? 'Passwords do not match.'
        : '';

    setErrors({
      name: nameResult.message ?? '',
      email: emailResult.message ?? '',
      password: passwordResult.message ?? '',
      confirmPassword: confirmError,
    });

    if (
      !nameResult.valid ||
      !emailResult.valid ||
      !passwordResult.valid ||
      confirmError
    ) {
      return;
    }

    setIsSubmitting(true);
    setFormError('');

    try {
      const session = await signUp({
        name,
        email,
        password,
      });

      if (session.emailVerificationRequired) {
        router.replace(
          '/verify-email',
        );
        return;
      }

      router.replace('/edit-profile');
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
            Join Gleenc
          </AppText>

          <AppText
            variant="body"
            tone="secondary"
          >
            One account for shopping, selling
            and future earning opportunities.
          </AppText>
        </View>

        <View style={styles.form}>
          <AppInput
            label="Full name"
            placeholder="Enter your full name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            error={errors.name}
            required
          />

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
            placeholder="Create a password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            helperText="Use at least 8 characters, including a letter and number."
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

          <AppInput
            label="Confirm password"
            placeholder="Enter the password again"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            error={errors.confirmPassword}
            required
          />

          {formError ? (
            <AppText
              variant="caption"
              tone="error"
            >
              {formError}
            </AppText>
          ) : null}

          <AppButton
            title="Create account"
            onPress={handleSignup}
            loading={isSubmitting}
          />
          <GoogleButton onError={setFormError} /><AppleButton onError={setFormError} />
        </View>

        <View style={styles.footer}>
          <AppText
            variant="body"
            tone="secondary"
          >
            Already have an account?
          </AppText>

          <AnimatedPressable
            onPress={() =>
              router.replace('/login')
            }
          >
            <AppText
              variant="bodyMedium"
              tone="brand"
            >
              Sign in
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

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
});
