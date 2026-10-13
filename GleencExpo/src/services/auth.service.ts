import { api, readSession } from './api';
import { Platform } from 'react-native';
import {
    ApiError,
    apiRequest,
} from '@/services/api-client';
import type {
    ApiMessageResponse,
    AuthApiResponse,
    AuthPayload,
    LoginInput,
    RegisterInput,
} from '@/types';

function extractAuthPayload(
  response: AuthApiResponse,
): AuthPayload {
  const user = response.data?.user ?? response.user;
  const store =
    response.data?.store ?? response.store ?? null;

  if (!user || typeof user.id !== 'string' || typeof user.email !== 'string' || typeof user.name !== 'string') {
    throw new ApiError(
      500,
      'The server returned an invalid account response.',
    );
  }

  return {
    user,
    store,
    emailVerificationRequired:
      response.data?.emailVerificationRequired ??
      response.emailVerificationRequired,
  };
}

export async function getCurrentSession(): Promise<AuthPayload | null> {
  if (Platform.OS !== 'web' && !(await readSession())) return null;
  // The shared endpoint verifies/refreshes the bearer session first.
  const account = await api.account.get();
  const user = account.user;
  if (!user || typeof user !== 'object') throw new ApiError(502, 'Invalid account response.');
  // Existing /auth/me supplies the seller store, using the same bearer session.
  const response = await apiRequest<AuthApiResponse>('/auth/me');
  return extractAuthPayload(response);
}

function extractShared(response: unknown): AuthPayload {
  if (!response || typeof response !== 'object') throw new ApiError(502, 'Invalid account response.');
  return extractAuthPayload(response as AuthApiResponse);
}
export async function login(input: LoginInput) {
  return extractShared(await api.auth.login({
    email: input.email.trim().toLowerCase(), password: input.password,
  }));
}
export async function register(input: RegisterInput) {
  return extractShared(await api.auth.register({
    name: input.name.trim(), email: input.email.trim().toLowerCase(), password: input.password,
  }));
}
export async function loginWithGoogle(_idToken: string): Promise<AuthPayload> {
  throw new ApiError(503, 'Google sign-in will be enabled after its provider configuration is verified.');
}
export async function logout() {
  await api.auth.logout();
}

export async function resendEmailVerification() {
  await api.account.get();
  return apiRequest<ApiMessageResponse>(
    '/auth/resend-verification',
    {
      method: 'POST',
    },
  );
}

export function verifyEmail(token: string) {
  return apiRequest<ApiMessageResponse>(
    '/auth/verify-email',
    {
      method: 'POST',
      body: JSON.stringify({
        token: token.trim(),
      }),
    },
  );
}

export function requestPasswordReset(
  email: string,
) {
  return apiRequest<ApiMessageResponse>(
    '/auth/forgot-password',
    {
      method: 'POST',
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
      }),
    },
  );
}

export function resetPassword(
  token: string,
  password: string,
) {
  return apiRequest<ApiMessageResponse>(
    '/auth/reset-password',
    {
      method: 'POST',
      body: JSON.stringify({
        token: token.trim(),
        password,
      }),
    },
  );
}

export async function exchangeGoogle(credential:{code:string;verifier:string}) {return extractShared(await api.auth.googleExchange(credential));}

export async function exchangeIdentity(credential:Parameters<typeof api.auth.identity>[0]){return extractShared(await api.auth.identity(credential));}
