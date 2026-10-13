import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppHeader } from '@/components/common/app-header';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppButton } from '@/components/ui/app-button';
import { AppInput } from '@/components/ui/app-input';
import { AppText } from '@/components/ui/app-text';
import { EmptyState } from '@/components/ui/empty-state';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { getApiErrorMessage } from '@/services/api-client';
import { requestPasswordReset } from '@/services/auth.service';
import { validateEmail } from '@/utils/validation';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] =
    useState(false);
  const [submitted, setSubmitted] =
    useState(false);

  async function handleSubmit() {
    const result = validateEmail(email);

    if (!result.valid) {
      setError(result.message ?? '');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      await requestPasswordReset(email);
      setSubmitted(true);
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Screen>
        <EmptyState
          icon={
            <AppText style={styles.emailIcon}>
              ✉️
            </AppText>
          }
          title="Check your email"
          description={`If an account exists for ${email}, we have sent password-reset instructions.`}
          actionLabel="Return to sign in"
          onAction={() =>
            router.replace('/login')
          }
        />
      </Screen>
    );
  }

  return (
    <Screen
      scrollable
      contentContainerStyle={styles.screen}
    >
      <AppHeader
        title="Reset password"
        leftAction={
          <AnimatedPressable
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <AppText variant="heading3">
              ‹
            </AppText>
          </AnimatedPressable>
        }
      />

      <View style={styles.content}>
        <View style={styles.heading}>
          <AppText variant="heading1">
            Forgot your password?
          </AppText>

          <AppText
            variant="body"
            tone="secondary"
          >
            Enter your email and we will send
            instructions for creating a new
            password.
          </AppText>
        </View>

        <AppInput
          label="Email address"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          error={error}
          required
        />

        <AppButton
          title="Send reset instructions"
          onPress={handleSubmit}
          loading={isSubmitting}
        />
      </View>
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
    padding: Spacing.xl,
    gap: Spacing.xxl,
  },

  heading: {
    gap: Spacing.sm,
  },

  emailIcon: {
    fontSize: 54,
    lineHeight: 64,
  },
});