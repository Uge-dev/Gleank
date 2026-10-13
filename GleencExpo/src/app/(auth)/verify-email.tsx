import { useAuth } from '@/hooks/use-auth';
import {
  router,
  useLocalSearchParams,
} from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/ui/app-button';
import { AppInput } from '@/components/ui/app-input';
import { AppText } from '@/components/ui/app-text';
import { Screen } from '@/components/ui/screen';
import { Spacing } from '@/constants/theme';
import { getApiErrorMessage } from '@/services/api-client';
import {
  resendEmailVerification,
  verifyEmail,
} from '@/services/auth.service';

export default function VerifyEmailScreen() {
  const { refreshSession } = useAuth();
  const parameters =
    useLocalSearchParams<{ token?: string }>();

  const initialToken = Array.isArray(
    parameters.token,
  )
    ? parameters.token[0] ?? ''
    : parameters.token ?? '';

  const [token, setToken] =
    useState(initialToken);
  const [error, setError] = useState('');
  const [message, setMessage] =
    useState('');
  const [isVerifying, setIsVerifying] =
    useState(false);
  const [isResending, setIsResending] =
    useState(false);

  async function handleVerify() {
    if (token.trim().length < 32) {
      setError(
        'Enter the complete verification token from your email.',
      );
      return;
    }

    setError('');
    setMessage('');
    setIsVerifying(true);

    try {
      await verifyEmail(token);
      await refreshSession();
      router.replace('/edit-profile');
    } catch (verifyError) {
      setError(
        getApiErrorMessage(verifyError),
      );
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    setError('');
    setMessage('');
    setIsResending(true);

    try {
      const response =
        await resendEmailVerification();

      setMessage(
        response.message ||
          'A new verification email was sent.',
      );
    } catch (resendError) {
      setError(
        getApiErrorMessage(resendError),
      );
    } finally {
      setIsResending(false);
    }
  }

  return (
    <Screen
      scrollable
      contentContainerStyle={styles.screen}
    >
      <View style={styles.content}>
        <AppText style={styles.emailIcon}>
          ✉️
        </AppText>

        <View style={styles.heading}>
          <AppText
            variant="heading1"
            align="center"
          >
            Verify your email
          </AppText>

          <AppText
            variant="body"
            tone="secondary"
            align="center"
          >
            Open the verification link sent to
            your email, or paste its token
            below.
          </AppText>
        </View>

        <AppInput
          label="Verification token"
          placeholder="Paste verification token"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          error={error}
          multiline
        />

        {message ? (
          <AppText
            variant="caption"
            tone="success"
            align="center"
          >
            {message}
          </AppText>
        ) : null}

        <View style={styles.actions}>
          <AppButton
            title="Verify email"
            onPress={handleVerify}
            loading={isVerifying}
          />

          <AppButton
            title="Resend verification email"
            variant="ghost"
            onPress={handleResend}
            loading={isResending}
          />
        </View>

        <AppButton
          title="Return to sign in"
          variant="outline"
          onPress={() =>
            router.replace('/login')
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl,
  },

  content: {
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.xxl,
  },

  emailIcon: {
    fontSize: 62,
    lineHeight: 72,
  },

  heading: {
    gap: Spacing.sm,
  },

  actions: {
    width: '100%',
    gap: Spacing.sm,
  },
});