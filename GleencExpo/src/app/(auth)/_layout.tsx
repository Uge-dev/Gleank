import { Stack } from 'expo-router';

import { useAppTheme } from '@/hooks/use-app-theme';

export default function AuthLayout() {
  const theme = useAppTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        contentStyle: {
          backgroundColor:
            theme.colors.background,
        },
      }}
    >
      <Stack.Screen
        name="welcome"
        options={{ animation: 'fade' }}
      />

      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="verify-email" />
    </Stack>
  );
}